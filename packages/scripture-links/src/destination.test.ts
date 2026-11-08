import { describe, expect, it } from "vitest";
import { destinationUrl, readMoreUrl, SCRIPTURETIPS } from "./destination.ts";

const ref = { text: "1 John 3:16", book: "1John", chapter: 3, verse: 16 };

describe("vision §3.6: where a link goes", () => {
  it("goes to the ScriptureTips reader by default, which reads the reference as written", () => {
    expect(destinationUrl(SCRIPTURETIPS, "https://scripturetips.org/", "eng-kjv", ref)).toBe(
      "https://scripturetips.org/read?t=eng-kjv&ref=1%20John%203%3A16",
    );
  });

  it("fills a template's placeholders, encoded", () => {
    expect(
      destinationUrl(
        "https://example.org/bible/ST_TRANSLATION/ST_BOOKNAME/ST_CHAPTER/ST_VERSE?q=ST_REFERENCE",
        "https://scripturetips.org",
        "web",
        ref,
      ),
    ).toBe("https://example.org/bible/web/1%20John/3/16?q=1%20John%203%3A16");
  });

  it("builds Read more from the passage as the translation numbers it", () => {
    expect(readMoreUrl("https://scripturetips.org/", "heb", "Joel 3:1–5")).toBe(
      "https://scripturetips.org/read?t=heb&ref=Joel+3%3A1%E2%80%935",
    );
  });
});
