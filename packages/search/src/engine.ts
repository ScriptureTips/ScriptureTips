import { DEFAULT_STRINGS } from "./strings.ts";
import { fetchTransport } from "./transport.ts";
import type {
  SearchEventName,
  SearchEvents,
  SearchOptions,
  SearchResult,
  SearchScope,
  SearchState,
  SelectHandler,
  ShownPassage,
  Strings,
  Transport,
  Unsubscribe,
} from "./types.ts";
import { isVerseRange } from "./verses.ts";

type Handler<K extends SearchEventName> = (event: SearchEvents[K]) => void;

const EMPTY: SearchState = {
  query: "",
  searched: "",
  status: "idle",
  results: [],
  unavailable: [],
  suggestions: [],
  selected: null,
  error: null,
  passage: null,
};

/**
 * One search: its query, scope and results, and the events around them. The elements
 * (`<st-search-input>`, `<st-search-results>` …) that share an instance name all draw this one
 * state; an integration reads and drives it through the same methods. No DOM in here, so a
 * page script, an extension or a test can use it alone.
 *
 * - `setQuery(text)` puts the words in the field (and `{ search: true }` runs them), `doSearch()`
 *   runs the search, `suggest()` asks for suggestions, `select(result)` picks a result (and calls
 *   the `onSelect` option, if the host gave one).
 * - `onType`, `onSuggest`, `onResults`, `onResultsSelect`, `onSearch`, `onError` subscribe to the
 *   events, and `subscribe` to every change of state; each returns what ends it.
 */
export class SearchEngine {
  readonly name: string;
  private endpoint = "/api/search";
  private scope: SearchScope = {};
  private debounceMs = 200;
  private custom: Transport | null = null;
  private words: Strings = DEFAULT_STRINGS;
  private picked: SelectHandler | null = null;
  private searchOnType = false;
  private passagesEndpoint = "/api/translations";
  private showing: AbortController | null = null;
  private state: SearchState = EMPTY;
  private readonly listeners = new Set<(state: SearchState) => void>();
  private readonly handlers = new Map<SearchEventName, Set<(event: never) => void>>();
  private running: AbortController | null = null;
  private suggesting: AbortController | null = null;
  private pause: ReturnType<typeof setTimeout> | null = null;
  /** Each search and suggestion has a number, so a late answer to an old one is ignored. */
  private latest = { search: 0, suggest: 0 };

  constructor(name: string, options: SearchOptions = {}) {
    this.name = name;
    this.configure(options);
  }

  /** Changes how this instance searches: its scope, endpoint and words. What's left out stays. */
  configure(options: SearchOptions): void {
    if (options.endpoint !== undefined) this.endpoint = options.endpoint;
    if (options.scope) this.scope = { ...this.scope, ...options.scope };
    if (options.debounceMs !== undefined) this.debounceMs = options.debounceMs;
    if (options.transport) this.custom = options.transport;
    if (options.strings) this.words = { ...this.words, ...options.strings };
    if (options.onSelect !== undefined) this.picked = options.onSelect;
    if (options.searchOnType !== undefined) this.searchOnType = options.searchOnType;
    if (options.passagesEndpoint !== undefined) this.passagesEndpoint = options.passagesEndpoint;
    this.emitChange();
  }

  get strings(): Strings {
    return this.words;
  }

  getScope(): SearchScope {
    return this.scope;
  }

  private get transport(): Transport {
    return this.custom ?? fetchTransport(this.endpoint, fetch, this.passagesEndpoint);
  }

  // ---- State.

  getState(): SearchState {
    return this.state;
  }

  getQuery(): string {
    return this.state.query;
  }

  /** Listens for every change of state (what the elements draw). */
  subscribe(listener: (state: SearchState) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private update(change: Partial<SearchState>): void {
    this.state = { ...this.state, ...change };
    this.emitChange();
  }

  private emitChange(): void {
    for (const l of [...this.listeners]) l(this.state);
  }

  // ---- Events.

  on<K extends SearchEventName>(event: K, handler: Handler<K>): Unsubscribe {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as (event: never) => void);
    this.handlers.set(event, set);
    return () => set.delete(handler as (event: never) => void);
  }

  /** The query changed: typed (`source: "user"`), or set through the API. */
  onType = (handler: Handler<"type">): Unsubscribe => this.on("type", handler);
  /** Suggestions for the query arrived. */
  onSuggest = (handler: Handler<"suggest">): Unsubscribe => this.on("suggest", handler);
  /** A search began. */
  onSearch = (handler: Handler<"search">): Unsubscribe => this.on("search", handler);
  /** A search's results arrived. */
  onResults = (handler: Handler<"results">): Unsubscribe => this.on("results", handler);
  /** A result was picked. */
  onResultsSelect = (handler: Handler<"select">): Unsubscribe => this.on("select", handler);
  /** A search or suggestion failed. */
  onError = (handler: Handler<"error">): Unsubscribe => this.on("error", handler);

  private emit<K extends SearchEventName>(event: K, payload: SearchEvents[K]): void {
    for (const h of [...(this.handlers.get(event) ?? [])]) {
      // A subscriber that throws doesn't stop the search or the others.
      try {
        (h as Handler<K>)(payload);
      } catch (error) {
        console.error(`search "${this.name}": a ${event} handler threw`, error);
      }
    }
  }

  // ---- Driving it.

  /**
   * Puts words in the search field. Through the API (`source: "api"`), an integration sets what
   * to look for; `{ search: true }` runs it at once.
   */
  setQuery(query: string, options: { search?: boolean } = {}): Promise<SearchState> | void {
    this.changeQuery(query, "api");
    if (options.search) return this.doSearch();
  }

