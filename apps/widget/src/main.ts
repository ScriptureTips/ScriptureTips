import {
  createScriptureLinks,
  type LinksEventName,
  type LinksEvents,
  type LinksOptions,
  type ScriptureLinks,
} from "@scripturetips/scripture-links";

/**
 * The website plugin (vision §3.6): one script tag, then `ScriptureTips.run('#content')`.
 * It's `window.ScriptureTips`, with the API the plans give:
 *
 * - `run(selector, options?)`: links the references in what the selector matches, and in what
 *   appears there later. The options (`translation`, `destination`, `scheme`, `strings` …) are read
 *   the first time; the API and site default to where this script came from.
 * - `setPreferences({ translation })`: the visitor's own preference, for a site with accounts.
 * - `rescan(element?)`: look again now.
 * - `on(event, handler)`: `tooltip-open`, `translation-change`, `scan`. Returns a function that
 *   stops listening.
 *
 * No cookies, no storage, nothing sent but the passage requests (`credentials: "omit"`).
 */
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
      site: options.site ?? origin,
    });
    // What the site said of the visitor before `run`.
    if (preferences.translation) instance.setPreferences(preferences);
    for (const attach of listeners) attach(instance);
  }
  return instance;
}

const ScriptureTips = {
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

(window as unknown as { ScriptureTips: typeof ScriptureTips }).ScriptureTips = ScriptureTips;
