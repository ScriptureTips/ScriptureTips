import { describe, expect, it } from "vitest";
import { parsePlace, type ReaderBook, step, versesIn, widen } from "./reader-model.ts";

const verses = Array.from({ length: 20 }, (_, i) => ({ number: String(i + 1), text: `v${i + 1}` }));
const books: ReaderBook[] = [
  { osis: "Gen", name: "Genesis", chapters: [1, 2] },
  { osis: "Exod", name: "Exodus", chapters: [1, 2, 3] },
];

describe("vision §3.14: the widget reader's page arithmetic", () => {
  it.each([
    ["John.3.16", { book: "John", chapter: 3, from: 16, to: 16 }],
    ["Joel.2.28-Joel.2.32", { book: "Joel", chapter: 2, from: 28, to: 32 }],
    ["John.3", { book: "John", chapter: 3, from: null, to: null }],
    ["Gen.1.1-Gen.2.3", null],
  ])("reads %s", (osis, place) => {
    expect(parsePlace(osis)).toEqual(place);
  });

  it("shows only the verses of a part, and all of a whole chapter", () => {
    const part = parsePlace("Gen.1.5-Gen.1.6");
    expect(part && versesIn(verses, part).map((v) => v.number)).toEqual(["5", "6"]);
    expect(versesIn(verses, { book: "Gen", chapter: 1, from: null, to: null })).toHaveLength(20);
  });

  it("widens a part by three verses each side, and to the whole chapter at the ends", () => {
    expect(widen({ book: "Gen", chapter: 1, from: 10, to: 10 }, verses)).toEqual({
      book: "Gen",
      chapter: 1,
      from: 7,
      to: 13,
    });
    expect(widen({ book: "Gen", chapter: 1, from: 3, to: 18 }, verses)).toEqual({
      book: "Gen",
      chapter: 1,
      from: null,
      to: null,
    });
    expect(widen({ book: "Gen", chapter: 1, from: null, to: null }, verses)).toBeNull();
  });

  it("steps through chapters and across books, and stops at the ends", () => {
    expect(step(books, "Gen", 1, 1)).toEqual({ book: "Gen", chapter: 2 });
    expect(step(books, "Gen", 2, 1)).toEqual({ book: "Exod", chapter: 1 });
    expect(step(books, "Exod", 1, -1)).toEqual({ book: "Gen", chapter: 2 });
    expect(step(books, "Gen", 1, -1)).toBeNull();
    expect(step(books, "Exod", 3, 1)).toBeNull();
  });
});
