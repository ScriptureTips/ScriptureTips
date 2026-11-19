import { html, nothing } from "lit";
import type { SearchEngine } from "../engine.ts";
import type { SearchResult, Suggestion } from "../types.ts";
import { SearchElement } from "./base.ts";
import { inputStyles, tokens } from "./styles.ts";

/**
 * `<st-search-input instance="main">`: the search field, with suggestions as the user types. It
 * draws the instance's query, so setting it through the API fills the field. Attributes:
 * `size="large"` for a big field, `placeholder`, `hide-button`, and `results-as-suggestions`: the
 * list under the field then holds the search's results too (the verses and passages found for
 * what's typed so far, after the book suggestions), picked with the arrow keys and Enter or a
 * click, which picks the result (`select`, and the instance's `onSelect`). The instance should
 * search as typing pauses (`searchOnType`) for them to be there.
 *
 * It passes on the instance's events as DOM events: `st-type`, `st-suggest`, `st-search`.
 */
/** A line of the list: a suggestion, or a result of the search. */
type Row = { readonly suggestion: Suggestion } | { readonly result: SearchResult };

export class StSearchInput extends SearchElement {
  static override properties = {
    ...SearchElement.properties,
    placeholder: { type: String },
    size: { type: String, reflect: true },
    hideButton: { type: Boolean, attribute: "hide-button" },
    resultsAsSuggestions: { type: Boolean, attribute: "results-as-suggestions" },
    open: { state: true },
    active: { state: true },
  };
  static override styles = [tokens, inputStyles];

  declare placeholder: string | undefined;
  declare size: string | undefined;
  declare hideButton: boolean;
  declare resultsAsSuggestions: boolean;
  declare open: boolean;
  declare active: number;

  constructor() {
    super();
    this.hideButton = false;
    this.resultsAsSuggestions = false;
    this.open = false;
    this.active = -1;
  }

  protected override wire(engine: SearchEngine): (() => void)[] {
    return [
      engine.onType((e) => this.fire("st-type", e)),
      engine.onSuggest((e) => this.fire("st-suggest", e)),
      engine.onSearch((e) => this.fire("st-search", e)),
    ];
  }

  /** Puts the cursor in the field (the element itself isn't what takes the focus). */
  override focus(options?: FocusOptions): void {
    this.renderRoot.querySelector("input")?.focus(options);
  }

  /**
   * What the list holds, in order: the suggestions, then (with `results-as-suggestions`) the
   * results for exactly what's in the field now. The results of an earlier query aren't shown
   * while the next is under way, so Enter can't pick a passage the field no longer asks for.
   */
  private rows(engine: SearchEngine): Row[] {
    const state = engine.getState();
    const rows: Row[] = state.suggestions.map((suggestion) => ({ suggestion }));
    if (
      this.resultsAsSuggestions &&
      state.status === "done" &&
      state.searched === state.query.trim()
    )
      for (const result of state.results) if (result.kind !== "original") rows.push({ result });
    return rows;
  }

  private choose(row: Row): void {
    const engine = this.engine;
    if (!engine) return;
    this.open = false;
    this.active = -1;
    if ("result" in row) {
      engine.select(row.result.id);
      return;
    }
    // A book starts a reference, so the user goes on typing; a word is searched.
    if (row.suggestion.kind === "book") engine.setQuery(`${row.suggestion.text} `);
    else void engine.setQuery(row.suggestion.text, { search: true });
  }

  /** A line in the open list when the field is asking and nothing has come back to list. */
  private status(engine: SearchEngine): string | null {
    const state = engine.getState();
    if (!this.resultsAsSuggestions || state.query.trim() === "") return null;
    const t = engine.strings;
    if (state.searched !== state.query.trim()) return null;
    if (state.status === "searching") return t.searching;
    if (state.status === "error") return t.failed;
    return state.status === "done" && this.rows(engine).length === 0 ? t.noResults : null;
  }

