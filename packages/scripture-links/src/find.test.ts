import { describe, expect, it } from "vitest";
import { findInText } from "./find.ts";

describe("vision §3.6: finding references on a page", () => {
  it("finds each reference with where it is and its passage in OSIS", () => {
    const text = "Compare Romans 5:8–10 with John 3:16.";
    const found = findInText(text);
    expect(found.map((f) => [f.text, f.osis])).toEqual([
      ["Romans 5:8–10", "Rom.5.8-Rom.5.10"],
      ["John 3:16", "John.3.16"],
    ]);
    for (const f of found) expect(text.slice(f.start, f.end)).toBe(f.text);
    expect(found[0]).toMatchObject({ book: "Rom", chapter: 5, verse: 8 });
  });

  it("reads a whole chapter as its verses, and a list as several references", () => {
    expect(findInText("Psalm 23").map((f) => f.osis)).toEqual(["Ps.23.0-Ps.23.6"]);
    expect(findInText("Rom 5:8, 10; 6:1").map((f) => f.osis)).toEqual([
      "Rom.5.8",
      "Rom.5.10",
      "Rom.6.1",
    ]);
  });

  it("reads a lone 1 in a one-chapter book as the whole book, and a verse in the other ways", () => {
    const osis = (text: string) => findInText(text).map((f) => f.osis);
    expect(osis("Jude 1")).toEqual(["Jude.1.1-Jude.1.25"]);
    expect(osis("See 2 John 1, and Philemon 1.")).toEqual([
      "2John.1.1-2John.1.13",
      "Phlm.1.1-Phlm.1.25",
    ]);
    expect(osis("Jude 3")).toEqual(["Jude.1.3"]);
    expect(osis("Jude 1:1")).toEqual(["Jude.1.1"]);
    expect(osis("Jude 1-3")).toEqual(["Jude.1.1-Jude.1.3"]);
    // The text a link covers is the whole reference, with its "1".
    const [found] = findInText("Read Jude 1 today.");
    expect(found?.text).toBe("Jude 1");
  });

  it("notes an abbreviation in brackets right after a reference, which may name its translation", () => {
    const found = findInText(
      "John 3:16 (NLT) and Romans 5:8 ( KJV ), then Mark 1:1 (see below), and Luke 2:1.",
    );
    expect(found.map((f) => [f.text, f.written])).toEqual([
      ["John 3:16", "NLT"],
      ["Romans 5:8", "KJV"],
      ["Mark 1:1", null],
      ["Luke 2:1", null],
    ]);
  });

  it("leaves alone what isn't a reference, or isn't in the Bible", () => {
    expect(findInText("It is 3 am; Act 2 begins; John 99:1 isn't there.")).toEqual([]);
    expect(findInText("no references here")).toEqual([]);
  });
});
