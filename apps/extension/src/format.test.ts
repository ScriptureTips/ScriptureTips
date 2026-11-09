import { describe, expect, it } from "vitest";
import { linkText } from "./format.ts";
import { addressFor } from "./pages.ts";
import { DEFAULT_SETTINGS } from "./settings.ts";

const to = (ref: { osis: string }) => `https://st.test/r/${ref.osis}`;

describe("vision §3.6: the link generator", () => {
  it("links each reference in the format chosen", () => {
    const text = "As Paul says in Romans 5:8, and John 3:16.";
    expect(linkText(text, "html", to)).toBe(
      'As Paul says in <a href="https://st.test/r/Rom.5.8">Romans 5:8</a>, and <a href="https://st.test/r/John.3.16">John 3:16</a>.',
    );
    expect(linkText(text, "bbcode", to)).toContain(
      "[url=https://st.test/r/Rom.5.8]Romans 5:8[/url]",
    );
    expect(linkText(text, "wiki", to)).toContain("[https://st.test/r/Rom.5.8 Romans 5:8]");
    expect(linkText(text, "markdown", to)).toContain("[Romans 5:8](https://st.test/r/Rom.5.8)");
  });

  it("leaves references that are already links, inside tags or in web addresses", () => {
    const text = [
      '<a href="x">John 3:16</a>',
      '<span title="Genesis 1:1">x</span>',
      "[url=x]Romans 5:8[/url]",
      "[Psalm 23:1](x)",
      "[https://x.test Acts 2:38]",
      "https://x.test/?q=Mark 1:1",
    ].join("\n");
    expect(linkText(text, "html", to)).toBe(text);
  });

  it("changes nothing when run again", () => {
    for (const format of ["html", "bbcode", "wiki", "markdown"] as const) {
      const once = linkText("See 1 John 1:9 and Jude 1:3.", format, to);
      expect(linkText(once, format, to)).toBe(once);
    }
  });

  it("escapes what HTML needs", () => {
    expect(linkText("John 3:16", "html", () => 'https://x.test/?a=1&b="2"')).toBe(
      '<a href="https://x.test/?a=1&amp;b=&quot;2&quot;">John 3:16</a>',
    );
  });

  it("goes to the reader in the chosen translation, or to an outside site in its own code", () => {
    const settings = { ...DEFAULT_SETTINGS, site: "https://st.test", translation: "eng-web" };
    expect(linkText("John 3:16", "markdown", addressFor(settings, "scripturetips"))).toBe(
      "[John 3:16](https://st.test/read?t=eng-web&ref=John%203%3A16)",
    );
    // BibleGateway, as v1.0.3 set it up: its own code for the translation (TLV).
    expect(linkText("John 3:16", "markdown", addressFor(settings, 0))).toBe(
      "[John 3:16](https://www.biblegateway.com/passage/?search=John%203%3A16&version=TLV)",
    );
  });
});
