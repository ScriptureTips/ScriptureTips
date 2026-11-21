/**
 * What study mode shows over the text, besides the word types: the translators' notes (each
 * translation's, or all) and the user's own notes (by collection). Remembered in this browser.
 * Until collections are built there's one, the default, which holds the user's annotations that
 * aren't in another collection (today, their scripture links) (domain-model §3.6).
 */

export const LAYERS_CHANGED = "st-layers-changed";
const KEY = "study-layers";

/** The collection that takes the user's annotations that aren't in another one. */
export const DEFAULT_COLLECTION = "default";

export interface Layers {
  /** The translators' notes: all of them, off, or on but for the sources listed in `hiddenNotes`. */
  readonly notes: boolean;
  readonly hiddenNotes: readonly string[];
  /** Translations not on the page whose notes are shown too (off until chosen). */
  readonly extraNotes: readonly string[];
  /** The user's notes: all of them, off, or on but for the collections in `hiddenCollections`. */
  readonly yours: boolean;
  readonly hiddenCollections: readonly string[];
}

export const SHOW_ALL: Layers = {
  notes: true,
  hiddenNotes: [],
  extraNotes: [],
  yours: true,
  hiddenCollections: [],
};

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** The remembered layers (best effort: storage can be unavailable). */
export function readLayers(): Layers {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Record<
      string,
      unknown
    > | null;
    if (!v) return SHOW_ALL;
    return {
      notes: v["notes"] !== false,
      hiddenNotes: strings(v["hiddenNotes"]),
      extraNotes: strings(v["extraNotes"]),
      yours: v["yours"] !== false,
      hiddenCollections: strings(v["hiddenCollections"]),
    };
  } catch {
    return SHOW_ALL;
  }
}

/** Remembers the layers and tells the parts of the page that draw them. */
export function writeLayers(layers: Layers): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(layers));
  } catch {
    // Not remembered; it still works.
  }
  window.dispatchEvent(new Event(LAYERS_CHANGED));
}

/** Whether a collection's notes are shown. */
export const collectionShown = (layers: Layers, id: string): boolean =>
  layers.yours && !layers.hiddenCollections.includes(id);

/** Whether a source's translator's notes are shown (`source`: a translation's ID, or `@compilation`). */
export const notesShown = (layers: Layers, source: string): boolean =>
  layers.notes && !layers.hiddenNotes.includes(source);

/** Whether the notes of a translation that isn't on the page are shown (chosen in the footer). */
export const extraShown = (layers: Layers, id: string): boolean =>
  layers.notes && layers.extraNotes.includes(id);

/**
 * The source a note mark belongs to: its own (`data-note-source`, a note of a translation not on
 * the page), else the wording of the verse it's in.
 */
export const markSource = (mark: Element): string =>
  mark.closest("[data-note-source]")?.getAttribute("data-note-source") ??
  mark.closest("[data-words-in]")?.getAttribute("data-words-in") ??
  "";

/** The sources that have a translator's note on the page (their IDs, in page order). */
export function noteSources(root: ParentNode = document): string[] {
  const found = new Set<string>();
  for (const mark of root.querySelectorAll(".note-mark")) {
    if (mark.closest("[data-note-source]")) continue;
    const source = mark.closest("[data-words-in]")?.getAttribute("data-words-in");
    if (source) found.add(source);
  }
  return [...found];
}
