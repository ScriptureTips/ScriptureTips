"use client";

import {
  createScriptureLinks,
  KEY_ATTRIBUTE,
  LINK_CLASS,
  REF_ATTRIBUTE,
  readMoreUrl,
  TEXT_ATTRIBUTE,
} from "@scripturetips/scripture-links";
import { useEffect } from "react";

/**
 * The website plugin's passage tooltip (`@scripturetips/scripture-links`) for the `PassageLink`s
 * on the page while it's mounted (in its modals too): hovered, focused or tapped, each shows its
 * passage, with the translation switcher and *Read more*. Nothing is scanned: the links are drawn
 * as such. The references are canonical, and the answers come from our own `/api/widget`. Mount
 * one per page: two would each open a tooltip for the same link.
 */
export function PassageTips({ translation }: { translation: string }) {
  useEffect(() => {
    const tips = createScriptureLinks({ api: "/api", scheme: "canonical", translation });
    return () => tips.destroy();
  }, [translation]);
  return null;
}

/**
 * A passage drawn as one of the plugin's links (`PassageTips` shows its text). It opens in what
 * the viewer last chose for this link (kept under `id`, if given), else in `translation`, which
 * its address names as the page's own choice.
 */
export function PassageLink({
  osis,
  label,
  translation,
  id,
}: {
  /** Canonical OSIS. */
  osis: string;
  label: string;
  /** A catalog translation: the tooltip's, and where *Read more* (and the link) opens it. */
  translation: string;
  /** The link's own identity, so a choice made on it stays with it. */
  id?: string;
}) {
  return (
    <a
      className={LINK_CLASS}
      href={readMoreUrl(location.origin, translation, label)}
      target="_blank"
      rel="noopener"
      aria-haspopup="dialog"
      {...{
        [REF_ATTRIBUTE]: osis,
        [TEXT_ATTRIBUTE]: label,
        ...(id ? { [KEY_ATTRIBUTE]: id } : {}),
      }}
    >
      {label}
    </a>
  );
}
