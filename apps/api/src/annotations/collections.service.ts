import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  and,
  annotation,
  annotationCollection,
  annotationCollectionItem,
  asc,
  eq,
  inArray,
  type SQL,
  scriptureLink,
  sql,
} from "@scripturetips/db";
import { formatOsisPassage, toOrdinalRange } from "@scripturetips/passage";
import type { User } from "../auth/session.ts";
import { DATABASE, type Database } from "../database.ts";
import {
  type Anchor,
  anchorPassage,
  passageEnd,
  passageStart,
  passageView,
} from "../links/words.ts";
import { type ItemKind, membership, ownCollections, placeIn } from "./membership.ts";

/** A collection of the user's, with how many links and annotations are in it. */
export interface CollectionView {
  readonly id: string;
  readonly title: string;
  /** The preface for the translation it's printed or published with; null when it has none. */
  readonly description: string | null;
  readonly count: number;
}

/** A description as kept: trimmed, and none when it's empty. */
const described = (text: string | undefined): string | null => text?.trim() || null;

/**
 * A link or an annotation as the annotations page lists it: the words it's on (quote, anchor and
 * their verses), what it says (an annotation's text, or a link's note), where a link goes, and
 * the collections it's in.
 */
export interface ItemView {
  readonly kind: ItemKind;
  readonly id: string;
  readonly quote: string | null;
  readonly anchor: Anchor | null;
  readonly passage: { readonly osis: string; readonly label: string };
  /** A link's other end; null for an annotation. */
  readonly target: { readonly osis: string; readonly label: string } | null;
  /** An annotation's text, or a link's note (null when it has none). */
  readonly text: string | null;
  readonly collections: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Which items the page lists: all of them, the default collection's, or one collection's. */
export type ItemFilter = "all" | "default" | { readonly collection: string };

/** How many items a page of the list has. */
export const PAGE = 200;

/** The columns that pin an item to words: the words, where they're pinned, and their verses. */
function pinnedTo(words: { quote: string; anchor: Anchor }) {
  const p = anchorPassage(words.anchor);
  return {
    sourceStart: formatOsisPassage(passageStart(p)),
    sourceEnd: formatOsisPassage(passageEnd(p)),
    sourceRange: toOrdinalRange(p),
    quote: words.quote,
    anchor: words.anchor,
  };
}

@Injectable()
export class CollectionsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The owner's collections (by title), and how many items are in each and in the default one. */
  async list(
    owner: User,
  ): Promise<{ collections: CollectionView[]; unsorted: number; total: number }> {
    const rows = await this.db
      .select({
        id: annotationCollection.id,
        title: annotationCollection.title,
        description: annotationCollection.description,
        // Named in full: inside the subquery a bare "id" would be the item's.
        count: sql<number>`(select count(*)::int from ${annotationCollectionItem} i where i.collection_id = "annotation_collection"."id")`,
      })
      .from(annotationCollection)
      .where(eq(annotationCollection.ownerId, owner.id))
      .orderBy(asc(annotationCollection.title));
    const [counts] = await this.db.execute<{ unsorted: number; total: number }>(sql`
      select
        (select count(*)::int from ${scriptureLink} l where l.owner_id = ${owner.id}
          and not exists (select 1 from ${annotationCollectionItem} i where i.link_id = l.id))
        + (select count(*)::int from ${annotation} a where a.owner_id = ${owner.id}
          and not exists (select 1 from ${annotationCollectionItem} i where i.annotation_id = a.id))
          as unsorted,
        (select count(*)::int from ${scriptureLink} l where l.owner_id = ${owner.id})
        + (select count(*)::int from ${annotation} a where a.owner_id = ${owner.id}) as total`);
    return {
      collections: rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        count: Number(r.count),
      })),
      unsorted: Number(counts?.unsorted ?? 0),
      total: Number(counts?.total ?? 0),
    };
  }

  async create(owner: User, title: string, description?: string): Promise<CollectionView> {
    const [row] = await this.db
      .insert(annotationCollection)
      .values({ ownerId: owner.id, title: title.trim(), description: described(description) })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new ConflictException({ code: "collection-exists" });
    return { id: row.id, title: row.title, description: row.description, count: 0 };
  }

  async rename(owner: User, id: string, title: string): Promise<CollectionView> {
    const [taken] = await this.db
      .select({ id: annotationCollection.id })
      .from(annotationCollection)
      .where(
        and(
          eq(annotationCollection.ownerId, owner.id),
          eq(annotationCollection.title, title.trim()),
        ),
      );
    if (taken && taken.id !== id) throw new ConflictException({ code: "collection-exists" });
    const [row] = await this.db
      .update(annotationCollection)
      .set({ title: title.trim(), updatedAt: new Date() })
      .where(and(eq(annotationCollection.id, id), eq(annotationCollection.ownerId, owner.id)))
      .returning();
    if (!row) throw new NotFoundException({ code: "unknown-collection" });
    const [count] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(annotationCollectionItem)
      .where(eq(annotationCollectionItem.collectionId, id));
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      count: Number(count?.n ?? 0),
    };
  }

  /**
   * Deletes one of the owner's collections. Its links and annotations stay: those in no other
   * collection are in the default one again.
   */
  async remove(owner: User, id: string): Promise<void> {
    const gone = await this.db
      .delete(annotationCollection)
      .where(and(eq(annotationCollection.id, id), eq(annotationCollection.ownerId, owner.id)))
      .returning({ id: annotationCollection.id });
    if (gone.length === 0) throw new NotFoundException({ code: "unknown-collection" });
  }

  /**
   * A page of the owner's links and annotations (`PAGE` from `from`), in verse order (the verses
   * their words are in), then oldest first; `more` when there are more after it.
   */
  async items(
    owner: User,
    filter: ItemFilter,
    from = 0,
  ): Promise<{ items: ItemView[]; more: boolean }> {
    if (typeof filter === "object") await ownCollections(this.db, owner, [filter.collection]);
    const inFilter = (column: "link_id" | "annotation_id", id: SQL): SQL =>
      filter === "all"
        ? sql`true`
        : filter === "default"
          ? sql`not exists (select 1 from ${annotationCollectionItem} i where i.${sql.raw(column)} = ${id})`
          : sql`exists (select 1 from ${annotationCollectionItem} i where i.${sql.raw(column)} = ${id} and i.collection_id = ${filter.collection})`;
    const page = await this.db.execute<{ kind: ItemKind; id: string }>(sql`
      select kind, id from (
        select 'link' as kind, l.id, lower(l.source_range) as at, l.created_at
          from ${scriptureLink} l
          where l.owner_id = ${owner.id} and ${inFilter("link_id", sql`l.id`)}
        union all
        select 'annotation' as kind, a.id, lower(a.source_range) as at, a.created_at
          from ${annotation} a
          where a.owner_id = ${owner.id} and ${inFilter("annotation_id", sql`a.id`)}
      ) items
      order by at, created_at, id
      limit ${PAGE + 1} offset ${from}`);
    const listed = [...page].slice(0, PAGE);
    const views = await this.views(listed);
    return {
      items: listed.flatMap((r) => views.get(`${r.kind}:${r.id}`) ?? []),
      more: page.length > PAGE,
    };
  }

  /** One of the owner's items as listed, or a 404. */
  async item(owner: User, kind: ItemKind, id: string): Promise<ItemView> {
    await this.owned(owner, kind, id);
    const view = (await this.views([{ kind, id }])).get(`${kind}:${id}`);
    if (!view) throw new NotFoundException({ code: `unknown-${kind}` });
    return view;
  }

  /**
   * Puts one of the owner's items in exactly these collections of theirs (none: the default
   * collection). Adding to a collection, taking out of one and moving between them are all this.
   */
  async place(
    owner: User,
    kind: ItemKind,
    id: string,
    collections: readonly string[],
  ): Promise<ItemView> {
    await this.owned(owner, kind, id);
    await placeIn(this.db, kind, id, await ownCollections(this.db, owner, collections));
    return this.item(owner, kind, id);
  }

  /**
   * A copy of one of the owner's items, of its own (editing one doesn't change the other), in
   * these collections. With `words`, the copy is pinned to other words (in another wording, chosen
   * by the user), and its verses are theirs.
   */
  async copy(
    owner: User,
    kind: ItemKind,
    id: string,
    input: {
      collections: readonly string[];
      words?: { quote: string; anchor: Anchor } | undefined;
    },
  ): Promise<ItemView> {
    const collections = await ownCollections(this.db, owner, input.collections);
    const moved = input.words ? pinnedTo(input.words) : {};
    let made: string;
    if (kind === "link") {
      const [row] = await this.db
        .select()
        .from(scriptureLink)
        .where(and(eq(scriptureLink.id, id), eq(scriptureLink.ownerId, owner.id)));
      if (!row) throw new NotFoundException({ code: "unknown-link" });
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = row;
      const [copy] = await this.db
        .insert(scriptureLink)
        .values({ ...rest, ...moved })
        .returning({ id: scriptureLink.id });
      if (!copy) throw new Error("the copy was not saved");
      made = copy.id;
    } else {
      const [row] = await this.db
        .select()
        .from(annotation)
        .where(and(eq(annotation.id, id), eq(annotation.ownerId, owner.id)));
      if (!row) throw new NotFoundException({ code: "unknown-annotation" });
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = row;
      const [copy] = await this.db
        .insert(annotation)
        .values({ ...rest, ...moved })
        .returning({ id: annotation.id });
      if (!copy) throw new Error("the copy was not saved");
      made = copy.id;
    }
    await placeIn(this.db, kind, made, collections);
    return this.item(owner, kind, made);
  }

  /**
   * Moves one of the owner's items onto other words (in another wording, chosen by the user): the
   * same item, in the same collections, with its verses theirs.
   */
  async repin(
    owner: User,
    kind: ItemKind,
    id: string,
    words: { quote: string; anchor: Anchor },
  ): Promise<ItemView> {
    const changes = { ...pinnedTo(words), updatedAt: new Date() };
    const [row] =
      kind === "link"
        ? await this.db
            .update(scriptureLink)
            .set(changes)
            .where(and(eq(scriptureLink.id, id), eq(scriptureLink.ownerId, owner.id)))
            .returning({ id: scriptureLink.id })
        : await this.db
            .update(annotation)
            .set(changes)
            .where(and(eq(annotation.id, id), eq(annotation.ownerId, owner.id)))
            .returning({ id: annotation.id });
    if (!row) throw new NotFoundException({ code: `unknown-${kind}` });
    return this.item(owner, kind, id);
  }

  /**
   * Takes one of the owner's items out of a collection (`from`: its ID, or `default` for the
   * collection of items in no other), and deletes it once no collection holds it. With `keep`, it's
   * never deleted: one that would be left in no collection is refused (`last-collection`, 409)
   * and nothing changes. The item's row is locked first, so two of these for one item run one
   * after the other.
   */
  async takeOut(
    owner: User,
    kind: ItemKind,
    id: string,
    from: string,
    keep: boolean,
  ): Promise<{ deleted: boolean; collections: string[] }> {
    const table = kind === "link" ? scriptureLink : annotation;
    const column =
      kind === "link" ? annotationCollectionItem.linkId : annotationCollectionItem.annotationId;
    if (from !== "default") await ownCollections(this.db, owner, [from]);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.id, id), eq(table.ownerId, owner.id)))
        .for("update");
      if (!row) throw new NotFoundException({ code: `unknown-${kind}` });
      if (from !== "default")
        await tx
          .delete(annotationCollectionItem)
          .where(and(eq(column, id), eq(annotationCollectionItem.collectionId, from)));
      const left = await tx
        .select({ collection: annotationCollectionItem.collectionId })
        .from(annotationCollectionItem)
        .where(eq(column, id))
        .orderBy(asc(annotationCollectionItem.createdAt));
      if (left.length > 0) return { deleted: false, collections: left.map((r) => r.collection) };
      if (keep) throw new ConflictException({ code: "last-collection" });
      await tx.delete(table).where(eq(table.id, id));
      return { deleted: true, collections: [] };
    });
  }

  /** A 404 unless the item is the owner's. */
  private async owned(owner: User, kind: ItemKind, id: string): Promise<void> {
    const table = kind === "link" ? scriptureLink : annotation;
    const [row] = await this.db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, id), eq(table.ownerId, owner.id)));
    if (!row) throw new NotFoundException({ code: `unknown-${kind}` });
  }

  /** The items' views, by `kind:id`. */
  private async views(
    items: readonly { kind: ItemKind; id: string }[],
  ): Promise<Map<string, ItemView>> {
    const ids = (kind: ItemKind) => items.filter((i) => i.kind === kind).map((i) => i.id);
    const links = ids("link").length
      ? await this.db
          .select()
          .from(scriptureLink)
          .where(inArray(scriptureLink.id, ids("link")))
      : [];
    const notes = ids("annotation").length
      ? await this.db
          .select()
          .from(annotation)
          .where(inArray(annotation.id, ids("annotation")))
      : [];
    const linkSets = await membership(this.db, "link", ids("link"));
    const noteSets = await membership(this.db, "annotation", ids("annotation"));
    const found = new Map<string, ItemView>();
    for (const l of links)
      found.set(`link:${l.id}`, {
        kind: "link",
        id: l.id,
        quote: l.quote,
        anchor: l.anchor,
        passage: passageView(l.sourceStart, l.sourceEnd),
        target: passageView(l.targetStart, l.targetEnd),
        text: l.note,
        collections: linkSets.get(l.id) ?? [],
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
      });
    for (const a of notes)
      found.set(`annotation:${a.id}`, {
        kind: "annotation",
        id: a.id,
        quote: a.quote,
        anchor: a.anchor,
        passage: passageView(a.sourceStart, a.sourceEnd),
        target: null,
        text: a.body,
        collections: noteSets.get(a.id) ?? [],
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      });
    return found;
  }
}
