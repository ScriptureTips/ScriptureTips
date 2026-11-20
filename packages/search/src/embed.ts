import type { StReader } from "./elements/reader.ts";
import type { SearchEngine } from "./engine.ts";
import { configureSearch, removeSearch } from "./registry.ts";
import { widgetTransport } from "./transport.ts";
import type { SelectHandler, Strings } from "./types.ts";
import { isVerseRange } from "./verses.ts";
import "./elements/index.ts";

/** An element, or a selector that finds it (the first match). */
export type Target = Element | string;

export interface EmbedOptions {
  /** The data server's API (`https://scripture.tips/api`): where the search and passages come from. */
  readonly api: string;
  /**
   * Zero configuration: the container that gets the field and, under it, the results. A picked
   * passage is read in place of the results, inside this container.
   */
  readonly element?: Target;
  /** Advanced: the field in one element and the results in another, as on the home page. */
  readonly input?: Target;
  readonly results?: Target;
  /** The translations to search, in order of preference (catalog IDs); all that may be shown if left out. */
  readonly translations?: readonly string[];
  /** What to search for: `reference`, `text`, `original`. All three if left out. */
  readonly kinds?: readonly string[];
  readonly limit?: number;
  readonly placeholder?: string;
  /**
   * How a long list of results goes on: `scroll` (default: the next page loads as the end nears
   * the screen), `button` (a "Show more" button) or `none` (the list stops at `limit`).
   */
  readonly more?: "scroll" | "button" | "none";
  /** Suggestions as the visitor types (book names, words): on unless `false`. */
  readonly suggest?: boolean;
  /** Search as typing pauses, and list the results in the field's own list. Off by default. */
  readonly searchOnType?: boolean;
  readonly strings?: Partial<Strings>;
  /**
   * What picking a result does, instead of opening it in the reader: given `{ query, result }` (the
   * result's `reference` is OSIS, `translation.id` its translation). A function that does nothing
   * turns the reading off.
   */
  readonly onSelect?: SelectHandler;
  /** The name of this search for `ScriptureTipsSearch.get(name)`; made up if left out. */
  readonly name?: string;
}

export interface SearchHandle {
  readonly name: string;
  readonly engine: SearchEngine;
  /** Takes the search off the page. */
  destroy(): void;
}

let counter = 0;

function find(target: Target | undefined, root: ParentNode = document): Element | null {
  if (!target) return null;
  return typeof target === "string" ? root.querySelector(target) : target;
}

/**
 * Puts a search on a page (vision §3.14): the field and the results, in one container or in two
 * elements of the page's choosing, drawn by the core search elements and fed by the data server's
 * public widget routes. With no `onSelect`, picking a passage reads it where the results were.
 * Returns null when the page has no such element.
 */
