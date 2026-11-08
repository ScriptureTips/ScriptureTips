import { type Passage, passage, type VerseRef, verseRef } from "@scripturetips/passage";
import {
  passageToCanonical,
  type SchemeId,
  schemeById,
  toCanonical,
} from "@scripturetips/versification";
import type { Versification } from "./parse.ts";

/**
 * The canonical passage. "Psalm 151" names its own book, but a scheme that numbers it as
 * Psalm 151 (the Greek) maps it from there.
 */
function canonicalOf(scheme: SchemeId, entered: Passage): Passage | undefined {
  const canonical = passageToCanonical(scheme, entered);
  if (canonical || entered.start.book !== "AddPs" || !schemeById(scheme)?.books.has("Ps"))
    return canonical;
  const asPsalm = (ref: VerseRef) => verseRef("Ps", 151, ref.verse, ref.part);
  if (toCanonical(scheme, asPsalm(entered.start)).refs.length === 0) return undefined;
  return passageToCanonical(scheme, passage(asPsalm(entered.start), asPsalm(entered.end)));
}

/** The real versification tables (`@scripturetips/versification`): the package's main entry uses these. */
export const versification: Versification = {
  hasBook: (scheme, book) => schemeById(scheme)?.books.has(book) ?? false,
  canonical: canonicalOf,
};
