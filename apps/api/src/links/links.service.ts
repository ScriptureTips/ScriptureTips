import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, compilation, eq, scriptureLink, sql, translation } from "@scripturetips/db";
import {
  formatOsisPassage,
  type Passage,
  parseOsisPassage,
  toOrdinalRange,
} from "@scripturetips/passage";
import { formatPassage, parseReference } from "@scripturetips/reference";
import type { SchemeId } from "@scripturetips/versification";
import type { User } from "../auth/session.ts";
import { DATABASE, type Database } from "../database.ts";
import { TranslationsService } from "../translations/translations.service.ts";

/** Words pinned in a wording: `in` is a translation's catalog ID or `@compilation`. */
export interface Anchor {
  readonly in: string;
  readonly compilation: string;
  readonly start: { readonly verse: string; readonly offset: number };
  readonly end: { readonly verse: string; readonly offset: number };
}

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
   * stored, and what was entered with its scheme).
   */
  async create(
    owner: User,
    input: {
      slug: string;
      source: string;
      target: string;
      quote?: string | undefined;
      anchor?: Anchor | undefined;
    },
  ): Promise<LinkView> {
    const source = passageOf(input.source);
    const [found] = await this.db
      .select({ c: compilation, base: translation })
      .from(compilation)
      .innerJoin(translation, eq(translation.id, compilation.baseTranslationId))
      .where(
        and(eq(compilation.ownerId, owner.id), eq(compilation.slug, input.slug.toLowerCase())),
      );
    if (!found) throw new NotFoundException({ code: "unknown-compilation" });

    const counts = await this.translations.verseCounts(found.base.id);
    const scheme = found.c.scheme as SchemeId;
    const parsed = parseReference(input.target, { scheme, verses: counts });
    if (!parsed.ok)
      throw new BadRequestException({ code: parsed.error.code, index: parsed.error.index });
    const [ref, ...more] = parsed.references;
    if (!ref || more.length > 0) throw new BadRequestException({ code: "one-passage" });
    if (!ref.canonical) throw new BadRequestException({ code: "not-in-canon" });
    const target = ref.canonical;

    const sourceRange = toOrdinalRange(source);
    const targetRange = toOrdinalRange(target);
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
        enteredRef: input.target.trim(),
        quote: input.quote ?? null,
        anchor: input.anchor ?? null,
      })
      .returning();
    if (!row) throw new Error("the link was not saved");
    return viewOf(row, "source");
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
    return rows.map((row) => {
      const fromSource = row.sourceRange.start <= range.end && range.start <= row.sourceRange.end;
      return viewOf(row, fromSource ? "source" : "target");
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

/** A canonical OSIS passage from the request, or a 400. */
function passageOf(osis: string): Passage {
  try {
    return parseOsisPassage(osis);
  } catch {
    throw new BadRequestException({ code: "bad-passage" });
  }
}

const passageStart = (p: Passage): Passage => ({ start: p.start, end: p.start });
const passageEnd = (p: Passage): Passage => ({ start: p.end, end: p.end });

/** The end of the link that isn't `end`, as the list shows it. */
function viewOf(row: typeof scriptureLink.$inferSelect, end: "source" | "target"): LinkView {
  const otherOsis =
    end === "source"
      ? joinOsis(row.targetStart, row.targetEnd)
      : joinOsis(row.sourceStart, row.sourceEnd);
  return {
    id: row.id,
    quote: row.quote,
    anchor: row.anchor,
    other: { osis: otherOsis, label: formatPassage(parseOsisPassage(otherOsis)) },
    end,
  };
}

const joinOsis = (start: string, end: string) => (start === end ? start : `${start}-${end}`);
