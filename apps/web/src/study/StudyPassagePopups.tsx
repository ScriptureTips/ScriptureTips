"use client";

import { AUTO_ATTRIBUTE, createScriptureLinks } from "@scripturetips/scripture-links";
import { useEffect } from "react";

/** What the study tooltip's links say of their own address: it names a translation because it must. */
export const AUTO_LINK = { [AUTO_ATTRIBUTE]: "" } as const;

/**
 * The website plugin's tooltip (`@scripturetips/scripture-links`) on our own pages: any link
 * with the plugin's class (`a.st-ref`, as the study tooltip's list of links draws them) shows
 * its passage when hovered, focused or tapped, with the translation switcher and *Read more*.
 * The links are drawn by their owners, so nothing is scanned (`run` isn't called). The references
 * are canonical (the links are stored so, domain-model §2.2), and the answers come from our own
 * `/api/widget`.
 *
 * Which translation a passage opens in: what the viewer last chose for it (kept in their browser),
 * else their own default, their first favorite, else the compilation's base.
 */
export function StudyPassagePopups({ base, favorite }: { base: string; favorite?: string }) {
  useEffect(() => {
    const popups = createScriptureLinks({ api: "/api", scheme: "canonical", translation: base });
    if (favorite) popups.setPreferences({ translation: favorite });
    return () => popups.destroy();
  }, [base, favorite]);
  return null;
}
