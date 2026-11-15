import { findInText, type ReferenceMatch } from "@scripturetips/scripture-links";
import type { LinkFormat } from "./settings.ts";

/**
 * What is already a link (or markup) in each format, so nothing is linked twice or inside a tag:
 * HTML links and tags, BBCode `[url]…[/url]`, Markdown `[text](url)`, wiki `[url text]`, and bare
 * web addresses.
 */
const ALREADY = [
  /<a\b[\s\S]*?<\/a\s*>/gi,
  /<[^>]*>/g,
  /\[url\b[^\]]*\][\s\S]*?\[\/url\]/gi,
  /\[[^\]\n]*\]\([^)\n]*\)/g,
  /\[https?:\/\/[^\]\n]*\]/gi,
  /https?:\/\/\S+/gi,
];

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One link, written in the format. */
export function link(format: LinkFormat, text: string, url: string): string {
  switch (format) {
    case "html":
      // Always a new tab, so the reader keeps the page they were on (`noopener` so the new tab can't
      // reach back into it). Only HTML can say so: the other formats have no way to.
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
    case "bbcode":
      return `[url=${url}]${text}[/url]`;
    case "wiki":
      return `[${url} ${text}]`;
    case "markdown":
      return `[${text}](${url.replace(/[()]/g, encodeURIComponent)})`;
  }
}

/**
 * The link generator (vision §3.6): the text with each scripture reference made a link, in the
 * format the reader writes in (HTML, BBCode, wiki or Markdown). References already inside a link,
 * a tag or a web address are left as they are, so running it twice changes nothing.
 */
export function linkText(
  text: string,
  format: LinkFormat,
  address: (ref: ReferenceMatch) => string,
): string {
  const taken: [number, number][] = [];
  for (const pattern of ALREADY)
    for (const m of text.matchAll(pattern)) taken.push([m.index, m.index + m[0].length]);
  const free = (r: ReferenceMatch) => !taken.some(([start, end]) => r.start < end && r.end > start);

  let out = "";
  let at = 0;
  for (const ref of findInText(text).filter(free)) {
    out += text.slice(at, ref.start) + link(format, ref.text, address(ref));
    at = ref.end;
  }
  return out + text.slice(at);
}
