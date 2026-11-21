"use client";

import { useEffect } from "react";
import { collectionShown, DEFAULT_COLLECTION, LAYERS_CHANGED, readLayers } from "./layers.ts";
import { type Anchor, hoverLinks, LINK_HIGHLIGHT, LINK_HOVER, paintLinks } from "./linkAnchor.ts";
import { canonicalSpan } from "./selection.ts";

/** Fired when a link is added or removed, so the marks are drawn again. */
export const LINKS_CHANGED = "st-links-changed";

/** apps/api `LinkView`, as far as drawing the marks needs. */
interface Pinned {
  id: string;
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
    // The links are the default collection's (the user's annotations in no other collection).
    const draw = () =>
      paintLinks(
        document.documentElement,
        slug,
        collectionShown(readLayers(), DEFAULT_COLLECTION) ? links : [],
      );
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
    // With a mouse, the marked words under the pointer are drawn stronger.
    let frame = 0;
    const hover = (e: MouseEvent) => {
      window.cancelAnimationFrame(frame);
      const over = e.target instanceof Element && e.target.closest(".study-tip") === null;
      frame = window.requestAnimationFrame(() =>
        hoverLinks(over ? { x: e.clientX, y: e.clientY } : null),
      );
    };
    const clearHover = () => {
      window.cancelAnimationFrame(frame);
      hoverLinks(null);
    };
    document.addEventListener("mousemove", hover);
    document.addEventListener("mouseleave", clearHover);
    window.addEventListener("scroll", clearHover, true);
    window.addEventListener(LINKS_CHANGED, load);
    window.addEventListener(LAYERS_CHANGED, draw);
    window.addEventListener("resize", draw);
    return () => {
      current = false;
      observer.disconnect();
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousemove", hover);
      document.removeEventListener("mouseleave", clearHover);
      window.removeEventListener("scroll", clearHover, true);
      window.removeEventListener(LINKS_CHANGED, load);
      window.removeEventListener(LAYERS_CHANGED, draw);
      window.removeEventListener("resize", draw);
      if (typeof CSS !== "undefined" && "highlights" in CSS) {
        CSS.highlights.delete(LINK_HIGHLIGHT);
        CSS.highlights.delete(LINK_HOVER);
      }
    };
  }, [slug]);
  return null;
}
