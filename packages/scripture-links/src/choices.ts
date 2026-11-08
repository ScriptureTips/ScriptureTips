/** Where a reader's translation choices are kept, in their own browser. */
export const CHOICES_KEY = "scripturetips:translations";

/** The most passages whose choice is kept; the oldest go first. */
const MOST = 500;

/**
 * A reader's chosen translation for each link, kept in the browser's own storage. The key says
 * which link: the plugin keys it by the page's path, the passage and which copy of it on the page.
 */
export interface Choices {
  get(key: string): string | undefined;
  set(key: string, translation: string): void;
}

/** The page's `localStorage`, or null where there is none or it's blocked (a sandboxed frame). */
export function pageStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * What the reader chose for each link (by the key it's given), so the tooltip opens in it
 * next time, after a reload too, until they clear their browser's storage: nothing expires.
 * Kept only in that browser's storage (never sent anywhere); with no storage, or if it refuses,
 * the choices last for the page. A damaged entry is ignored, not trusted.
 */
export function createChoices(storage: Storage | null, storageKey = CHOICES_KEY): Choices {
  let kept: Record<string, string> | null = null;

  const load = (): Record<string, string> => {
    if (kept) return kept;
    kept = {};
    try {
      const raw = storage?.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        for (const [link, translation] of Object.entries(parsed))
          if (typeof translation === "string") kept[link] = translation;
    } catch {
      /* Unreadable: start again. */
    }
    return kept;
  };

  return {
    get: (key) => load()[key],
    set(key, translation) {
      const all = load();
      // Moved to the end, so what's been chosen most lately is kept longest.
      delete all[key];
      all[key] = translation;
      for (const old of Object.keys(all).slice(0, Math.max(0, Object.keys(all).length - MOST)))
        delete all[old];
      try {
        storage?.setItem(storageKey, JSON.stringify(all));
      } catch {
        /* Full or refused: it still holds for the page. */
      }
    },
  };
}
