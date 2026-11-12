import { SCRIPTURETIPS } from "@scripturetips/scripture-links";

/** An outside reading site a link can go to, with a URL template (`destinationUrl`). */
export interface OutsideSite {
  readonly name: string;
  /** With `ST_REFERENCE`, `ST_TRANSLATION`, `ST_BOOKNAME`, `ST_CHAPTER`, `ST_VERSE`. */
  readonly url: string;
  /** The site's own code for the translation it opens in ("KJV"), for `ST_TRANSLATION`. */
  readonly translation: string;
}

/** The markup the link generator writes. */
export type LinkFormat = "html" | "bbcode" | "wiki" | "markdown";
export const LINK_FORMATS: readonly LinkFormat[] = ["html", "bbcode", "wiki", "markdown"];

/**
 * The reader's settings, kept in the browser's sync storage (so they follow the reader to their
 * other browsers) under `settings`. The keys v1.0.3 used are left where they were.
 */
export interface Settings {
  readonly version: 2;
  /** Where links go: the ScriptureTips reader, or one of `outsideSites` (by its place). */
  readonly destination: typeof SCRIPTURETIPS | number;
  readonly outsideSites: readonly OutsideSite[];
  readonly format: LinkFormat;
  /** Hosts (`example.org`, `localhost:8080`) where nothing is linked. */
  readonly disabledSites: readonly string[];
  /** The translation the tooltip opens in (a catalog ID); the KJV if not set. */
  readonly translation: string | null;
  /**
   * Another ScriptureTips installation (a satellite) whose reader links open, instead of the
   * built-in one. Passages still come from the data server (vision §7.2; whether a satellite
   * may serve them itself is open, sources.md §8 item 34).
   */
  readonly site: string | null;
}

export const SETTINGS_KEY = "settings";

/** The outside sites v1.0.3 offered, as it wrote them. */
export const PRESET_SITES: readonly OutsideSite[] = [
  {
    name: "BibleGateway.com",
    url: "https://www.biblegateway.com/passage/?search=ST_REFERENCE&version=ST_TRANSLATION",
    translation: "TLV",
  },
  {
    name: "BibleHub.com",
    url: "https://biblemenus.com/search.php?q=ST_BOOKNAME%20ST_CHAPTER:ST_VERSE",
    translation: "interlinear",
  },
  {
    name: "BlueLetterBible.org",
    url: "https://blueletterbible.org/search/presearch.cfm?Criteria=ST_REFERENCE&t=ST_TRANSLATION",
    translation: "KJV",
  },
];

export const DEFAULT_SETTINGS: Settings = {
  version: 2,
  destination: SCRIPTURETIPS,
  outsideSites: PRESET_SITES,
  format: "html",
  disabledSites: [],
  translation: null,
  site: null,
};

const LEGACY_FORMATS: Record<string, LinkFormat> = {
  HTML: "html",
  BBCODE: "bbcode",
  WIKIML: "wiki",
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];

function sites(
  v: unknown,
  read: (o: Record<string, unknown>) => OutsideSite | null,
): OutsideSite[] {
  return Array.isArray(v)
    ? v.flatMap((o) => {
        const site = isRecord(o) ? read(o) : null;
        return site ? [site] : [];
      })
    : [];
}

const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** Makes stored settings safe to use: anything damaged or missing takes its default. */
export function normalize(raw: unknown): Settings {
  const s = isRecord(raw) ? raw : {};
  const outsideSites = sites(s["outsideSites"], (o) => ({
    name: text(o["name"]),
    url: text(o["url"]),
    translation: text(o["translation"]),
  }));
  const d = s["destination"];
  return {
    version: 2,
    destination:
      typeof d === "number" && Number.isInteger(d) && d >= 0 && d < outsideSites.length
        ? d
        : SCRIPTURETIPS,
    outsideSites,
    format: LINK_FORMATS.includes(s["format"] as LinkFormat)
      ? (s["format"] as LinkFormat)
      : DEFAULT_SETTINGS.format,
    disabledSites: strings(s["disabledSites"]),
    translation: typeof s["translation"] === "string" && s["translation"] ? s["translation"] : null,
    site: typeof s["site"] === "string" && /^https?:\/\//.test(s["site"]) ? s["site"] : null,
  };
}

/**
 * The settings from what sync storage holds (vision §3.6, upgrade path): the new `settings` if
 * there are any; otherwise v1.0.3's, carried over (its outside sites, the one chosen, the format
 * and the sites turned off); otherwise the defaults. v1.0.3 kept the chosen site as its place in
 * the list, or, after one of its own slips, as its URL: both are read.
 */
export function migrate(stored: Record<string, unknown>): Settings {
  if (isRecord(stored[SETTINGS_KEY])) return normalize(stored[SETTINGS_KEY]);
  const legacy = ["BibleServices", "defaultBibleService", "defaultMode", "tipDisabledDomains"];
  if (!legacy.some((k) => k in stored)) return DEFAULT_SETTINGS;

  const kept = sites(stored["BibleServices"], (o) => ({
    name: text(o["n"]),
    url: text(o["u"]),
    translation: text(o["t"]),
  }));
  const outsideSites = kept.length > 0 ? kept : PRESET_SITES;
  const chosen = stored["defaultBibleService"];
  let destination = 0;
  if (typeof chosen === "number" && Number.isInteger(chosen) && chosen < outsideSites.length)
    destination = Math.max(0, chosen);
  else if (typeof chosen === "string")
    destination = Math.max(
      0,
      outsideSites.findIndex((s) => s.url === chosen),
    );
  return {
    ...DEFAULT_SETTINGS,
    destination,
    outsideSites,
    format: LEGACY_FORMATS[text(stored["defaultMode"])] ?? DEFAULT_SETTINGS.format,
    disabledSites: strings(stored["tipDisabledDomains"]),
  };
}

/** The ScriptureTips site the extension was built for (`ST_SITE` at build time): its reader. */
declare const __ST_SITE__: string;
export const BUILT_IN_SITE: string = typeof __ST_SITE__ === "string" ? __ST_SITE__ : "";

/** The data server it reads passages from (`ST_DATA` at build time; vision §7.2). */
declare const __ST_DATA__: string;
export const BUILT_IN_DATA: string = typeof __ST_DATA__ === "string" ? __ST_DATA__ : "";

const trimmed = (address: string): string => address.replace(/\/$/, "");

/** The ScriptureTips site whose reader links open: a satellite, or the built-in one. */
export const siteOf = (settings: Settings, builtIn = BUILT_IN_SITE): string =>
  trimmed(settings.site ?? builtIn);

/** The API passages are read from: always the data server, whichever reader links open. */
export const apiOf = (data = BUILT_IN_DATA): string => `${trimmed(data)}/api`;

/** Whether the extension leaves this page alone: turned off here, or the ScriptureTips site itself. */
export function leftAlone(settings: Settings, url: URL): boolean {
  if (!/^https?:$/.test(url.protocol)) return true;
  if (settings.disabledSites.includes(url.host)) return true;
  // The reader's own pages, and the data server's: ScriptureTips links its own references.
  return [siteOf(settings), BUILT_IN_DATA].some((address) => {
    try {
      return url.origin === new URL(address).origin;
    } catch {
      return false;
    }
  });
}

/** The outside site links go to, if not the reader. */
export function outsideSite(settings: Settings): OutsideSite | null {
  if (typeof settings.destination !== "number") return null;
  const site = settings.outsideSites[settings.destination];
  // One still being filled in, with no address yet, leaves links going to ScriptureTips.
  return site?.url.trim() ? site : null;
}
