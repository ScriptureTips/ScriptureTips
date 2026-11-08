import { formatOsisPassage } from "@scripturetips/passage";
import { findReferences } from "@scripturetips/reference/light";

/** A reference found in a piece of text. */
export interface ReferenceMatch {
  /** Where it is in the text, and the words as written ("Romans 5:8–10"). */
  readonly start: number;
  readonly end: number;
  readonly text: string;
  /** The passage in OSIS, in the numbering the page uses (`Rom.5.8-Rom.5.10`). */
  readonly osis: string;
  /** Where it starts: the book (OSIS), the chapter and the verse. */
  readonly book: string;
  readonly chapter: number;
  readonly verse: number;
  /**
   * An abbreviation written right after it in the same text, in brackets ("John 3:16 (NLT)"),
   * which may name the translation it's quoted from; null if none. Whether it names one the plugin
   * has is for the tooltip to find out.
   */
  readonly written: string | null;
}

/** What may follow a reference to name its translation: `(NLT)`, `( KJV )`. */
const AFTER = /^\s?\(\s*([A-Za-z][A-Za-z0-9]{1,9})\s*\)/;

/**
 * The references in text, read in the KJV's numbering (domain-model §2.2): the one reading
 * every plugin shares (`@scripturetips/reference`), without the versification tables, so the
 * script stays small. The server converts to canonical and to each translation's numbering.
 */
export function findInText(text: string): ReferenceMatch[] {
  return findReferences(text).map((r) => ({
    written: AFTER.exec(text.slice(r.end))?.[1] ?? null,
    start: r.start,
    end: r.end,
    text: r.text,
    osis: formatOsisPassage(r.entered),
    book: r.entered.start.book,
    chapter: r.entered.start.chapter,
    verse: r.entered.start.verse,
  }));
}