  private onKey(e: KeyboardEvent): void {
    const options = this.engine ? this.rows(this.engine) : [];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (options.length === 0) return;
      e.preventDefault();
      this.open = true;
      // Down and up go round the suggestions, with "none" (-1) between the last and the first.
      const last = options.length - 1;
      if (e.key === "ArrowDown") this.active = this.active >= last ? -1 : this.active + 1;
      else this.active = this.active <= -1 ? last : this.active - 1;
    } else if (e.key === "Enter" && this.open && this.active >= 0) {
      const picked = options[this.active];
      if (picked) {
        e.preventDefault();
        this.choose(picked);
      }
    } else if (e.key === "Escape") {
      this.open = false;
      this.active = -1;
    }
  }

  /** A result in the list: where it is, the translation, and its start or the words matched. */
  private result(r: SearchResult) {
    if (r.kind === "original") return nothing;
    return html`<span class="label" part="label">${r.label}</span>
      <small part="source">${r.translation.abbreviation}</small
      >${
        r.kind === "reference"
          ? r.preview
            ? html`<span class="preview" part="preview">${r.preview}</span>`
            : nothing
          : html`<span class="preview" part="snippet">${r.snippet.map((p) => (p.hit ? html`<mark part="hit">${p.t}</mark>` : p.t))}</span>${(
              r.also ?? []
            ).map(
              (a) =>
                html`<span class="preview" part="snippet"
                  ><small part="source">${a.translation.abbreviation}</small>
                  ${a.snippet.map((p) => (p.hit ? html`<mark part="hit">${p.t}</mark>` : p.t))}</span
                >`,
            )}`
      }`;
  }

  protected override render() {
    const engine = this.engine;
    if (!engine) return nothing;
    const state = engine.getState();
    const t = engine.strings;
    const options = this.rows(engine);
    const line = this.open ? this.status(engine) : null;
    const showing = this.open && (options.length > 0 || line !== null);
    return html`
      <form
        part="form"
        role="search"
        @submit=${(e: Event) => {
          e.preventDefault();
          // Searched as the user asks, and (for results in the list) the list stays for them.
          this.open = this.resultsAsSuggestions;
          void engine.doSearch();
        }}
      >
        <input
          part="input"
          type="search"
          role="combobox"
          autocomplete="off"
          aria-autocomplete="list"
          aria-expanded=${showing ? "true" : "false"}
          aria-controls="suggestions"
          aria-activedescendant=${showing && this.active >= 0 ? `s${this.active}` : nothing}
          aria-label=${t.label}
          placeholder=${this.placeholder ?? t.placeholder}
          .value=${state.query}
          @input=${(e: Event) => {
            this.open = true;
            this.active = -1;
            engine.type((e.target as HTMLInputElement).value);
          }}
          @keydown=${(e: KeyboardEvent) => this.onKey(e)}
          @blur=${() => {
            this.open = false;
          }}
        />
        ${this.hideButton ? nothing : html`<button part="button" type="submit">${t.search}</button>`}
        ${
          showing
            ? html`<ul id="suggestions" part="suggestions" role="listbox" aria-label=${t.suggestions}>
                ${options.map(
                  (o, i) => html`<li
                    id=${`s${i}`}
                    part=${"result" in o ? "suggestion result" : "suggestion"}
                    role="option"
                    aria-selected=${i === this.active ? "true" : "false"}
                    @mousedown=${(e: Event) => e.preventDefault()}
                    @click=${() => this.choose(o)}
                  >
                    ${
                      "result" in o
                        ? this.result(o.result)
                        : html`${o.suggestion.text}${o.suggestion.kind === "book" ? html`<small>${t.kinds["reference"] ?? ""}</small>` : nothing}`
                    }
                  </li>`,
                )}
                ${line !== null ? html`<li part="status" role="presentation" class="status">${line}</li>` : nothing}
              </ul>`
            : nothing
        }
      </form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "st-search-input": StSearchInput;
  }
}
