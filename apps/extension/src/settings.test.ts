import { describe, expect, it } from "vitest";
import {
  apiOf,
  DEFAULT_SETTINGS,
  leftAlone,
  migrate,
  moveOutsideSite,
  normalize,
  normalizeHost,
  outsideSite,
  PRESET_SITES,
  type Settings,
  siteOf,
  sortedHosts,
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

  it("leaves the data server alone, except the demo pages of a development build", () => {
    const data = "https://data.test";
    expect(leftAlone(s, new URL("https://data.test/about/extension/"), data, "")).toBe(true);
    expect(leftAlone(s, new URL("https://data.test/demo/jonah.html"), data, "")).toBe(true);
    expect(leftAlone(s, new URL("https://data.test/demo/jonah.html"), data, "/demo/")).toBe(false);
    expect(leftAlone(s, new URL("https://data.test/demos/"), data, "/demo/")).toBe(true);
    expect(leftAlone(s, new URL("https://data.test/about/extension/"), data, "/demo/")).toBe(true);
    // The reader is left alone whatever the demo path is.
    expect(leftAlone(s, new URL("https://st.test/demo/x"), data, "/demo/")).toBe(true);
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

describe("vision §7.2: reader and data addresses", () => {
  it("opens links in a satellite's reader, but reads passages from the data server", () => {
    const satellite = { ...DEFAULT_SETTINGS, site: "https://church.test/" };
    expect(siteOf(satellite, "https://scripturetips.test")).toBe("https://church.test");
    expect(siteOf(DEFAULT_SETTINGS, "https://scripturetips.test/")).toBe(
      "https://scripturetips.test",
    );
    expect(apiOf("https://data.test/")).toBe("https://data.test/api");
  });
});

describe("vision §3.6: the outside sites can be put in order", () => {
  const base: Settings = {
    ...DEFAULT_SETTINGS,
    outsideSites: ["a", "b", "c", "d"].map((name) => ({
      name,
      url: `https://${name}.test`,
      translation: "",
    })),
  };
  const names = (s: Settings) => s.outsideSites.map((x) => x.name).join(",");

  it("moves a site up or down", () => {
    expect(names(moveOutsideSite(base, 3, 0))).toBe("d,a,b,c");
    expect(names(moveOutsideSite(base, 0, 2))).toBe("b,c,a,d");
    expect(names(moveOutsideSite(base, 1, 1))).toBe("a,b,c,d");
  });

  it("leaves things as they are for a place that isn't there", () => {
    expect(moveOutsideSite(base, 0, 9)).toBe(base);
    expect(moveOutsideSite(base, -1, 2)).toBe(base);
  });

  it("keeps the chosen destination on its site, wherever it ends up", () => {
    const chosen = (from: number, to: number, destination: number) => {
      const moved = moveOutsideSite({ ...base, destination }, from, to);
      return moved.outsideSites[moved.destination as number]?.name;
    };
    for (const destination of [0, 1, 2, 3]) {
      for (const [from, to] of [
        [0, 3],
        [3, 0],
        [1, 2],
        [2, 1],
        [0, 1],
        [3, 2],
      ] as const) {
        expect(chosen(from, to, destination)).toBe(base.outsideSites[destination]?.name);
      }
    }
    // ScriptureTips stays the choice.
    expect(moveOutsideSite({ ...base, destination: "scripturetips" }, 0, 2).destination).toBe(
      "scripturetips",
    );
  });
});

describe("vision §3.6: the sites turned off are written as in the address bar", () => {
  it("reduces what is typed to the host", () => {
    expect(normalizeHost("Example.ORG")).toBe("example.org");
    expect(normalizeHost("  https://Forum.Example.net/some/page?x=1 ")).toBe("forum.example.net");
    expect(normalizeHost("localhost:8080")).toBe("localhost:8080");
    expect(normalizeHost("http://localhost:8080/a")).toBe("localhost:8080");
  });

  it("gives nothing for what can't be a site", () => {
    expect(normalizeHost("")).toBe("");
    expect(normalizeHost("two words")).toBe("");
    expect(normalizeHost("https://")).toBe("");
    expect(normalizeHost("a b.org")).toBe("");
  });

  it("keeps each once, in alphabetical order", () => {
    expect(sortedHosts(["b.test", "A.test".toLowerCase(), "b.test", "c.test"])).toEqual([
      "a.test",
      "b.test",
      "c.test",
    ]);
  });
});
