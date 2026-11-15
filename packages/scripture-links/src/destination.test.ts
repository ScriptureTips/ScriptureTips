import { describe, expect, it } from "vitest";
import {
  addressTranslation,
  destinationName,
  destinationUrl,
  readMoreUrl,
  SCRIPTURETIPS,
} from "./destination.ts";

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

  it("names an outside site's own translation code, not the catalog ID the tooltip shows", () => {
    const gateway =
      "https://www.biblegateway.com/passage/?search=ST_REFERENCE&version=ST_TRANSLATION";
    const translation = addressTranslation(gateway, "TLV", "eng-kjv");
    expect(destinationUrl(gateway, "https://scripturetips.org", translation, ref)).toBe(
      "https://www.biblegateway.com/passage/?search=1%20John%203%3A16&version=TLV",
    );
    // With no code of its own, the tooltip's translation; the reader always takes the catalog ID.
    expect(addressTranslation(gateway, undefined, "eng-kjv")).toBe("eng-kjv");
    expect(addressTranslation(SCRIPTURETIPS, "TLV", "eng-kjv")).toBe("eng-kjv");
  });
});

describe("vision §3.6: the name shown beside Read more", () => {
  it("has none for the ScriptureTips reader", () => {
    expect(destinationName(SCRIPTURETIPS, "ScriptureTips")).toBeNull();
  });

  it("is the name the destination was given", () => {
    expect(destinationName("https://x.test/?q=ST_REFERENCE", " BibleGateway.com ")).toBe(
      "BibleGateway.com",
    );
  });

  it("else the address's own host, without www.", () => {
    expect(
      destinationName(
        "https://www.biblegateway.com/passage/?search=ST_REFERENCE&version=ST_TRANSLATION",
      ),
    ).toBe("biblegateway.com");
    expect(destinationName("https://blueletterbible.org/search?t=ST_TRANSLATION", "")).toBe(
      "blueletterbible.org",
    );
    expect(destinationName("not an address")).toBeNull();
  });
});
