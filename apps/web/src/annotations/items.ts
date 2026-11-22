import type { Anchor } from "../study/linkAnchor.ts";

/** apps/api `ItemView`: a link or an annotation as the annotations page lists it. */
export interface Item {
  kind: "link" | "annotation";
  id: string;
  quote: string | null;
  anchor: Anchor | null;
  /** The verses its words are in. */
  passage: { osis: string; label: string };
  /** A link's other end; null for an annotation. */
  target: { osis: string; label: string } | null;
  /** An annotation's text, or a link's note. */
  text: string | null;
  collections: string[];
  createdAt: string;
  updatedAt: string;
}

/** A wording words can be pinned in: a translation, or a compilation's own (`@compilation`). */
export interface Wording {
  in: string;
  /** For `@compilation`: whose (its slug); otherwise empty. */
  compilation: string;
  label: string;
}

/**
 * The name of the wording an item's words are pinned in: the translation's abbreviation, or the
 * compilation's ("MINE (your wording)"); null where none is.
 */
export function wordingName(
  anchor: Anchor | null,
  translations: readonly { id: string; abbreviation: string }[],
  compilations: readonly { slug: string; abbreviation: string }[],
  t: (key: "ownWording", values: { abbreviation: string }) => string,
): string | null {
  if (!anchor) return null;
  if (anchor.in !== "@compilation")
    return translations.find((tr) => tr.id === anchor.in)?.abbreviation ?? anchor.in;
  const c = compilations.find((x) => x.slug === anchor.compilation.toLowerCase());
  return t("ownWording", { abbreviation: c?.abbreviation ?? anchor.compilation });
}
