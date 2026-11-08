import { type Anchor, readAnchor } from "./linkAnchor.ts";
import { SCOPE, type StudyPick } from "./selection.ts";

/** The search instance behind the tooltip's link field (apart from the study window's own). */
export const LINK_SEARCH = "link";

/** A verse or a run of verses in OSIS (`John.3.16`, `Gen.1.1-Gen.1.3`), not a whole chapter. */
export const isVerses = (reference: string): boolean =>
  /^\S+\.\d+\.\d+(![a-z])?(-\S+\.\d+\.\d+(![a-z])?)?$/.test(reference);

/** The most characters of selected words a link keeps (apps/api `MAX_QUOTE`). */
export const MAX_QUOTE = 500;

/** apps/api `LinkView`: a link of the user's, seen from the selected passage. */
export interface ScriptureLink {
  id: string;
  quote: string | null;
  anchor: Anchor | null;
  other: { osis: string; label: string };
  end: "source" | "target";
}

/** What a link goes to: a reference as typed, or a passage picked from search results. */
export type LinkTarget = string | { reference: string; translation: string };

/** Where the selected words are pinned, if there's one wording to pin them to. */
function pinned(pick: StudyPick, slug: string): Anchor | undefined {
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
