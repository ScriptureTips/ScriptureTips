import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  leftAlone,
  migrate,
  normalize,
  outsideSite,
  PRESET_SITES,
} from "./settings.ts";

/** What v1.0.3 left in sync storage (its service worker's install defaults, then the reader's). */
const legacy = {
  defaultMode: "BBCODE",
  defaultBibleService: 2,
  tipDisabledDomains: ["example.org", "forum.test:8080"],
  BibleServices: [
    { n: "BibleGateway.com", u: "https://www.biblegateway.com/?q=ST_REFERENCE", t: "NKJV" },
    { n: "Mine", u: "https://bible.test/ST_BOOKNAME/ST_CHAPTER", t: "" },
    { n: "BlueLetterBible.org", u: "https://blb.test/?c=ST_REFERENCE&t=ST_TRANSLATION", t: "KJV" },
  ],
};

describe("vision §3.6: settings carried over from v1.0.3 (the upgrade path)", () => {
  it("keeps the reader's outside sites, the one chosen, the format and the sites turned off", () => {
    const s = migrate(legacy);
    expect(s.outsideSites.map((o) => [o.name, o.url, o.translation])).toEqual(
      legacy.BibleServices.map((o) => [o.n, o.u, o.t]),
    );
    expect(s.destination).toBe(2);
    expect(outsideSite(s)?.name).toBe("BlueLetterBible.org");
    expect(s.format).toBe("bbcode");
    expect(s.disabledSites).toEqual(["example.org", "forum.test:8080"]);
  });

  it("reads the chosen site when v1.0.3 saved its address instead of its place", () => {
    expect(
      migrate({ ...legacy, defaultBibleService: legacy.BibleServices[1]?.u }).destination,
    ).toBe(1);
    // Anything else: the first, as v1.0.3 fell back to.
    expect(migrate({ ...legacy, defaultBibleService: "gone" }).destination).toBe(0);
    expect(migrate({ ...legacy, defaultBibleService: 9 }).destination).toBe(0);
    expect(migrate({ ...legacy, defaultBibleService: null }).destination).toBe(0);
  });

  it("gives the usual sites back when v1.0.3's list was empty or damaged", () => {
    expect(migrate({ ...legacy, BibleServices: [] }).outsideSites).toEqual(PRESET_SITES);
    expect(migrate({ ...legacy, BibleServices: "x" }).outsideSites).toEqual(PRESET_SITES);
    expect(migrate({ ...legacy, defaultMode: "?" }).format).toBe("html");
  });

  it("starts a new reader at the ScriptureTips reader, with the usual outside sites", () => {
    expect(migrate({})).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.destination).toBe("scripturetips");
  });

  it("prefers settings already saved, and never trusts a damaged one", () => {
    const saved = { ...DEFAULT_SETTINGS, format: "markdown", translation: "eng-web" };
    expect(migrate({ ...legacy, settings: saved })).toEqual(saved);
    const damaged = normalize({
      destination: 7,
      format: "pdf",
      disabledSites: [1, "a.test"],
      site: "ftp://x",
    });
    expect(damaged.destination).toBe("scripturetips");
    expect(damaged.format).toBe("html");
    expect(damaged.disabledSites).toEqual(["a.test"]);
    expect(damaged.site).toBeNull();
  });
});

describe("vision §3.6: where the extension stays out", () => {
  const s = { ...DEFAULT_SETTINGS, disabledSites: ["off.test"], site: "https://st.test" };
  it("leaves sites turned off, the ScriptureTips site itself and pages that aren't the web", () => {
    expect(leftAlone(s, new URL("https://off.test/a"))).toBe(true);
    expect(leftAlone(s, new URL("https://st.test/read"))).toBe(true);
    expect(leftAlone(s, new URL("file:///home/a.html"))).toBe(true);
    expect(leftAlone(s, new URL("https://on.test/"))).toBe(false);
  });

  it("sends links to ScriptureTips while the chosen site has no address yet", () => {
    const filling = {
      ...s,
      destination: 0,
      outsideSites: [{ name: "New", url: "", translation: "" }],
    };
    expect(outsideSite(filling)).toBeNull();
  });
});
