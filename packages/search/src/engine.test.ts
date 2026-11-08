import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchEngine } from "./engine.ts";
import { getSearch, removeSearch, searchNames } from "./registry.ts";
import { fetchTransport, queryString } from "./transport.ts";
import type { SearchResponse, SearchResult, Suggestion, Transport } from "./types.ts";

const verse = (id: string): SearchResult => ({
  kind: "text",
  id,
  label: "John 3:16",
  reference: "John.3.16",
  translation: { id: "kjv", abbreviation: "KJV" },
  snippet: [{ t: "For God so " }, { t: "loved", hit: true }],
});

/** A transport that answers when told to, recording what it was asked. */
function fake() {
  const asked: { query: string; scope: unknown; signal: AbortSignal }[] = [];
  const waiting: ((r: SearchResponse) => void)[] = [];
  const transport: Transport = {
    search: (query, scope, signal) =>
      new Promise((resolve, reject) => {
        asked.push({ query, scope, signal });
        waiting.push(resolve);
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    suggest: async (query) => [{ kind: "word", text: `${query}…` }] satisfies Suggestion[],
    passage: async (translation, reference) => ({
      direction: "ltr",
      verses: [{ number: "16", text: `${translation}: ${reference}` }],
    }),
  };
  const answer = (index: number, ids: string[]) =>
    waiting[index]?.({ query: "", results: ids.map(verse), unavailable: [], tookMs: 1 });
  return { transport, asked, answer };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("vision §3.14: the search engine", () => {
  it("sets the words through the API without searching, and searches when told to", async () => {
    const { transport, asked, answer } = fake();
    const engine = new SearchEngine("t", { transport, scope: { kinds: ["text"] } });
    const typed: unknown[] = [];
    engine.onType((e) => typed.push(e));

    engine.setQuery("loved");
    expect(engine.getQuery()).toBe("loved");
    expect(typed).toEqual([{ query: "loved", source: "api" }]);
    expect(asked).toHaveLength(0);

    const done = engine.doSearch();
    expect(engine.getState().status).toBe("searching");
    expect(asked[0]).toMatchObject({ query: "loved", scope: { kinds: ["text"] } });
    answer(0, ["a", "b"]);
    const state = await done;
    expect(state).toMatchObject({ status: "done", searched: "loved" });
    expect(state.results.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("can set the words and search in one call", async () => {
    const { transport, asked, answer } = fake();
    const engine = new SearchEngine("t", { transport });
    const done = engine.setQuery("grace", { search: true });
    expect(asked[0]?.query).toBe("grace");
    answer(0, ["a"]);
    expect((await done)?.results).toHaveLength(1);
  });

  it("tells subscribers about each search and its results", async () => {
    const { transport, answer } = fake();
    const engine = new SearchEngine("t", { transport });
    const seen: string[] = [];
    engine.onSearch((e) => seen.push(`search ${e.query}`));
    engine.onResults((e) => seen.push(`results ${e.results.length}`));
    const done = engine.doSearch("love");
    answer(0, ["a", "b", "c"]);
    await done;
    expect(seen).toEqual(["search love", "results 3"]);
  });

  it("asks for suggestions once typing pauses, and for the last thing typed", async () => {
    const { transport } = fake();
    const engine = new SearchEngine("t", { transport, debounceMs: 100 });
    const events: unknown[] = [];
    engine.onType((e) => events.push(e));
    const suggestions: unknown[] = [];
    engine.onSuggest((e) => suggestions.push(e));

    engine.type("l");
    engine.type("lo");
    engine.type("lov");
    expect(events).toEqual([
      { query: "l", source: "user" },
      { query: "lo", source: "user" },
      { query: "lov", source: "user" },
    ]);
    await vi.advanceTimersByTimeAsync(99);
    expect(suggestions).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(suggestions).toEqual([{ query: "lov", suggestions: [{ kind: "word", text: "lov…" }] }]);
    expect(engine.getState().suggestions).toHaveLength(1);

    engine.type("");
    expect(engine.getState().suggestions).toEqual([]);
  });

  it("ignores a late answer to an earlier search, and cancels it", async () => {
    const { transport, asked, answer } = fake();
    const engine = new SearchEngine("t", { transport });
    const first = engine.doSearch("one");
    const second = engine.doSearch("two");
    expect(asked[0]?.signal.aborted).toBe(true);
    answer(1, ["two"]);
    answer(0, ["one"]);
    await Promise.all([first, second]);
    expect(engine.getState()).toMatchObject({ searched: "two", status: "done" });
    expect(engine.getState().results.map((r) => r.id)).toEqual(["two"]);
  });

  it("picks a result, telling subscribers which", async () => {
    const { transport, answer } = fake();
    const engine = new SearchEngine("t", { transport });
    const picked: unknown[] = [];
    engine.onResultsSelect((e) => picked.push(e.result.id));
    const done = engine.doSearch("love");
    answer(0, ["a", "b"]);
    await done;
    engine.select("b");
    engine.select("nothing");
    expect(picked).toEqual(["b"]);
    expect(engine.getState().selected).toBe("b");
  });

  describe("the searchOnType option", () => {
    it("searches as typing pauses, keeping the suggestions beside the results", async () => {
      const { transport, asked, answer } = fake();
      const engine = new SearchEngine("t", { transport, debounceMs: 100, searchOnType: true });
      engine.type("lov");
      await vi.advanceTimersByTimeAsync(99);
      expect(asked).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(2);
      expect(asked).toHaveLength(1);
      expect(asked[0]).toMatchObject({ query: "lov" });
      answer(0, ["a"]);
      await vi.advanceTimersByTimeAsync(0);
      const state = engine.getState();
      expect(state).toMatchObject({ status: "done", searched: "lov" });
      expect(state.results.map((r) => r.id)).toEqual(["a"]);
      expect(state.suggestions).toEqual([{ kind: "word", text: "lov…" }]);
    });

    it("empties the results when the field is emptied", async () => {
      const { transport, answer } = fake();
      const engine = new SearchEngine("t", { transport, debounceMs: 100, searchOnType: true });
      engine.type("love");
      await vi.advanceTimersByTimeAsync(101);
      answer(0, ["a"]);
      await vi.advanceTimersByTimeAsync(0);
      expect(engine.getState().results).toHaveLength(1);
      engine.type("");
      await vi.advanceTimersByTimeAsync(0);
      expect(engine.getState()).toMatchObject({ status: "idle", results: [], query: "" });
    });

    it("does nothing of the kind by default", async () => {
      const { transport, asked } = fake();
      const engine = new SearchEngine("t", { transport, debounceMs: 100 });
      engine.type("love");
      await vi.advanceTimersByTimeAsync(500);
      expect(asked).toHaveLength(0);
      expect(engine.getState().suggestions).toHaveLength(1);
    });
  });

  describe("the onSelect option", () => {
    const searched = async (engine: SearchEngine, answer: (i: number, ids: string[]) => void) => {
      const done = engine.doSearch("love");
      answer(0, ["a", "b"]);
      await done;
    };

    it("by default, picking a verse puts it in the field and shows its text in place of the results", async () => {
      const { transport, answer } = fake();
      const engine = new SearchEngine("t", { transport });
      await searched(engine, answer);
      engine.select("a");
      expect(engine.getState()).toMatchObject({
        selected: "a",
        query: "John 3:16",
        passage: { label: "John 3:16", translation: { id: "kjv" }, status: "loading" },
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(engine.getState().passage).toMatchObject({
        status: "done",
        direction: "ltr",
        verses: [{ number: "16", text: "kjv: John 3:16" }],
      });
      // The results are still there to go back to: typing goes back to them.
      expect(engine.getState().results).toHaveLength(2);
      engine.type("lov");
      expect(engine.getState().passage).toBeNull();
    });

    it("by default, a search goes back from the passage, and a passage that can't be had says so", async () => {
      const { transport, answer } = fake();
      const failing: Transport = {
        ...transport,
        passage: () => Promise.reject(new Error("no")),
      };
      const engine = new SearchEngine("t", { transport: failing });
      const errors: string[] = [];
      engine.onError((e) => errors.push(e.error.message));
      await searched(engine, answer);
      engine.select("a");
      await vi.advanceTimersByTimeAsync(0);
      expect(engine.getState().passage).toMatchObject({ status: "error" });
      expect(errors).toEqual(["no"]);
      const again = engine.doSearch("love");
      expect(engine.getState().passage).toBeNull();
      answer(1, ["a"]);
      await again;
    });

    it("by default, a result that isn't a verse (a Hebrew or Greek word) is only marked", async () => {
      const { transport } = fake();
      const word: Transport = {
        ...transport,
        search: async () => ({
          query: "god",
          unavailable: [],
          tookMs: 1,
          results: [
            {
              kind: "original",
              id: "w",
              strong: "H0430",
              headword: "אֱלֹהִים",
              transliteration: null,
              gloss: "God",
              partOfSpeech: null,
              category: "name",
              occurrences: 2600,
            },
          ],
        }),
      };
      const engine = new SearchEngine("t", { transport: word });
      await engine.doSearch("god");
      engine.select("w");
      expect(engine.getState()).toMatchObject({ selected: "w", query: "god", passage: null });
    });

    it("a host's handler stands in for the default: the field and results stay as they were", async () => {
      const { transport, answer } = fake();
      const engine = new SearchEngine("t", { transport, onSelect: () => undefined });
      await searched(engine, answer);
      engine.select("a");
      expect(engine.getState()).toMatchObject({ selected: "a", query: "love", passage: null });
    });

    it("calls the host's handler with the picked result, as well as telling subscribers", async () => {
      const { transport, answer } = fake();
      const calls: string[] = [];
      const engine = new SearchEngine("t", {
        transport,
        onSelect: (e) => {
          calls.push(`handler:${e.result.id}:${e.query}`);
        },
      });
      engine.onResultsSelect((e) => calls.push(`event:${e.result.id}`));
      await searched(engine, answer);
      engine.select("b");
      engine.select("nothing");
      expect(calls).toEqual(["event:b", "handler:b:love"]);
    });

    it("logs a handler that throws or rejects, and carries on", async () => {
      const { transport, answer } = fake();
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const engine = new SearchEngine("t", { transport });
      await searched(engine, answer);
      engine.configure({
        onSelect: () => {
          throw new Error("sync");
        },
      });
      expect(() => engine.select("a")).not.toThrow();
      engine.configure({ onSelect: () => Promise.reject(new Error("async")) });
      engine.select("b");
      await Promise.resolve();
      await Promise.resolve();
      expect(logged).toHaveBeenCalledTimes(2);
      expect(engine.getState().selected).toBe("b");
      logged.mockRestore();
    });

    it("stays through other changes to the instance, and null takes it away", async () => {
      const { transport, answer } = fake();
      const picked: string[] = [];
      const engine = new SearchEngine("t", { transport });
      engine.configure({ onSelect: (e) => void picked.push(e.result.id) });
      engine.configure({ scope: { limit: 5 } });
      await searched(engine, answer);
      engine.select("a");
      expect(engine.getState().passage).toBeNull();
      engine.configure({ onSelect: null });
      engine.select("b");
      // Back to the default: the passage is shown, and the host's handler isn't called.
      expect(picked).toEqual(["a"]);
      expect(engine.getState().passage).toMatchObject({ label: "John 3:16" });
    });
  });

  it("reports a failed search in its state and to subscribers", async () => {
    const engine = new SearchEngine("t", {
      transport: {
        search: async () => {
          throw new Error("down");
        },
        suggest: async () => [],
      },
    });
    const errors: string[] = [];
    engine.onError((e) => errors.push(e.error.message));
    await engine.doSearch("love");
    expect(engine.getState()).toMatchObject({ status: "error", error: "down", results: [] });
    expect(errors).toEqual(["down"]);
  });

  it("searches nothing for empty words, and clears", async () => {
    const { transport, asked, answer } = fake();
    const engine = new SearchEngine("t", { transport });
    await engine.doSearch("  ");
    expect(asked).toHaveLength(0);
    const done = engine.doSearch("love");
    answer(0, ["a"]);
    await done;
    engine.clear();
    expect(engine.getState()).toMatchObject({ query: "", status: "idle", results: [] });
  });

  it("lets a subscriber be removed, and one that throws not stop the others", async () => {
    const engine = new SearchEngine("t", { transport: fake().transport });
    const seen: string[] = [];
    engine.onType(() => {
      throw new Error("bad subscriber");
    });
    const off = engine.onType((e) => seen.push(e.query));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    engine.setQuery("a");
    off();
    engine.setQuery("b");
    expect(seen).toEqual(["a"]);
    error.mockRestore();
  });

  it("tells state subscribers of every change", async () => {
    const engine = new SearchEngine("t", { transport: fake().transport });
    const seen: string[] = [];
    const off = engine.subscribe((s) => seen.push(s.query));
    engine.setQuery("x");
    off();
    engine.setQuery("y");
    expect(seen).toEqual(["x"]);
  });

  it("changes scope a part at a time", () => {
    const engine = new SearchEngine("t", { scope: { kinds: ["text"], limit: 5 } });
    engine.configure({ scope: { translations: ["kjv"] } });
    expect(engine.getScope()).toEqual({ kinds: ["text"], limit: 5, translations: ["kjv"] });
  });
});

describe("several searches on one page", () => {
  it("keep their own scope, state and subscribers", async () => {
    const official = fake();
    const notes = fake();
    const main = new SearchEngine("main", {
      transport: official.transport,
      scope: { kinds: ["reference", "text"], translations: ["kjv", "web"] },
    });
    const mine = new SearchEngine("my-notes", {
      transport: notes.transport,
      scope: { kinds: ["notes"] },
    });
    const mainResults: number[] = [];
    main.onResults((e) => mainResults.push(e.results.length));

    const a = main.doSearch("grace");
    const b = mine.doSearch("grace");
    expect(official.asked[0]?.scope).toEqual({
      kinds: ["reference", "text"],
      translations: ["kjv", "web"],
    });
    expect(notes.asked[0]?.scope).toEqual({ kinds: ["notes"] });
    official.answer(0, ["v1", "v2"]);
    notes.answer(0, ["n1"]);
    await Promise.all([a, b]);
    expect(main.getState().results).toHaveLength(2);
    expect(mine.getState().results).toHaveLength(1);
    expect(mainResults).toEqual([2]);
    main.setQuery("other");
    expect(mine.getQuery()).toBe("grace");
  });
});

describe("the registry", () => {
  afterEach(() => {
    for (const name of searchNames()) removeSearch(name);
  });

  it("gives the same engine for the same name, wherever it's asked", () => {
    const a = getSearch("main", { scope: { kinds: ["text"] } });
    expect(getSearch("main")).toBe(a);
    expect(getSearch("other")).not.toBe(a);
    expect(getSearch("main", { scope: { limit: 3 } }).getScope()).toEqual({
      kinds: ["text"],
      limit: 3,
    });
    expect(searchNames().sort()).toEqual(["main", "other"]);
  });

  it("forgets a removed search", () => {
    const a = getSearch("gone");
    removeSearch("gone");
    expect(searchNames()).not.toContain("gone");
    expect(getSearch("gone")).not.toBe(a);
  });
});

describe("the API transport", () => {
  it("puts the words and the scope in the address", () => {
    const params = new URLSearchParams(
      queryString("jn 3:16", {
        kinds: ["reference", "text"],
        translations: ["kjv"],
        limit: 5,
        previewLength: 400,
      }),
    );
    expect(Object.fromEntries(params)).toEqual({
      q: "jn 3:16",
      kinds: "reference,text",
      translations: "kjv",
      limit: "5",
      previewLength: "400",
    });
    expect(queryString("love", {})).toBe("q=love");
  });

  it("asks the search and suggest addresses, and fails on a bad answer", async () => {
    const urls: string[] = [];
    const ok = (async (url: string) => {
      urls.push(url);
      return new Response(
        JSON.stringify({
          query: "x",
          results: [],
          unavailable: [],
          tookMs: 1,
          suggestions: [{ kind: "word", text: "x" }],
        }),
      );
    }) as unknown as typeof fetch;
    const t = fetchTransport("/api/search", ok);
    const signal = new AbortController().signal;
    await t.search("x", { kinds: ["text"] }, signal);
    expect(await t.suggest("x", {}, signal)).toEqual([{ kind: "word", text: "x" }]);
    expect(urls).toEqual(["/api/search?q=x&kinds=text", "/api/search/suggest?q=x"]);
    const bad = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    await expect(fetchTransport("/api/search", bad).search("x", {}, signal)).rejects.toThrow("500");
  });

  it("gets a passage's words from the translations endpoint, without notes or headings", async () => {
    const urls: string[] = [];
    const answer = (async (url: string) => {
      urls.push(url);
      return new Response(
        JSON.stringify({
          translation: { direction: "rtl" },
          passages: [
            {
              verses: [
                { verse: 0, to: null, published: null, content: ["A heading."] },
                {
                  verse: 1,
                  to: null,
                  published: null,
                  content: [
                    "In the ",
                    { type: "char", marker: "w", content: ["beginning"] },
                    { type: "note", position: 0 },
                    " ",
                    { type: "heading", marker: "s", content: ["Skipped"] },
                    "God.",
                  ],
                },
                { verse: 2, to: 3, published: null, content: ["Bridged."] },
              ],
            },
          ],
        }),
      );
    }) as unknown as typeof fetch;
    const t = fetchTransport("/api/search", answer, "/api/t");
    const signal = new AbortController().signal;
    expect(await t.passage?.("eng-kjv", "Genesis 1:1–3", signal)).toEqual({
      direction: "rtl",
      verses: [
        { number: "", text: "A heading." },
        { number: "1", text: "In the beginning God." },
        { number: "2–3", text: "Bridged." },
      ],
    });
    expect(urls).toEqual(["/api/t/eng-kjv/passages?ref=Genesis%201%3A1%E2%80%933"]);
  });
});
