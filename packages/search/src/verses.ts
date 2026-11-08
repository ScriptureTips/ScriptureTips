import type { PassageVerse } from "./types.ts";

/** A verse or a run of verses in OSIS (`John.3.16`, `Gen.1.1-Gen.1.3`): what picking can show. */
export const isVerseRange = (reference: string): boolean =>
  /^\S+\.\d+\.\d+(![a-z])?(-\S+\.\d+\.\d+(![a-z])?)?$/.test(reference);

/** The words of verse content (the API's inline markup) as plain text: no notes or headings. */
export function plainText(content: unknown): string {
  const text = (node: unknown): string => {
    if (typeof node === "string") return node;
    if (!node || typeof node !== "object") return "";
    const n = node as { type?: string; content?: unknown };
    if (n.type === "note" || n.type === "heading") return "";
    if (n.type === "block") return " ";
    return Array.isArray(n.content) ? n.content.map(text).join("") : "";
  };
  return (Array.isArray(content) ? content.map(text).join("") : text(content))
    .replace(/¶/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** What the API's passage gives of a verse, as the widget shows it. */
export function passageVerse(v: {
  verse: number;
  to: number | null;
  published: string | null;
  content: unknown;
}): PassageVerse {
  // A psalm's heading is verse 0, and has no number.
  const number =
    v.verse === 0 ? "" : (v.published ?? (v.to ? `${v.verse}–${v.to}` : String(v.verse)));
  return { number, text: plainText(v.content) };
}
