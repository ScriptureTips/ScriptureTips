import { destinationUrl } from "./destination.ts";
import { findInText } from "./find.ts";

/** The class of every link the plugin makes. */
export const LINK_CLASS = "st-ref";
/** The attribute that names a link's passage (OSIS, in the page's numbering). */
export const REF_ATTRIBUTE = "data-st-ref";
/** The attribute that holds the reference's words as written. */
export const TEXT_ATTRIBUTE = "data-st-text";
/** An abbreviation written after the passage in the text ("John 3:16 (NLT)"), if there was one. */
export const WRITTEN_ATTRIBUTE = "data-st-written";
/**
 * A link's own identity, for a page that draws its own links and knows which is which (the study
 * tooltip gives each link's ID). A choice is kept under it, so it follows that link whatever else
 * is on the page; without it, a link is told from others of the same passage by its place among
 * them on the page, which is only right while they're all there to be counted.
 */
export const KEY_ATTRIBUTE = "data-st-key";
/**
 * On links the plugin made, whose address names the translation only because it has to name
 * one: that `t=` is the plugin's own choice, not something the page said, so it isn't read back
 * as the page's wish. A page that draws its own links leaves this off, or puts it on to say the
 * same.
 */
export const AUTO_ATTRIBUTE = "data-st-auto";
/**
 * Which plugin made a link, when it isn't the website plugin: the browser extension marks its
 * links `extension`, so its tooltip and a site's own plugin each show only their own.
 */
export const OWNER_ATTRIBUTE = "data-st-owner";

/**
 * What is never scanned, with everything inside it: links (so none is nested), code and
 * preformatted text, scripts, styles and form fields, anything editable, and what the page marks
 * to be left alone (`.st-ignore`, `[data-st-ignore]`).
 */
const SKIP =
  "a, code, pre, kbd, samp, script, style, noscript, textarea, input, select, option, button, svg, iframe, " +
  "[contenteditable]:not([contenteditable='false']), .st-ignore, [data-st-ignore], .st-host";

export interface ScanOptions {
  readonly destination: string;
  readonly site: string;
  /** The translation a link's address names; its numbering is read by the reader. */
  readonly translation: () => string;
  /** More to leave alone (a CSS selector). */
  readonly ignore?: string | undefined;
  /** Who the links are marked as made by (`OWNER_ATTRIBUTE`); none for the website plugin. */
  readonly owner?: string | undefined;
}

/**
 * Turns the references in a piece of the page into links. Text nodes are read one at a time,
 * so a reference split across elements ("John <b>3</b>:16") isn't found. Links are never made
 * inside links, code, form fields or what's marked to be ignored, and what's already a link is
 * left as it is. Returns the links made, so they can be taken away again (`unlink`).
 */
export function linkReferences(root: Element, options: ScanOptions): HTMLAnchorElement[] {
  const skip = options.ignore ? `${SKIP}, ${options.ignore}` : SKIP;
  const doc = root.ownerDocument;
  // Collected first: linking changes the tree the walk is over.
  const texts: Text[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(skip) || !(node as Text).data.trim()
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  // A root that is itself skipped (inside a link, say) isn't scanned at all.
  if (root.closest(skip)) return [];

  const made: HTMLAnchorElement[] = [];
  for (const node of texts) {
    const found = findInText(node.data);
    if (found.length === 0) continue;
    const fragment = doc.createDocumentFragment();
    let at = 0;
    for (const f of found) {
      if (f.start > at) fragment.append(node.data.slice(at, f.start));
      const a = doc.createElement("a");
      a.className = LINK_CLASS;
      a.href = destinationUrl(options.destination, options.site, options.translation(), f);
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute(REF_ATTRIBUTE, f.osis);
      a.setAttribute(TEXT_ATTRIBUTE, f.text);
      a.setAttribute(AUTO_ATTRIBUTE, "");
      if (options.owner) a.setAttribute(OWNER_ATTRIBUTE, options.owner);
      if (f.written) a.setAttribute(WRITTEN_ATTRIBUTE, f.written);
      a.setAttribute("aria-haspopup", "dialog");
      a.textContent = f.text;
      fragment.append(a);
      made.push(a);
      at = f.end;
    }
    if (at < node.data.length) fragment.append(node.data.slice(at));
    node.replaceWith(fragment);
  }
  return made;
}

/** Puts the page back as it was: each link is replaced by its words. */
export function unlink(links: Iterable<HTMLAnchorElement>): void {
  for (const a of links) {
    if (!a.isConnected) continue;
    a.replaceWith(a.ownerDocument.createTextNode(a.textContent ?? ""));
  }
}
