import { describe, expect, it } from "vitest";
import { fold, snippetOf, strongOf, wordsNeeded, wordsOf } from "./query.ts";
import { isStopWord, withoutStopWords } from "./stop-words.ts";

describe("vision §3.14: what a search query is", () => {
  it("reads a Strong's number however it's typed", () => {
    expect(strongOf("H430")).toEqual({ base: "H0430", extended: null });
    expect(strongOf(" h0430 ")).toEqual({ base: "H0430", extended: null });
    expect(strongOf("G 976")).toEqual({ base: "G0976", extended: null });
    expect(strongOf("H0430g")).toEqual({ base: "H0430", extended: "H0430G" });
  });

  it("takes anything else for words", () => {
    expect(strongOf("430")).toBeNull();
    expect(strongOf("God")).toBeNull();
    expect(strongOf("H430 God")).toBeNull();
    expect(strongOf("")).toBeNull();
  });

  it("folds Hebrew points and Greek accents away, so words match with or without them", () => {
    expect(fold("אֱלֹהִים")).toBe("אלהים");
    expect(fold("אלהים")).toBe("אלהים");
    expect(fold("Λόγος")).toBe("λογος");
    expect(fold("λόγος")).toBe(fold("ΛΟΓΟΣ"));
  });

  it("splits a headline into parts with the matched words flagged", () => {
    expect(snippetOf("For God so ⟦loved⟧ the world, that he gave")).toEqual([
      { t: "For God so " },
      { t: "loved", hit: true },
      { t: " the world, that he gave" },
    ]);
    expect(snippetOf("⟦a⟧⟦b⟧")).toEqual([
      { t: "a", hit: true },
      { t: "b", hit: true },
    ]);
    expect(snippetOf("plain")).toEqual([{ t: "plain" }]);
    expect(snippetOf("")).toEqual([]);
  });
});

describe("vision §3.14: the words of a query, for matching across translations", () => {
  it("splits plain words, once each, without punctuation", () => {
    expect(wordsOf("Dwelt, became; dwelt")).toEqual(["dwelt", "became"]);
    expect(wordsOf("  ")).toEqual([]);
  });

  it("leaves a query that says more than words to be searched as written", () => {
    expect(wordsOf('"loved the world"')).toBeNull();
    expect(wordsOf("love -hate")).toBeNull();
    expect(wordsOf("love or hate")).toBeNull();
  });

  it("wants every word of one or two, and all but about a third of more", () => {
    expect([1, 2, 3, 4, 5, 6].map(wordsNeeded)).toEqual([1, 2, 2, 3, 4, 4]);
  });
});

describe("vision §3.14: the words a plain query leaves out", () => {
  it("are ScriptureTips's own short list, in any case", () => {
    expect(["the", "The", "a", "of", "and"].every(isStopWord)).toBe(true);
    expect(["before", "is", "in", "lord"].some(isStopWord)).toBe(false);
  });

  it("are dropped outside quotes and kept inside them", () => {
    expect(withoutStopWords("the love of God")).toBe("love God");
    expect(withoutStopWords('"money is the root of all evil"')).toBe(
      '"money is the root of all evil"',
    );
    expect(withoutStopWords('the "root of all" and evil -the')).toBe('"root of all" evil');
    expect(withoutStopWords("The and a")).toBe("");
  });
});
