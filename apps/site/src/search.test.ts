import { describe, expect, it } from "vitest";
import { type SearchIndex, search, words } from "./search.ts";

const index: SearchIndex = {
  product: "extension",
  name: "Browser extension",
  version: "2.0",
  topics: [
    {
      id: "pin",
      title: "Keeping a passage open",
      summary: "Pin the tooltip so it stays.",
      keywords: ["keep open", "unpin"],
      headings: [["unpinning", "Unpinning"]],
      text: "The tooltip normally closes when you move away. Pin it and it stays.",
    },
    {
      id: "translation",
      title: "Choosing a translation",
      summary: "Change the translation for one passage.",
      keywords: ["version", "kjv"],
      headings: [["which-wins", "Which wins"]],
      text: "Choose from the Translation menu at the top of the tooltip. You can pin it too.",
    },
  ],
};

describe("the help's search", () => {
  it("reads words without case or accents", () => {
    expect(words("Café KJV, 3:16")).toEqual(["cafe", "kjv", "3", "16"]);
  });

  it("puts a match in the title before one in the text", () => {
    expect(search([index], "translation").map((h) => h.topic.id)).toEqual(["translation"]);
    expect(search([index], "tooltip").map((h) => h.topic.id)).toEqual(["pin", "translation"]);
    expect(search([index], "pin").map((h) => h.topic.id)).toEqual(["pin", "translation"]);
  });

  it("matches the start of a word, and needs every word", () => {
    expect(search([index], "transl").map((h) => h.topic.id)).toEqual(["translation"]);
    expect(search([index], "translation unpin")).toEqual([]);
    expect(search([index], "ranslation")).toEqual([]);
  });

  it("finds keywords, and names the heading the words are in", () => {
    expect(search([index], "kjv").map((h) => h.topic.id)).toEqual(["translation"]);
    const [hit] = search([index], "wins");
    expect(hit?.heading).toEqual(["which-wins", "Which wins"]);
    expect(search([index], "keeping")[0]?.heading).toBeNull();
  });

  it("shows the words around the match, and nothing for an empty search", () => {
    expect(search([index], "menu")[0]?.snippet).toContain("Translation menu");
    expect(search([index], "  ")).toEqual([]);
  });
});
