import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, annotation, compilation, eq, sql, translation } from "@scripturetips/db";
import { formatOsisPassage, toOrdinalRange } from "@scripturetips/passage";
import { formatPassage } from "@scripturetips/reference";
import { passageFromCanonical, type SchemeId } from "@scripturetips/versification";
import type { User } from "../auth/session.ts";
import { CompilationsService } from "../compilations/compilations.service.ts";
import { DATABASE, type Database } from "../database.ts";
import { type Anchor, passageEnd, passageOf, passageStart, passageView } from "../links/words.ts";
import { type PassageVerse, TranslationsService } from "../translations/translations.service.ts";
import { membership, ownCollections, placeIn } from "./membership.ts";

/** An annotation as study mode and the annotations page show it (domain-model §3.4). */
export interface AnnotationView {
  readonly id: string;
  /** The words it was made on, as they read then, and where they're pinned. */
  readonly quote: string | null;
  readonly anchor: Anchor | null;
  /** The verses the words are in: canonical OSIS, and as it reads. */
  readonly passage: { readonly osis: string; readonly label: string };
  readonly body: string;
  /** The collections it's in (their IDs); none is the default collection. */
  readonly collections: readonly string[];
}

/** A wording's verses for re-pinning a copy's words (`wording`). */
export interface WordingView {
  /** The wording: a translation's catalog ID, or `@compilation`. */
  readonly in: string;
  /** The compilation it's read in: the copy's anchor names it. */
  readonly compilation: string;
  readonly abbreviation: string;
  readonly name: string;
  readonly direction: "ltr" | "rtl";
  readonly verses: readonly PassageVerse[];
}

/** The most annotations one passage lists. */
const MOST = 100;

@Injectable()
export class AnnotationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TranslationsService) private readonly translations: TranslationsService,
    @Inject(CompilationsService) private readonly compilations: CompilationsService,
  ) {}

  /**
   * The owner's text on words selected in their compilation `slug` (`source`: the words' verses,
   * canonical OSIS), in the collections given (none: the default collection).
   */
  async create(
    owner: User,
    input: {
      slug: string;
      source: string;
      body: string;
      quote?: string | undefined;
      anchor?: Anchor | undefined;
      collections?: readonly string[] | undefined;
    },
  ): Promise<AnnotationView> {
    const source = passageOf(input.source);
    const [found] = await this.db
      .select({ id: compilation.id })
      .from(compilation)
      .where(
        and(eq(compilation.ownerId, owner.id), eq(compilation.slug, input.slug.toLowerCase())),
      );
    if (!found) throw new NotFoundException({ code: "unknown-compilation" });
    const collections = await ownCollections(this.db, owner, input.collections ?? []);
    const [row] = await this.db
      .insert(annotation)
      .values({
        ownerId: owner.id,
        sourceStart: formatOsisPassage(passageStart(source)),
        sourceEnd: formatOsisPassage(passageEnd(source)),
        sourceRange: toOrdinalRange(source),
        quote: input.quote ?? null,
        anchor: input.anchor ?? null,
        body: input.body.trim(),
      })
      .returning();
    if (!row) throw new Error("the annotation was not saved");
    await placeIn(this.db, "annotation", row.id, collections);
    return annotationView(row, collections);
  }

  /** The owner's annotations on words in `osis` (any overlap), in verse order. */
  async list(owner: User, osis: string): Promise<AnnotationView[]> {
    const range = toOrdinalRange(passageOf(osis));
    const rows = await this.db
      .select()
      .from(annotation)
      .where(
        and(
          eq(annotation.ownerId, owner.id),
          sql`${annotation.sourceRange} && int4range(${range.start}, ${range.end}, '[]')`,
        ),
      )
      .orderBy(sql`lower(${annotation.sourceRange})`, annotation.createdAt)
      .limit(MOST);
    const sets = await membership(
      this.db,
      "annotation",
      rows.map((r) => r.id),
    );
    return rows.map((r) => annotationView(r, sets.get(r.id)));
  }

  /** Changes one of the owner's annotations' text. */
  async update(owner: User, id: string, body: string): Promise<AnnotationView> {
    const [row] = await this.db
      .update(annotation)
      .set({ body: body.trim(), updatedAt: new Date() })
      .where(and(eq(annotation.id, id), eq(annotation.ownerId, owner.id)))
      .returning();
    if (!row) throw new NotFoundException({ code: "unknown-annotation" });
    return annotationView(row, (await membership(this.db, "annotation", [id])).get(id));
  }

  /** Removes one of the owner's annotations (from every collection); anyone else's is missing. */
  async remove(owner: User, id: string): Promise<void> {
    const gone = await this.db
      .delete(annotation)
      .where(and(eq(annotation.id, id), eq(annotation.ownerId, owner.id)))
      .returning({ id: annotation.id });
    if (gone.length === 0) throw new NotFoundException({ code: "unknown-annotation" });
  }

  /**
   * The verses of a canonical passage in one wording, for choosing the words a copy is pinned to:
   * a translation's (`in`: its catalog ID), or one of the owner's compilations' own (`in`:
   * `@compilation`, with its slug), each verse as the compare view shows it.
   */
  async wording(owner: User, osis: string, wordingIn: string, slug: string): Promise<WordingView> {
    const canonical = passageOf(osis);
    if (wordingIn === "@compilation") {
      const [found] = await this.db
        .select({ c: compilation })
        .from(compilation)
        .where(and(eq(compilation.ownerId, owner.id), eq(compilation.slug, slug.toLowerCase())));
      if (!found) throw new NotFoundException({ code: "unknown-compilation" });
      const entered = passageFromCanonical(found.c.scheme as SchemeId, canonical);
      if (!entered) throw new BadRequestException({ code: "not-in-compilation" });
      const read = await this.compilations.passage(owner, slug, formatPassage(entered));
      return {
        in: "@compilation",
        compilation: found.c.slug,
        abbreviation: found.c.abbreviation,
        name: found.c.title,
        direction: read.translation.direction,
        verses: read.passages.flatMap((p) => p.verses),
      };
    }
    const [t] = await this.db
      .select()
      .from(translation)
      .where(eq(translation.catalogId, wordingIn));
    if (!t) throw new NotFoundException({ code: "unknown-translation" });
    const verses = await this.translations.versesOverlapping(t.id, toOrdinalRange(canonical), 50);
    if (verses.length === 0) throw new BadRequestException({ code: "not-in-translation" });
    return {
      in: t.catalogId,
      compilation: slug,
      abbreviation: t.abbreviation,
      name: t.name,
      direction: t.direction,
      // Without `range`: the reader's verses don't carry it.
      verses: verses.map(({ range: _range, ...v }) => v),
    };
  }
}

export function annotationView(
  row: typeof annotation.$inferSelect,
  collections: readonly string[] = [],
): AnnotationView {
  return {
    id: row.id,
    quote: row.quote,
    anchor: row.anchor,
    passage: passageView(row.sourceStart, row.sourceEnd),
    body: row.body,
    collections,
  };
}
