import { BadRequestException } from "@nestjs/common";
import { type Passage, parseOsisPassage } from "@scripturetips/passage";
import { formatPassage } from "@scripturetips/reference";
import { z } from "zod";

/**
 * What links and annotations share: the words they're made from (a quote, and where it's pinned),
 * the verses those words are in, and how a request names them.
 */

const OSIS_VERSE = "[1-3A-Za-z]{2,10}\\.\\d{1,3}\\.\\d{1,3}(![a-z])?";

/** A canonical passage in OSIS: `Gen.1.1`, `Isa.53.4-Isa.53.6`, `Rev.13.1!a`. */
export const Osis = z.string().regex(new RegExp(`^${OSIS_VERSE}(-${OSIS_VERSE})?$`));

export const TranslationId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

/** A compilation's slug (in the user's own compilations). */
export const CompilationSlug = z.string().regex(/^[a-z0-9]{2,12}$/i);

const Point = z
  .object({
    /** The verse's canonical verses, as the page has them (`Gen.1.1`, or `Gen.1.1 Gen.1.2`). */
    verse: z.string().regex(new RegExp(`^${OSIS_VERSE}( ${OSIS_VERSE})*$`)),
    offset: z.number().int().min(0).max(100_000),
  })
  .strict();

/** The wording the selected words were in (a catalog ID or `@compilation`), and where they sit. */
export const AnchorSchema = z
  .object({
    in: z.string().regex(/^(@compilation|[A-Za-z0-9_-]{1,40})$/),
    compilation: CompilationSlug,
    start: Point,
    end: Point,
  })
  .strict();

/** Words pinned in a wording: `in` is a translation's catalog ID or `@compilation`. */
export type Anchor = z.infer<typeof AnchorSchema>;

/** The most characters of selected words a link or an annotation keeps. */
export const MAX_QUOTE = 500;

export const Quote = z.string().trim().min(1).max(MAX_QUOTE);

/** The most characters of an annotation's text, or a note on a link. */
export const MAX_TEXT = 4000;

/** A canonical OSIS passage from the request, or a 400. */
export function passageOf(osis: string): Passage {
  try {
    return parseOsisPassage(osis);
  } catch {
    throw new BadRequestException({ code: "bad-passage" });
  }
}

export const passageStart = (p: Passage): Passage => ({ start: p.start, end: p.start });
export const passageEnd = (p: Passage): Passage => ({ start: p.end, end: p.end });

export const joinOsis = (start: string, end: string): string =>
  start === end ? start : `${start}-${end}`;

/** A passage as the lists show it: canonical OSIS and its label (`Isaiah 53:4–6`). */
export const passageView = (start: string, end: string): { osis: string; label: string } => {
  const osis = joinOsis(start, end);
  return { osis, label: formatPassage(parseOsisPassage(osis)) };
};

/**
 * The verses an anchor's words are in, as one canonical passage: from the first canonical verse
 * of the verse they start in to the last of the verse they end in.
 */
export function anchorPassage(anchor: Anchor): Passage {
  const first = anchor.start.verse.split(" ")[0] ?? "";
  const last = anchor.end.verse.split(" ").at(-1) ?? "";
  const p = passageOf(joinOsis(first, last));
  if (
    p.start.book !== p.end.book ||
    p.start.chapter * 1000 + p.start.verse > p.end.chapter * 1000 + p.end.verse
  )
    throw new BadRequestException({ code: "bad-passage" });
  return p;
}
