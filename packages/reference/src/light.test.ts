import { describe, expect, it } from "vitest";
import { findReferences, parseReference } from "./light.ts";

describe("the light entry (website plugin, browser extension)", () => {
  it("finds references in running text, in the KJV's numbering, without converting them", () => {
    const text = "As Paul says in Romans 5:8–10, and John 3:16, God loved.";
    const found = findReferences(text);
    expect(found.map((r) => r.text)).toEqual(["Romans 5:8–10", "John 3:16"]);
    expect(found.map((r) => [r.start, r.end])).toEqual([
      [text.indexOf("Romans"), text.indexOf("Romans") + "Romans 5:8–10".length],
      [text.indexOf("John"), text.indexOf("John") + "John 3:16".length],
    ]);
    // The server converts: the light entry leaves the canonical passage out.
    expect(found.every((r) => r.canonical === undefined)).toBe(true);
    expect(found[1]?.entered.start).toMatchObject({ book: "John", chapter: 3, verse: 16 });
  });

  it("reads a whole chapter, and carries on to the references after it", () => {
    const found = findReferences("Read Psalm 23; John 3:16 and Genesis 1-3 today.");
    expect(found.map((r) => r.text)).toEqual(["Psalm 23", "John 3:16", "Genesis 1-3"]);
    expect(found[0]?.entered).toMatchObject({
      // Psalm 23 has a heading: verse 0.
      start: { book: "Ps", chapter: 23, verse: 0 },
      end: { book: "Ps", chapter: 23, verse: 6 },
    });
  });

  it("leaves a reference alone that the KJV doesn't have, and the ones around it", () => {
    const found = findReferences("Not John 99:1, but Jude 3 and Mark 1:2 are fine.");
    expect(found.map((r) => r.text)).toEqual(["Jude 3", "Mark 1:2"]);
  });

  it("leaves common words that are also book names alone", () => {
    expect(findReferences("It is 3 am. Act 2: we left. Is 5 enough?")).toEqual([]);
  });

  it("parses one reference filling the input, like the main entry", () => {
    const parsed = parseReference("jn 3 16");
    expect(parsed.ok).toBe(true);
    expect(parseReference("not a reference").ok).toBe(false);
  });
});
