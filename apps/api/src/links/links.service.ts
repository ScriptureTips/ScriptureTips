import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, compilation, eq, scriptureLink, sql, translation } from "@scripturetips/db";
import { formatOsisPassage, type Passage, toOrdinalRange } from "@scripturetips/passage";
import { formatPassage, parseReference } from "@scripturetips/reference";
import { passageToCanonical, type SchemeId } from "@scripturetips/versification";
import { membership, ownCollections, placeIn } from "../annotations/membership.ts";
import type { User } from "../auth/session.ts";
import { DATABASE, type Database } from "../database.ts";
import { TranslationsService } from "../translations/translations.service.ts";
import { type Anchor, passageEnd, passageOf, passageStart, passageView } from "./words.ts";

export type { Anchor } from "./words.ts";

/**
 * What a link goes to: a reference as the user typed it, in the numbering of the compilation
 * they're reading, or a passage picked from search results, in that translation's numbering.
 */
export type LinkTarget = string | { readonly reference: string; readonly translation: string };

/** A link as the study tooltip lists it, seen from the passage that was asked about. */
export interface LinkView {
  readonly id: string;
  /** The words the link was made from, as they read then, and where they're pinned. */
  readonly quote: string | null;
  readonly anchor: Anchor | null;
  /** The passage at the other end, canonical OSIS (`Isa.53.4-Isa.53.6`) and as it reads. */
  readonly other: { readonly osis: string; readonly label: string };
  /** Which end the asked passage is: a link made from it, or one made to it. */
  readonly end: "source" | "target";
  /** The user's note on the link, if any. */
  readonly note: string | null;
  /** The collections it's in (their IDs); none is the default collection. */
  readonly collections: readonly string[];
}

/** The most links one passage lists. */
const MOST = 100;

