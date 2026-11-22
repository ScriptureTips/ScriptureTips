import { errorCode } from "../compilations/errors.ts";
import type { Anchor } from "../study/linkAnchor.ts";
import type { Wording } from "./items.ts";

/** A request with a JSON body (or none). */
export function send(url: string, method: string, body?: object): Promise<Response> {
  return fetch(url, {
    method,
    ...(body
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
}

/** A wording's key in a select: `in|compilation` (a translation's compilation is empty). */
export const wordingKey = (w: { in: string; compilation: string }): string =>
  `${w.in}|${w.in === "@compilation" ? w.compilation.toLowerCase() : ""}`;

/** The wording an anchor's words are in, as a key (`wordingKey`). */
export const anchorWording = (anchor: Anchor): string =>
  wordingKey({ in: anchor.in, compilation: anchor.compilation });

/**
 * The verses an anchor's words are in, canonical OSIS: from the first canonical verse of the verse
 * they start in to the last of the verse they end in (as the API reads it, `anchorPassage`).
 */
export function anchorSource(anchor: Anchor): string {
  const first = anchor.start.verse.split(" ")[0] ?? "";
  const last = anchor.end.verse.split(" ").at(-1) ?? "";
  return first === last ? first : `${first}-${last}`;
}

/** A passage typed in a wording's numbering, found: canonical, and as entered (OSIS), or why not. */
export type Found =
  | { ok: true; canonical: string; entered: string; label: string }
  | { ok: false; code: string };

/** Finds one passage typed as a reference, in a translation's or a compilation's numbering. */
export async function findPassage(wording: Wording, typed: string): Promise<Found> {
  const ref = encodeURIComponent(typed.trim());
  const url =
    wording.in === "@compilation"
      ? `/api/compilations/${encodeURIComponent(wording.compilation)}/passages?ref=${ref}`
      : `/api/translations/${encodeURIComponent(wording.in)}/passages?ref=${ref}`;
  const res = await fetch(url).catch(() => null);
  if (!res) return { ok: false, code: "unavailable" };
  if (!res.ok) return { ok: false, code: await errorCode(res) };
  const body = (await res.json()) as {
    passages: { canonical: string | null; entered: string; label: string }[];
  };
  const [p, ...more] = body.passages;
  if (!p || more.length > 0) return { ok: false, code: "one-passage" };
  if (!p.canonical) return { ok: false, code: "not-in-canon" };
  return { ok: true, canonical: p.canonical, entered: p.entered, label: p.label };
}

/**
 * Where a link goes, typed in the numbering of the wording its words are in: a translation's
 * (found first, then sent as picked there) or a compilation's (sent as typed, with the
 * compilation, whose numbering the API reads it in).
 */
export async function linkTarget(
  wording: Wording,
  typed: string,
): Promise<
  | { ok: true; target: string | { reference: string; translation: string }; compilation?: string }
  | { ok: false; code: string }
> {
  if (wording.in === "@compilation")
    return { ok: true, target: typed.trim(), compilation: wording.compilation };
  const found = await findPassage(wording, typed);
  if (!found.ok) return found;
  return { ok: true, target: { reference: found.entered, translation: wording.in } };
}
