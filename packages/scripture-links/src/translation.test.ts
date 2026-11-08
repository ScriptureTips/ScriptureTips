import { describe, expect, it } from "vitest";
import { chooseTranslation } from "./translation.ts";
import type { WidgetTranslation } from "./types.ts";

const t = (id: string, abbreviation: string): WidgetTranslation => ({
  id,
  abbreviation,
  name: id,
  language: "en",
  direction: "ltr",
});
const listed = [t("bsb", "BSB"), t("eng-kjv", "KJV"), t("leb", "LEB")];

describe("vision §3.6: which translation a passage opens in", () => {
  it("goes in order: the reader's choice, the link, what's written, the visitor, the configured, the KJV", () => {
    const all = {
      chosen: "leb",
      linked: "bsb",
      written: "KJV",
      preferred: "bsb",
      configured: "bsb",
    };
    expect(chooseTranslation(all, listed)).toBe("leb");
    expect(chooseTranslation({ ...all, chosen: undefined }, listed)).toBe("bsb");
    expect(chooseTranslation({ ...all, chosen: undefined, linked: undefined }, listed)).toBe(
      "eng-kjv",
    );
    expect(chooseTranslation({ preferred: "leb", configured: "bsb" }, listed)).toBe("leb");
    expect(chooseTranslation({ configured: "bsb" }, listed)).toBe("bsb");
    expect(chooseTranslation({}, listed)).toBe("eng-kjv");
  });

  it("reads an abbreviation written after the passage without minding its case", () => {
    expect(chooseTranslation({ written: "leb", preferred: "bsb" }, listed)).toBe("leb");
  });

  it("skips a step that names something the plugin can't show, not the passage", () => {
    // The NLT isn't here: the visitor's preference is next.
    expect(chooseTranslation({ written: "NLT", preferred: "bsb" }, listed)).toBe("bsb");
    expect(chooseTranslation({ linked: "nlt", written: "NLT", configured: "leb" }, listed)).toBe(
      "leb",
    );
    expect(chooseTranslation({ chosen: "gone" }, listed)).toBe("eng-kjv");
  });

  it("falls back to the first listed when even the KJV isn't, and to nothing when none is", () => {
    expect(chooseTranslation({}, [t("bsb", "BSB")])).toBe("bsb");
    expect(chooseTranslation({}, [])).toBe("");
  });
});
