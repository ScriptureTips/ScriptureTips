import {
  createScriptureLinks,
  type LinksEventName,
  type LinksEvents,
  type LinksOptions,
  type ScriptureLinks,
} from "@scripturetips/scripture-links";
import type { EmbedOptions, SearchHandle } from "@scripturetips/search/embed";

/**
 * The website plugin (vision §3.6): one script tag, then `ScriptureTips.run('#content')`.
 * It's `window.ScriptureTips`, with the API the plans give:
 *
 * - `run(selector, options?)`: links the references in what the selector matches, and in what
 *   appears there later. The options (`translation`, `destination`, `scheme`, `strings` …) are read
 *   the first time. The API defaults to where this script came from (the data server, vision
 *   §7.2), and the site, where links open, to the reader the script was built for (`ST_SITE`).
 * - `setPreferences({ translation })`: the visitor's own preference, for a site with accounts.
 * - `rescan(element?)`: look again now.
 * - `on(event, handler)`: `tooltip-open`, `translation-change`, `scan`. Returns a function that
 *   stops listening.
 *
 * - `search(options)`: puts a search on the page (a field with its results, or the two apart). The
 *   search code is loaded from beside this script only now; `<div class="st-search">` elements
 *   get one without any call. See `@scripturetips/search/embed` for the options.
 *
 * No cookies, no storage, nothing sent but the passage requests (`credentials: "omit"`).
 */
declare const __ST_SITE__: string;

const here = document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : "";
const origin = here ? new URL(here).origin : location.origin;

let instance: ScriptureLinks | null = null;
let preferences: { translation?: string } = {};
/** What each `on` asked for, to hand to the instance once there is one. */
const listeners = new Set<(i: ScriptureLinks) => () => void>();

function start(options: Partial<LinksOptions>): ScriptureLinks {
  if (!instance) {
    const api = options.api ?? `${origin}/api`;
    instance = createScriptureLinks({
      ...options,
      api,
      site: options.site ?? __ST_SITE__,
    });
    // What the site said of the visitor before `run`.
    if (preferences.translation) instance.setPreferences(preferences);
    for (const attach of listeners) attach(instance);
  }
  return instance;
}

interface Embed {
  mountAll(api: string, selector?: string): SearchHandle[];
  mountSearch(options: EmbedOptions): SearchHandle | null;
}

let embed: Promise<Embed> | null = null;

/** The search code, fetched once from where this script came from. */
function loadEmbed(): Promise<Embed> {
  embed ??= new Promise<Embed>((resolve, reject) => {
    const ready = (window as unknown as { ScriptureTipsEmbed?: Embed }).ScriptureTipsEmbed;
    if (ready) return resolve(ready);
    const tag = document.createElement("script");
    tag.src = here
      ? here.replace(/[^/]*$/, "scripturetips-search.js")
      : "/widget/scripturetips-search.js";
    tag.async = true;
    tag.onload = () =>
      resolve((window as unknown as { ScriptureTipsEmbed: Embed }).ScriptureTipsEmbed);
    tag.onerror = () => {
      embed = null;
      reject(new Error("The ScriptureTips search could not be loaded."));
    };
    document.head.append(tag);
  });
  return embed;
}

const ScriptureTips = {
  /** A search on the page; resolves to null when the page has no element for it. */
  async search(
    options: Omit<EmbedOptions, "api"> & { api?: string },
  ): Promise<SearchHandle | null> {
    const { mountSearch } = await loadEmbed();
    return mountSearch({ ...options, api: options.api ?? `${origin}/api` });
  },
  run(selector: string, options: Partial<LinksOptions> = {}): void {
    start(options).run(selector);
  },
  setPreferences(next: { translation?: string }): void {
    preferences = { ...preferences, ...next };
    instance?.setPreferences(next);
  },
  rescan(element?: Element): void {
    instance?.rescan(element);
  },
  on<K extends LinksEventName>(name: K, handler: (detail: LinksEvents[K]) => void): () => void {
    const attach = (i: ScriptureLinks) => i.on(name, handler);
    listeners.add(attach);
    const off = instance ? attach(instance) : undefined;
    return () => {
      listeners.delete(attach);
      off?.();
    };
  },
};

/** Zero configuration: a page with `<div class="st-search">` gets its searches without a call. */
function autoSearch(): void {
  if (
    !document.querySelector(
      ".st-search:not([data-st-mounted]), [data-st-input]:not([data-st-mounted])",
    )
  )
    return;
  void loadEmbed().then((e) => e.mountAll(`${origin}/api`));
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoSearch);
else autoSearch();

(window as unknown as { ScriptureTips: typeof ScriptureTips }).ScriptureTips = ScriptureTips;
