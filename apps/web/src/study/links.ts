import { type Anchor, readAnchor } from "./linkAnchor.ts";
import { SCOPE, type StudyPick } from "./selection.ts";

/** The search instance behind the tooltip's link field (apart from the study window's own). */
export const LINK_SEARCH = "link";

/** A verse or a run of verses in OSIS (`John.3.16`, `Gen.1.1-Gen.1.3`), not a whole chapter. */
export const isVerses = (reference: string): boolean =>
  /^\S+\.\d+\.\d+(![a-z])?(-\S+\.\d+\.\d+(![a-z])?)?$/.test(reference);

/** The most characters of selected words a link keeps (apps/api `MAX_QUOTE`). */
export const MAX_QUOTE = 500;

/** What a link goes to: a reference as typed, or a passage picked from search results. */
export type LinkTarget = string | { reference: string; translation: string };

/** Where the selected words are pinned, if there's one wording to pin them to. */
export function pinned(pick: StudyPick, slug: string): Anchor | undefined {
  if (pick.text.length > MAX_QUOTE) return undefined;
  const node = pick.range.commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  const scope = element?.closest(SCOPE);
  return (scope && readAnchor(scope, pick.range, slug)) || undefined;
}

/**
 * Links the selected words to a passage, in the compilation `slug` they were selected in (the
 * API keeps the quoted words and where they're pinned). The response is the API's: `ok` with
 * the link, or its error.
 */
export function postLink(slug: string, pick: StudyPick, target: LinkTarget): Promise<Response> {
  return fetch("/api/links", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      compilation: slug,
      source: pick.source,
      target,
      quote: pick.text.slice(0, MAX_QUOTE),
      // The words are pinned only if the whole quote is kept.
      anchor: pinned(pick, slug),
    }),
  });
}

/**
 * Keeps the user's text on the selected words, in the compilation `slug` they were selected in
 * (with the quoted words and where they're pinned, as a link keeps them). The response is the
 * API's: `ok` with the annotation, or its error.
 */
export function postAnnotation(slug: string, pick: StudyPick, body: string): Promise<Response> {
  return fetch("/api/annotations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      compilation: slug,
      source: pick.source,
      body,
      quote: pick.text.slice(0, MAX_QUOTE),
      anchor: pinned(pick, slug),
    }),
  });
}

/** The most characters of an annotation's text, or a link's note (apps/api `MAX_TEXT`). */
export const MAX_TEXT = 4000;
