import { NotFoundException } from "@nestjs/common";
import {
  and,
  annotationCollection,
  annotationCollectionItem,
  eq,
  inArray,
} from "@scripturetips/db";
import type { User } from "../auth/session.ts";
import type { Database } from "../database.ts";

/** The two kinds of the user's annotations (domain-model §3.6): a link, or their own text. */
export type ItemKind = "link" | "annotation";

const column = (kind: ItemKind) =>
  kind === "link" ? annotationCollectionItem.linkId : annotationCollectionItem.annotationId;

/** The collections each of these items is in (collection IDs, oldest first), by item ID. */
export async function membership(
  db: Database,
  kind: ItemKind,
  ids: readonly string[],
): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  if (ids.length === 0) return found;
  const rows = await db
    .select({ item: column(kind), collection: annotationCollectionItem.collectionId })
    .from(annotationCollectionItem)
    .where(inArray(column(kind), [...ids]))
    .orderBy(annotationCollectionItem.createdAt);
  for (const r of rows) if (r.item) found.set(r.item, [...(found.get(r.item) ?? []), r.collection]);
  return found;
}

/** The owner's collections among `ids`, or a 404 naming the first that isn't theirs. */
export async function ownCollections(
  db: Database,
  owner: User,
  ids: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await db
    .select({ id: annotationCollection.id })
    .from(annotationCollection)
    .where(
      and(eq(annotationCollection.ownerId, owner.id), inArray(annotationCollection.id, unique)),
    );
  if (rows.length !== unique.length) throw new NotFoundException({ code: "unknown-collection" });
  return unique;
}

/**
 * Puts an item (already checked to be the owner's) in exactly these collections (already checked
 * to be the owner's): it joins the ones it isn't in and leaves the others. None is the default
 * collection.
 */
export async function placeIn(
  db: Database,
  kind: ItemKind,
  item: string,
  collections: readonly string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const now = await tx
      .select({ collection: annotationCollectionItem.collectionId })
      .from(annotationCollectionItem)
      .where(eq(column(kind), item));
    const had = new Set(now.map((r) => r.collection));
    const leaving = [...had].filter((c) => !collections.includes(c));
    if (leaving.length > 0)
      await tx
        .delete(annotationCollectionItem)
        .where(
          and(eq(column(kind), item), inArray(annotationCollectionItem.collectionId, leaving)),
        );
    const joining = collections.filter((c) => !had.has(c));
    if (joining.length > 0)
      await tx
        .insert(annotationCollectionItem)
        .values(
          joining.map((collectionId) =>
            kind === "link" ? { collectionId, linkId: item } : { collectionId, annotationId: item },
          ),
        );
  });
}
