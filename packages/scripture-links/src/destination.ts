import { english } from "@scripturetips/reference/light";
import type { ReferenceMatch } from "./find.ts";

/** The name that means the ScriptureTips reader (the default). */
export const SCRIPTURETIPS = "scripturetips";

/**
 * Where a link to a reference goes. `scripturetips` is the reader on the site, which reads the
 * reference in the translation's own numbering and goes on to its address (`/read?t=&ref=`);
 * anything else is a URL template with these placeholders: `ST_REFERENCE` (as written on the
 * page), `ST_TRANSLATION`, `ST_BOOKNAME` (English), `ST_CHAPTER` and `ST_VERSE` (where it
 * starts). Each is URL-encoded.
 */
export function destinationUrl(
  destination: string,
  site: string,
  translation: string,
  ref: Pick<ReferenceMatch, "text" | "book" | "chapter" | "verse">,
): string {
  const template =
    destination === SCRIPTURETIPS
      ? `${site.replace(/\/$/, "")}/read?t=ST_TRANSLATION&ref=ST_REFERENCE`
      : destination;
  const values: Record<string, string> = {
    ST_REFERENCE: ref.text,
    ST_TRANSLATION: translation,
    ST_BOOKNAME: english.name(ref.book, "full", "one"),
    ST_CHAPTER: String(ref.chapter),
    ST_VERSE: String(ref.verse),
  };
  return template.replace(/ST_(?:REFERENCE|TRANSLATION|BOOKNAME|CHAPTER|VERSE)/g, (name) =>
    encodeURIComponent(values[name] ?? ""),
  );
}

/** Where *Read more* goes: the passage as the translation numbers it, on the site's reader. */
export const readMoreUrl = (site: string, translation: string, label: string): string =>
  `${site.replace(/\/$/, "")}/read?${new URLSearchParams({ t: translation, ref: label })}`;
