"use client";

import { useEffect } from "react";
import { type Anchor, LINK_HIGHLIGHT, paintLinks } from "./linkAnchor.ts";
import { canonicalSpan } from "./selection.ts";

/** Fired when a link is added or removed, so the marks are drawn again. */
export const LINKS_CHANGED = "st-links-changed";

/** apps/api `LinkView`, as far as drawing the marks needs. */
interface Pinned {
  quote: string | null;
  anchor: Anchor | null;
}

/**
 * Study mode's marks on the words the user's links are pinned to: asks for the links on the
 * chapter shown, and draws the words each is pinned to with the CSS Custom Highlight API
 * (`::highlight(study-link)`), in the columns showing the wording they were selected in. Draws
 * nothing, silently, where the user isn't signed in or the browser lacks the highlights.
 */
export function StudyLinkMarks({ slug }: { slug: string }) {
  useEffect(() => {
    let links: Pinned[] = [];
    let current = true;
    const draw = () => paintLinks(document.documentElement, slug, links);
    const load = () => {
      // The chapter's verses as the page names them (canonical), first to last.
      const span = canonicalSpan(document.documentElement);
      if (!span) return;
      fetch(`/api/links?ref=${encodeURIComponent(span)}`)
        .then((res) => (res.ok ? (res.json() as Promise<{ links: Pinned[] }>) : null))
        .catch(() => null)
        .then((found) => {
          if (!current || !found) return;
          links = found.links;
          draw();
        });
    };
    load();
    // The table fills in and changes (columns, chapters): draw again once it settles.
    let timer: number | undefined;
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(draw, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener(LINKS_CHANGED, load);
    window.addEventListener("resize", draw);
    return () => {
      current = false;
      observer.disconnect();
      window.clearTimeout(timer);
      window.removeEventListener(LINKS_CHANGED, load);
      window.removeEventListener("resize", draw);
      if (typeof CSS !== "undefined" && "highlights" in CSS) CSS.highlights.delete(LINK_HIGHLIGHT);
    };
  }, [slug]);
  return null;
}