export function mountSearch(options: EmbedOptions): SearchHandle | null {
  const host = find(options.element);
  const field = find(options.input);
  const list = find(options.results);
  if (!host && !(field && list)) return null;

  const name = options.name ?? `widget-${++counter}`;
  const reads: { open?: (translation: string, osis: string) => void } = {};
  const engine = configureSearch(name, {
    transport: widgetTransport(options.api),
    searchOnType: options.searchOnType ?? false,
    scope: {
      ...(options.translations ? { translations: [...options.translations] } : {}),
      kinds: options.kinds ? [...options.kinds] : ["reference", "text", "original"],
      ...(options.limit ? { limit: options.limit } : {}),
    },
    ...(options.strings ? { strings: options.strings } : {}),
    // With none of the host's own, picking a passage opens the reader where the results were.
    onSelect:
      options.onSelect ??
      (({ result }) => {
        if (result.kind === "original" || !isVerseRange(result.reference)) return;
        reads.open?.(result.translation.id, result.reference);
      }),
  });

  const made: Element[] = [];
  const add = (parent: Element, tag: string, attributes: Record<string, string> = {}) => {
    const el = document.createElement(tag);
    el.setAttribute("instance", name);
    // On another site: only the widget's own variables theme it, never the host page's `--ink` etc.
    el.setAttribute("isolated", "");
    for (const [k, v] of Object.entries(attributes)) el.setAttribute(k, v);
    parent.append(el);
    made.push(el);
    return el;
  };
  const placeholder = options.placeholder ? { placeholder: options.placeholder } : {};
  const where = field && list ? { input: field, results: list } : { input: host, results: host };
  if (!where.input || !where.results) return null;
  add(where.input, "st-search-input", placeholder);
  const found = add(where.results, "st-search-results", options.more ? { more: options.more } : {});
  if (!options.onSelect) {
    const reader = document.createElement("st-reader") as StReader;
    reader.api = options.api;
    if (options.translations) reader.translations = options.translations;
    reader.setAttribute("isolated", "");
    reader.hidden = true;
    found.after(reader);
    made.push(reader);
    const close = () => {
      reader.hidden = true;
      (found as HTMLElement).style.display = "";
    };
    reads.open = (translation, osis) => {
      (found as HTMLElement).style.display = "none";
      reader.hidden = false;
      void reader.show(translation, osis);
    };
    reader.addEventListener("st-reader-close", close);
    // Typing or searching again goes back to the results.
    engine.onType((e) => {
      if (e.source !== "api") close();
    });
    engine.onSearch(close);
  }
  // The footer credit, once, after whatever the results area ends with (the reader, if there is one).
  const last = made[made.length - 1] as Element;
  const brand = add(where.results, "st-brand", {
    href: `${new URL(options.api, location.href).origin}/`,
  });
  last.after(brand);
  if (options.suggest === false) engine.configure({ debounceMs: 60_000 });
  return {
    name,
    engine,
    destroy() {
      for (const el of made) el.remove();
      removeSearch(name);
    },
  };
}

/** The settings a container carries as `data-` attributes. */
function dataOptions(el: Element) {
  const list = (v: string | undefined) => (v ? v.split(/[\s,]+/).filter(Boolean) : undefined);
  const d = (el as HTMLElement).dataset;
  const translations = list(d["translations"]);
  const kinds = list(d["kinds"]);
  const more = (["scroll", "button", "none"] as const).find((m) => m === d["more"]);
  return {
    ...(translations ? { translations } : {}),
    ...(kinds ? { kinds } : {}),
    ...(d["limit"] ? { limit: Number(d["limit"]) } : {}),
    ...(d["placeholder"] ? { placeholder: d["placeholder"] } : {}),
    ...(more ? { more } : {}),
    ...(d["searchOnType"] !== undefined ? { searchOnType: d["searchOnType"] !== "false" } : {}),
  };
}

/**
 * The field and the results apart, in markup alone: `<div data-st-input="main"></div>` and
 * `<div data-st-results="main"></div>` (the same name) become one search. The settings are
 * `data-` attributes on the field's element, as for `.st-search`.
 */
export function mountPairs(api: string, root: ParentNode = document): SearchHandle[] {
  const handles: SearchHandle[] = [];
  for (const field of root.querySelectorAll("[data-st-input]:not([data-st-mounted])")) {
    const name = field.getAttribute("data-st-input") ?? "";
    const list = [...root.querySelectorAll("[data-st-results]")].find(
      (e) => e.getAttribute("data-st-results") === name,
    );
    if (!list) continue;
    const handle = mountSearch({ api, input: field, results: list, ...dataOptions(field) });
    if (handle) {
      field.setAttribute("data-st-mounted", "");
      handles.push(handle);
    }
  }
  return handles;
}

/**
 * The zero-configuration form: every `<div class="st-search">` becomes a search. Its settings
 * are `data-` attributes: `data-translations="eng-kjv eng-web"`, `data-placeholder`, `data-limit`,
 * `data-kinds`, `data-search-on-type`, `data-more`. Returns the searches made (an element already made into one is skipped).
 */
export function mountAll(api: string, selector = ".st-search", root: ParentNode = document) {
  const handles: SearchHandle[] = [];
  for (const el of root.querySelectorAll(selector)) {
    if (el.hasAttribute("data-st-mounted")) continue;
    const handle = mountSearch({ api, element: el, ...dataOptions(el) });
    if (handle) {
      el.setAttribute("data-st-mounted", "");
      handles.push(handle);
    }
  }
  return [...handles, ...mountPairs(api, root)];
}