  /** The user typed: the words change, and suggestions are asked for after typing pauses. */
  type(query: string): void {
    this.changeQuery(query, "user");
    if (this.pause) clearTimeout(this.pause);
    this.suggesting?.abort();
    if (query.trim() === "") {
      this.update({ suggestions: [] });
      // An emptied field empties the results too.
      if (this.searchOnType) void this.doSearch();
      return;
    }
    this.pause = setTimeout(() => {
      void this.suggest(query);
      if (this.searchOnType) void this.doSearch();
    }, this.debounceMs);
  }

  private changeQuery(query: string, source: "user" | "api"): void {
    if (query === this.state.query) return;
    // Typing goes back from a shown passage to the results.
    if (source === "user" && this.state.passage) this.stopShowing();
    this.update({ query });
    this.emit("type", { query, source });
  }

  /** Searches (the given words, or what's in the field) in this instance's scope. */
  async doSearch(query?: string): Promise<SearchState> {
    if (query !== undefined) this.changeQuery(query, "api");
    const text = this.state.query.trim();
    if (this.pause) clearTimeout(this.pause);
    // Searching as the user types keeps the suggestions beside the results.
    if (!this.searchOnType) this.suggesting?.abort();
    this.running?.abort();
    if (text === "") {
      this.update({ ...EMPTY, query: this.state.query });
      return this.state;
    }
    const mine = ++this.latest.search;
    const controller = new AbortController();
    this.running = controller;
    this.stopShowing();
    this.update({
      status: "searching",
      searched: text,
      suggestions: this.searchOnType ? this.state.suggestions : [],
      error: null,
      selected: null,
    });
    this.emit("search", { query: text, scope: this.scope });
    try {
      const found = await this.transport.search(text, this.scope, controller.signal);
      if (mine !== this.latest.search) return this.state;
      this.update({
        status: "done",
        results: found.results,
        unavailable: found.unavailable,
        error: null,
      });
      this.emit("results", {
        query: text,
        results: found.results,
        unavailable: found.unavailable,
        tookMs: found.tookMs,
      });
    } catch (error) {
      if (mine !== this.latest.search || controller.signal.aborted) return this.state;
      const failure = error instanceof Error ? error : new Error(String(error));
      this.update({ status: "error", results: [], unavailable: [], error: failure.message });
      this.emit("error", { query: text, error: failure });
    }
    return this.state;
  }

  /** Asks for suggestions for the given words (or what's in the field). */
  async suggest(query?: string): Promise<SearchState["suggestions"]> {
    const text = (query ?? this.state.query).trim();
    if (text === "") {
      this.update({ suggestions: [] });
      return [];
    }
    this.suggesting?.abort();
    const mine = ++this.latest.suggest;
    const controller = new AbortController();
    this.suggesting = controller;
    try {
      const suggestions = await this.transport.suggest(text, this.scope, controller.signal);
      if (mine !== this.latest.suggest) return this.state.suggestions;
      this.update({ suggestions });
      this.emit("suggest", { query: text, suggestions });
      return suggestions;
    } catch (error) {
      if (mine !== this.latest.suggest || controller.signal.aborted) return this.state.suggestions;
      this.emit("error", {
        query: text,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return [];
    }
  }

  /** Picks a result, as the user does by clicking it. */
  select(id: string): void {
    const result = this.state.results.find((r) => r.id === id);
    if (!result) return;
    this.update({ selected: id });
    const event = { query: this.state.searched, result };
    this.emit("select", event);
    // The host's own handler, if it gave one: a failure is logged and goes no further.
    const handler = this.picked;
    if (!handler) {
      this.pickPassage(result);
      return;
    }
    const failed = (error: unknown) =>
      console.error(`search "${this.name}": the onSelect handler threw`, error);
    try {
      void Promise.resolve(handler(event)).catch(failed);
    } catch (error) {
      failed(error);
    }
  }

  /**
   * The widget's own action for a picked result, when the host gave none: a verse or a run of
   * verses goes into the search field and its text is shown in place of the results; anything
   * else is only marked.
   */
  private pickPassage(result: SearchResult): void {
    if (result.kind === "original" || !isVerseRange(result.reference)) return;
    this.changeQuery(result.label, "api");
    void this.showPassage({ label: result.label, translation: result.translation });
  }

  /**
   * Shows a passage's text in place of the results (what picking one does by default); `label` is
   * the reference as it reads in that translation. Searching again, or typing, goes back.
   */
  async showPassage(passage: Pick<ShownPassage, "label" | "translation">): Promise<void> {
    this.showing?.abort();
    const controller = new AbortController();
    this.showing = controller;
    const base = { ...passage, direction: "ltr" as const, verses: [] };
    this.update({ passage: { ...base, status: "loading" } });
    try {
      const transport = this.transport;
      if (!transport.passage) throw new Error("This search can't fetch a passage.");
      const text = await transport.passage(
        passage.translation.id,
        passage.label,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.update({
        passage: { ...base, status: "done", direction: text.direction, verses: text.verses },
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      this.update({ passage: { ...base, status: "error" } });
      this.emit("error", {
        query: passage.label,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /** Goes back from a shown passage to the results. */
  stopShowing(): void {
    this.showing?.abort();
    this.showing = null;
    if (this.state.passage) this.update({ passage: null });
  }

  /** Empties the field and the results. */
  clear(): void {
    this.showing?.abort();
    this.running?.abort();
    this.suggesting?.abort();
    if (this.pause) clearTimeout(this.pause);
    this.latest.search++;
    this.latest.suggest++;
    const changed = this.state.query !== "";
    this.state = EMPTY;
    this.emitChange();
    if (changed) this.emit("type", { query: "", source: "api" });
  }

  /** Ends this instance's work and listeners. */
  destroy(): void {
    this.clear();
    this.listeners.clear();
    this.handlers.clear();
  }
}
