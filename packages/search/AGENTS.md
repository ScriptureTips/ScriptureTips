# @scripturetips/search

The core ScriptureTips search widget (vision §3.14): one engine and a set of Lit web components that all draw it. It's meant for the study window, the home page and other pages, the website widget and the browser extension, so nothing here knows about the web app.

```ts
import { getSearch } from "@scripturetips/search"; // the engine: no DOM
import "@scripturetips/search/elements"; // registers <st-search-input>, <st-search-results>, <st-search>
```

## Instances

A search is a named **instance** (`SearchEngine`, `getSearch(name)`): its query, scope, state and events. Any number can be on a page, each with its own scope (the official site's translations and notes; a user's notes alone with no scripture). They live in a registry on `globalThis`, so a page script and the elements share one even from separate bundles, and the elements add `ScriptureTipsSearch` to the page (`ScriptureTipsSearch.get("main")`).

- **Scope** (`SearchScope`): `kinds` (`reference`, `text`, `original`; others are named in the answer's `unavailable` until the server searches them), `translations` (catalog IDs), `limit`, `previewLength` (how many characters of a passage a reference result's preview shows before it's cut at a word and ended with "…"; 160 if left out). Set with `configureSearch(name, { scope })` or the elements' attributes.
- **Driving it:** `setQuery(text, { search?: true })` sets the words (events `type` with `source: "api"`), `doSearch(text?)` searches, `suggest()`, `select(id)`, `clear()`, `configure()`.
- **Subscribing:** `onType`, `onSuggest`, `onSearch`, `onResults`, `onResultsSelect`, `onError` (each returns its unsubscribe), `on(name, fn)`, and `subscribe(fn)` for every change of state. A subscriber that throws doesn't stop the others.
- **Stale answers** are ignored and in-flight requests aborted when a newer search starts. Typing asks for suggestions once it pauses (`debounceMs`).
- **Transport:** `fetchTransport("/api/search")` asks apps/api `GET /api/search` and `/api/search/suggest`; a `Transport` can be swapped in (tests, another backend).

## Elements

They bind to an instance by the `instance` attribute ("default" without one), so elements with the same name show one search wherever they are:

- `<st-search-input>`: the field, with suggestions (a combobox with a listbox: arrows, Enter, Escape). `size="large"`, `placeholder`, `hide-button`, and `results-as-suggestions`: the list also holds the search's results (verses and passages) after the book suggestions, for exactly what's in the field (the results of an earlier query aren't shown while the next is under way, so Enter can't pick a stale one), with a status line ("Searching…", "No results.") when it has nothing to list; picking one (arrows and Enter, or a click, which is when it's picked: the mouse-up must land on the item) calls the instance's `select`. The instance should have `searchOnType` for them to be there. `focus()` puts the cursor in the field.
- `<st-search-results>`: the results as a list grouped by kind, and the status. Picking one calls `select`. Content in `slot="idle"` shows before a search.
- `<st-search>`: both together.
- All take `instance`, `kinds`, `translations`, `limit`, `preview-length`, `endpoint`. They re-dispatch the engine's events as DOM events (`st-type`, `st-suggest`, `st-search`, `st-results`, `st-select`, `st-error`; bubbling, composed) for plain markup.
- Theming: CSS custom properties (`--st-search-accent`, `--st-search-ink`, `--st-search-muted`, `--st-search-rule`, `--st-search-background`, `--st-search-hit`, `--st-search-radius`; they fall back to the app's `--deep`, `--ink`, `--muted`, `--rule`, `--paper`) and `part`s (`input`, `button`, `result`, `snippet`, `hit` …; `<st-search>` exports them).
- Words are in `Strings` (en-NZ); replace any per instance with `configure({ strings })`.

## Decisions

- **Lit for the UI, a plain core underneath.** The engine has no dependency and no DOM, so the extension or a test can use it alone and the public API doesn't depend on Lit. `lit` is pinned.
- **Elements need a browser:** import `@scripturetips/search/elements` from client code (the web app loads it when the study window opens); the engine is safe to import anywhere.
- **`searchOnType`** (an instance option, off by default): searches as typing pauses (after `debounceMs`), besides asking for suggestions, which are kept beside the results; an emptied field empties the results.
- **Picking a result has a default, which a host can replace.** With no `onSelect`, picking a **verse or a run of verses** (a `reference` or `text` result whose `reference` is verses; a Hebrew or Greek word is only marked) puts it in the search field (the label as it reads in that translation, `Genesis 3:20`, a `type` event with `source: "api"`) and shows its text in place of the results: `state.passage` (`ShownPassage`: label, translation, `loading`/`done`/`error`, direction, verses with their numbers), fetched by the transport's optional `passage` (`GET {passagesEndpoint}/{translation}/passages?ref=`, `/api/translations` by default, as plain text without notes or headings, `verses.ts`), and drawn by `<st-search-results>` (parts `passage`, `passage-title`, `passage-verse`). Typing or searching again goes back to the results (`stopShowing()`); `showPassage()` does the same by hand. The `onSelect` option (`SelectHandler`: given `{ query, result }`, may be async; set with `configureSearch` or `configure`) is called **instead of the default** when a host gives one, besides the `select` event (`onResultsSelect`) and marking the result; a function that does nothing turns the default off, `null` goes back to it. A handler that throws or rejects is logged and the search carries on. Anything that follows (closing a window, a message) is the host's to do in its handler, never the widget's.
- **Planned: several actions per result.** Later a host will pass a list of actions, each with an icon, a key name and a callback, shown on every result; `onSelect` stays as the one a plain click runs. Not built: only the default action exists.
- **Not built yet:** a bundled script file for other sites and the extension (this package is TypeScript source, consumed through `transpilePackages`), translations of the strings, filters in the UI, notes and the user's own work as kinds.

Run the tests: `./toolbox pnpm --filter @scripturetips/search test` (the engine; the elements are tested end to end in `apps/web/e2e/reading-area.spec.ts`).