@Injectable()
export class LinksService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TranslationsService) private readonly translations: TranslationsService,
  ) {}

  /**
   * Links `source` (canonical OSIS, the words' verses) to `target`, typed as a reference in the
   * numbering of the compilation the reader was in (domain-model §2.2: the canonical passage is
   * stored, and what was entered with its scheme), with a note if one is given, in the
   * collections given (none: the default collection).
   */
  async create(
    owner: User,
    input: {
      slug: string;
      source: string;
      target: LinkTarget;
      quote?: string | undefined;
      anchor?: Anchor | undefined;
      note?: string | undefined;
      collections?: readonly string[] | undefined;
    },
  ): Promise<LinkView> {
    const source = passageOf(input.source);
    const found = await this.compilationOf(owner, input.slug);
    const collections = await ownCollections(this.db, owner, input.collections ?? []);

    const { target, scheme, entered } = await this.resolve(input.target, found);

    const sourceRange = toOrdinalRange(source);
    const targetRange = toOrdinalRange(target);
    // The same words (in the same wording) linked to the same passage again, with no note, is the
    // link already there: it joins the collections given and keeps the ones it's in. With a note
    // it's a link of its own (the note is never written over).
    const [same] = input.note
      ? []
      : await this.db
          .select()
          .from(scriptureLink)
          .where(
            and(
              eq(scriptureLink.ownerId, owner.id),
              eq(scriptureLink.sourceStart, formatOsisPassage(passageStart(source))),
              eq(scriptureLink.sourceEnd, formatOsisPassage(passageEnd(source))),
              eq(scriptureLink.targetStart, formatOsisPassage(passageStart(target))),
              eq(scriptureLink.targetEnd, formatOsisPassage(passageEnd(target))),
              input.quote === undefined
                ? sql`${scriptureLink.quote} IS NULL`
                : eq(scriptureLink.quote, input.quote),
              // The same words in another wording are another link.
              sql`coalesce(${scriptureLink.anchor}->>'in', '') = ${input.anchor?.in ?? ""}`,
            ),
          );
    if (same) {
      const had = (await membership(this.db, "link", [same.id])).get(same.id) ?? [];
      const now = [...new Set([...had, ...collections])];
      if (now.length > had.length) await placeIn(this.db, "link", same.id, now);
      return viewOf(same, "source", now);
    }
    const [row] = await this.db
      .insert(scriptureLink)
      .values({
        ownerId: owner.id,
        sourceStart: formatOsisPassage(passageStart(source)),
        sourceEnd: formatOsisPassage(passageEnd(source)),
        sourceRange,
        targetStart: formatOsisPassage(passageStart(target)),
        targetEnd: formatOsisPassage(passageEnd(target)),
        targetRange,
        enteredScheme: scheme,
        enteredRef: entered,
        quote: input.quote ?? null,
        anchor: input.anchor ?? null,
        note: input.note?.trim() || null,
      })
      .returning();
    if (!row) throw new Error("the link was not saved");
    await placeIn(this.db, "link", row.id, collections);
    return viewOf(row, "source", collections);
  }

  /**
   * Changes one of the owner's links: its note (null or empty removes it), or the passage it goes
   * to, typed in the numbering of the compilation `slug` or picked from search results.
   */
  async update(
    owner: User,
    id: string,
    input: { note?: string | null | undefined; target?: LinkTarget | undefined; slug?: string },
  ): Promise<LinkView> {
    const [row] = await this.db
      .select()
      .from(scriptureLink)
      .where(and(eq(scriptureLink.id, id), eq(scriptureLink.ownerId, owner.id)));
    if (!row) throw new NotFoundException({ code: "unknown-link" });
    const changes: Partial<typeof scriptureLink.$inferInsert> = { updatedAt: new Date() };
    if (input.note !== undefined) changes.note = input.note?.trim() ? input.note.trim() : null;
    if (input.target !== undefined) {
      const found = await this.compilationOf(owner, input.slug ?? row.anchor?.compilation ?? "");
      const { target, scheme, entered } = await this.resolve(input.target, found);
      Object.assign(changes, {
        targetStart: formatOsisPassage(passageStart(target)),
        targetEnd: formatOsisPassage(passageEnd(target)),
        targetRange: toOrdinalRange(target),
        enteredScheme: scheme,
        enteredRef: entered,
      });
    }
    const [updated] = await this.db
      .update(scriptureLink)
      .set(changes)
      .where(eq(scriptureLink.id, id))
      .returning();
    if (!updated) throw new NotFoundException({ code: "unknown-link" });
    return viewOf(updated, "source", (await membership(this.db, "link", [id])).get(id));
  }

  /** The owner's compilation `slug`, with its base translation, or a 404. */
  private async compilationOf(owner: User, slug: string) {
    const [found] = await this.db
      .select({ c: compilation, base: translation })
      .from(compilation)
      .innerJoin(translation, eq(translation.id, compilation.baseTranslationId))
      .where(and(eq(compilation.ownerId, owner.id), eq(compilation.slug, slug.toLowerCase())));
    if (!found) throw new NotFoundException({ code: "unknown-compilation" });
    return found;
  }

  /** The target's canonical passage, the scheme it was in, and how it was entered. */
  private async resolve(
    target: LinkTarget,
    found: { c: typeof compilation.$inferSelect; base: typeof translation.$inferSelect },
  ): Promise<{ target: Passage; scheme: SchemeId; entered: string }> {
    if (typeof target === "string") {
      const counts = await this.translations.verseCounts(found.base.id);
      const scheme = found.c.scheme as SchemeId;
      const parsed = parseReference(target, { scheme, verses: counts });
      if (!parsed.ok)
        throw new BadRequestException({ code: parsed.error.code, index: parsed.error.index });
      const [ref, ...more] = parsed.references;
      if (!ref || more.length > 0) throw new BadRequestException({ code: "one-passage" });
      if (!ref.canonical) throw new BadRequestException({ code: "not-in-canon" });
      return { target: ref.canonical, scheme, entered: target.trim() };
    }
    // From search results: a passage in its translation's own numbering.
    const [picked] = await this.db
      .select()
      .from(translation)
      .where(eq(translation.catalogId, target.translation));
    if (!picked) throw new BadRequestException({ code: "unknown-translation" });
    const scheme = picked.scheme as SchemeId;
    const entered = passageOf(target.reference);
    const canonical = passageToCanonical(scheme, entered);
    if (!canonical) throw new BadRequestException({ code: "not-in-canon" });
    return { target: canonical, scheme, entered: formatPassage(entered) };
  }

  /** The owner's links with `osis` at either end (any overlap), newest first. */
  async list(owner: User, osis: string): Promise<LinkView[]> {
    const range = toOrdinalRange(passageOf(osis));
    const within = (column: typeof scriptureLink.sourceRange | typeof scriptureLink.targetRange) =>
      sql`${column} && int4range(${range.start}, ${range.end}, '[]')`;
    const rows = await this.db
      .select()
      .from(scriptureLink)
      .where(
        and(
          eq(scriptureLink.ownerId, owner.id),
          sql`(${within(scriptureLink.sourceRange)} OR ${within(scriptureLink.targetRange)})`,
        ),
      )
      .orderBy(sql`${scriptureLink.createdAt} DESC`)
      .limit(MOST);
    const sets = await membership(
      this.db,
      "link",
      rows.map((r) => r.id),
    );
    return rows.map((row) => {
      const fromSource = row.sourceRange.start <= range.end && range.start <= row.sourceRange.end;
      return viewOf(row, fromSource ? "source" : "target", sets.get(row.id));
    });
  }

  /** Removes one of the owner's links; anyone else's is as good as missing. */
  async remove(owner: User, id: string): Promise<void> {
    const gone = await this.db
      .delete(scriptureLink)
      .where(and(eq(scriptureLink.id, id), eq(scriptureLink.ownerId, owner.id)))
      .returning({ id: scriptureLink.id });
    if (gone.length === 0) throw new NotFoundException({ code: "unknown-link" });
  }
}

/** The end of the link that isn't `end`, as the list shows it. */
export function viewOf(
  row: typeof scriptureLink.$inferSelect,
  end: "source" | "target",
  collections: readonly string[] = [],
): LinkView {
  return {
    id: row.id,
    quote: row.quote,
    anchor: row.anchor,
    other:
      end === "source"
        ? passageView(row.targetStart, row.targetEnd)
        : passageView(row.sourceStart, row.sourceEnd),
    end,
    note: row.note,
    collections,
  };
}
