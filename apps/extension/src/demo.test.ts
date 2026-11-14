import { readFileSync } from "node:fs";
import { findInText } from "@scripturetips/scripture-links";
import { describe, expect, it } from "vitest";

/**
 * The demo pages (apps/extension/demo, served at dev.scripture.tips/demo by the development
 * stack) are for trying the extension on a page that is written like anyone else's.
 */
const demo = (name: string) => readFileSync(new URL(`../demo/${name}`, import.meta.url), "utf8");

/** What a reader sees: the page's words, without its tags, styles or comments. */
const wordsOf = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

describe("vision §3.6: the extension's demo pages", () => {
  it.each(["index.html", "jonah.html"])("%s carries no ScriptureTips script", (name) => {
    const html = demo(name);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/scripturetips\.js|ScriptureTips\.run|st-search/i);
  });

  it("the Jonah entry has many different references for the extension to link", () => {
    const found = findInText(wordsOf(demo("jonah.html")));
    const osis = found.map((f) => f.osis);
    // Lots of references, in books of both testaments and in several of the ways people write them.
    expect(found.length).toBeGreaterThanOrEqual(60);
    expect(new Set(found.map((f) => f.book)).size).toBeGreaterThanOrEqual(20);
    expect(osis).toEqual(
      expect.arrayContaining([
        "Jonah.1.1-Jonah.1.2",
        "Jonah.1.1-Jonah.2.10",
        "Jonah.3.10-Jonah.4.1",
        "Jonah.4.4",
        "Jonah.4.9",
        "Matt.12.38-Matt.12.42",
        "Luke.11.29-Luke.11.32",
        "Matt.16.1-Matt.16.4",
        "Mark.8.11-Mark.8.12",
        "John.3.16",
        "1Kgs.19.4",
        "2Kgs.14.25",
        "1Cor.15.3-1Cor.15.4",
      ]),
    );
    // Written with a translation after it, which the link uses.
    expect(found.filter((f) => f.written).map((f) => [f.text, f.written])).toEqual([
      ["John 3:16", "KJV"],
      ["Romans 9:15", "BSB"],
    ]);
  });

  it("has what the extension leaves alone: a link, code and a field", () => {
    const html = demo("jonah.html");
    expect(html).toMatch(/<a href="#commentary">Matthew 12:40<\/a>/);
    expect(html).toMatch(/<pre><code>[\s\S]*Jonah 1:17[\s\S]*<\/code><\/pre>/);
    expect(html).toMatch(/<textarea[^>]*>[^<]*John 1:1[^<]*<\/textarea>/);
  });
});
