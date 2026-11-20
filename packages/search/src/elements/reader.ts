// cspell:ignore noreferrer
import { css, html, LitElement, nothing } from "lit";
import {
  type Place,
  parsePlace,
  type ReaderApi,
  type ReaderBook,
  type ReaderChapter,
  type ReaderTranslation,
  readerApi,
  step,
  versesIn,
  widen,
} from "../reader-model.ts";
import { fill } from "../strings.ts";
import { tokens } from "./styles.ts";

/** The reader's words (en-NZ). Replace any with the element's `strings` property. */
export const READER_STRINGS = {
  previous: "Previous: {chapter}",
  next: "Next: {chapter}",
  books: "Books",
  oldTestament: "Old Testament",
  newTestament: "New Testament",
  other: "Other",
  chapters: "Chapters",
  translation: "Translation",
  back: "Back to the results",
  loading: "Loading…",
  failed: "The passage didn't load. Try again.",
  noVerses: "This passage isn't in this translation.",
  context: "Read in context",
  wholeChapter: "Read the whole chapter",
  more: "The chapter goes on past what is shown here.",
};
export type ReaderStrings = typeof READER_STRINGS;

type Menu = "books" | "chapters" | null;

/**
 * `<st-reader api="https://scripture.tips/api">`: the widget's read view, what picking a passage
 * opens. The blue bar with the book and chapter and the previous and next chapter, a book picker
 * and a chapter list, a translation picker, the passage, and under a part of a chapter *Read in
 * context* and *Read the whole chapter*. It reads the data server's public `/api/widget` routes
 * only. `show(translation, osis)` opens a passage; it fires `st-reader-close` when the reader asks
 * to go back to what was before it (the results).
 */
export class StReader extends LitElement {
  static override properties = {
    api: { type: String },
    strings: { attribute: false },
    translations: { attribute: false },
    place: { state: true },
    translation: { state: true },
    books: { state: true },
    chapter: { state: true },
    status: { state: true },
    menu: { state: true },
    available: { state: true },
  };
  static override styles = [
    tokens,
    css`
      :host {
        display: block;
        margin-top: 0.6rem;
      }
      :host([hidden]) {
        display: none;
      }
      header {
        display: flex;
        align-items: center;
        height: 3rem;
        color: var(--_ink);
        background: var(--_bar);
        border-radius: var(--_radius) var(--_radius) 0 0;
      }
      .step {
        flex: none;
        align-self: stretch;
        width: 2.6rem;
        font: inherit;
        font-size: 1.6rem;
        color: inherit;
        background: none;
        border: 0;
        cursor: pointer;
      }
      .step:disabled {
        opacity: 0.35;
        cursor: default;
      }
      h3 {
        display: contents;
        margin: 0;
        font: inherit;
      }
      .title {
        position: relative;
        flex: 1;
        display: flex;
        gap: 0.4rem;
        align-items: center;
        justify-content: center;
        padding: 0;
        font-size: 1.15rem;
        font-weight: 600;
      }
      .title button {
        font: inherit;
        color: inherit;
        background: none;
        border: 0;
        border-bottom: 1px dotted currentColor;
        cursor: pointer;
      }
      .panel {
        position: absolute;
        z-index: 10;
        top: 100%;
        inset-inline: 0;
        max-height: 18rem;
        overflow: auto;
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        padding: 0.6rem;
        color: var(--_ink);
        font-size: 1rem;
        font-weight: 400;
        background: var(--_background);
        border: 1px solid var(--_rule);
        box-shadow: 0 0.4rem 1rem rgb(0 30 60 / 0.15);
      }
      .panel.books {
        display: block;
      }
      .panel h4 {
        margin: 0.4rem 0 0.3rem;
        color: var(--_muted);
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
      }
      .panel .group {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
      }
      .panel button {
        padding: 0.25rem 0.55rem;
        color: var(--_ink);
        border: 1px solid var(--_rule);
        border-radius: var(--_radius);
      }
      .panel button[aria-current="true"] {
        color: #fff;
        background: var(--_accent);
        border-color: var(--_accent);
      }
      .bar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0;
        font-size: 0.9rem;
      }
      select,
      .bar button {
        font: inherit;
        color: var(--_ink);
        background: var(--_background);
        border: 1px solid var(--_rule);
        border-radius: var(--_radius);
        padding: 0.25rem 0.5rem;
      }
      .bar button {
        cursor: pointer;
      }
      button:focus-visible,
      select:focus-visible {
        outline: 2px solid var(--_accent);
        outline-offset: 1px;
      }
      article p {
        margin: 0.4rem 0;
        line-height: 1.55;
      }
      sup {
        margin-inline-end: 0.2rem;
        color: var(--_muted);
        font-size: 0.7em;
      }
      .links {
        display: flex;
        gap: 1rem;
        margin-top: 0.8rem;
      }
      .links button {
        padding: 0;
        font: inherit;
        color: var(--_accent);
        background: none;
        border: 0;
        text-decoration: underline;
        cursor: pointer;
      }
      .credit,
      .note {
        color: var(--_muted);
        font-size: 0.85em;
      }
      .credit a {
        color: inherit;
      }
    `,
  ];

  declare api: string;
  declare strings: Partial<ReaderStrings> | undefined;
  /** The translations to offer (catalog IDs, in order); every one that may be shown if left out. */
  declare translations: readonly string[] | undefined;
  declare place: Place | null;
  declare translation: string | null;
  declare books: readonly ReaderBook[];
  declare chapter: ReaderChapter | null;
  declare status: "idle" | "loading" | "error";
  declare menu: Menu;
  declare available: readonly ReaderTranslation[];

  private client: ReaderApi | null = null;
  private latest = 0;
  private readonly outside = (e: PointerEvent) => {
    if (this.menu && !e.composedPath().includes(this.renderRoot.querySelector(".title") as Node))
      this.menu = null;
  };
  private readonly escape = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.menu = null;
  };

  constructor() {
    super();
    this.api = "/api";
    this.place = null;
    this.translation = null;
    this.books = [];
    this.chapter = null;
    this.status = "idle";
    this.menu = null;
    this.available = [];
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("pointerdown", this.outside);
    document.addEventListener("keydown", this.escape);
  }

  override disconnectedCallback(): void {
    document.removeEventListener("pointerdown", this.outside);
    document.removeEventListener("keydown", this.escape);
    super.disconnectedCallback();
  }

  private get words(): ReaderStrings {
    return { ...READER_STRINGS, ...this.strings };
  }

  private get reads(): ReaderApi {
    this.client ??= readerApi(this.api);
    return this.client;
  }

  /** Opens a passage (OSIS, in the translation's own numbering). */
  async show(translation: string, osis: string): Promise<void> {
    const place = parsePlace(osis);
    if (!place) return;
    this.translation = translation;
    await this.go(place);
  }

  private async go(place: Place): Promise<void> {
    const mine = ++this.latest;
    this.place = place;
    this.menu = null;
    this.status = "loading";
    try {
      const translation = this.translation as string;
      const [offered, books] = await Promise.all([
        this.reads.translations(),
        this.reads.books(translation),
      ]);
      const allowed = this.translations;
      this.available = allowed?.length
        ? allowed.flatMap((id) => offered.filter((t) => t.id === id))
        : offered;
      this.books = books;
      const chapter = await this.reads.chapter(translation, place.book, place.chapter);
      if (mine !== this.latest) return;
      this.chapter = chapter;
      this.status = "idle";
    } catch {
      if (mine !== this.latest) return;
      this.chapter = null;
      this.status = "error";
    }
  }

  private bookName(osis: string): string {
    return this.books.find((b) => b.osis === osis)?.name ?? osis;
  }

  private chapterTitle(to: { book: string; chapter: number }): string {
    return `${this.bookName(to.book)} ${to.chapter}`;
  }

  private open(
    book: string,
    chapter: number,
    from: number | null = null,
    to: number | null = null,
  ) {
    void this.go({ book, chapter, from, to });
  }

  private arrow(direction: -1 | 1) {
    const { place } = this;
    const to = place ? step(this.books, place.book, place.chapter, direction) : null;
    const key = direction === -1 ? "previous" : "next";
    return html`<button
      type="button"
      class="step"
      part="step"
      ?disabled=${!to}
      aria-label=${to ? fill(this.words[key], { chapter: this.chapterTitle(to) }) : ""}
      title=${to ? this.chapterTitle(to) : ""}
      @click=${() => to && this.open(to.book, to.chapter)}
    >
      ${direction === -1 ? "‹" : "›"}
    </button>`;
  }

  private toggle(menu: Exclude<Menu, null>) {
    this.menu = this.menu === menu ? null : menu;
  }

  private panel() {
    const { place } = this;
    if (!place || !this.menu) return nothing;
    if (this.menu === "books") {
      const w = this.words;
      const sections = [
        ["ot", w.oldTestament],
        ["nt", w.newTestament],
        ["other", w.other],
      ] as const;
      return html`<div class="panel books" part="panel" role="list">
        ${sections.map(([key, title]) => {
          const inSection = this.books.filter((b) => (b.section ?? "other") === key);
          return inSection.length === 0
            ? nothing
            : html`<section aria-label=${title}>
                <h4>${title}</h4>
                <div class="group">
                  ${inSection.map(
                    (b) =>
                      html`<button type="button" aria-current=${b.osis === place.book} @click=${() => this.open(b.osis, b.chapters[0] ?? 1)}>${b.name}</button>`,
                  )}
                </div>
              </section>`;
        })}
      </div>`;
    }
    const chapters = this.books.find((b) => b.osis === place.book)?.chapters ?? [];
    return html`<div class="panel" part="panel" role="list">
      ${chapters.map(
        (n) =>
          html`<button type="button" aria-current=${n === place.chapter} @click=${() => this.open(place.book, n)}>${n}</button>`,
      )}
    </div>`;
  }

  private switchTranslation(e: Event) {
    this.translation = (e.target as HTMLSelectElement).value;
    if (this.place) void this.go(this.place);
  }

  private body() {
    const w = this.words;
    const { place, chapter } = this;
    if (this.status === "loading" && !chapter)
      return html`<p class="note" role="status">${w.loading}</p>`;
    if (this.status === "error") return html`<p class="note" role="alert">${w.failed}</p>`;
    if (!place || !chapter) return nothing;
    const shown = versesIn(chapter.verses, place);
    if (shown.length === 0) return html`<p class="note">${w.noVerses}</p>`;
    const wider = widen(place, chapter.verses);
    const part = place.from !== null;
    const credit = chapter.attribution;
    return html`<article part="passage" dir=${chapter.translation.direction} aria-busy=${this.status === "loading"}>
      ${shown.map(
        (v) =>
          html`<p part="verse">${v.number ? html`<sup>${v.number}</sup>` : nothing}${v.text}</p>`,
      )}
      ${chapter.more ? html`<p class="note">${w.more}</p>` : nothing}
      ${
        part
          ? html`<p class="links" part="links">
            ${
              wider
                ? html`<button type="button" @click=${() => this.open(wider.book, wider.chapter, wider.from, wider.to)}>${w.context}</button>`
                : nothing
            }
            <button type="button" @click=${() => this.open(place.book, place.chapter)}>${w.wholeChapter}</button>
          </p>`
          : nothing
      }
      ${
        credit
          ? html`<p class="credit" part="credit">
            ${credit.statement}
            ${credit.links.map((l) => html` <a href=${l.url} target="_blank" rel="noopener noreferrer">${l.text}</a>`)}
          </p>`
          : nothing
      }
    </article>`;
  }

  protected override render() {
    const w = this.words;
    const { place } = this;
    if (!place) return nothing;
    return html`<header part="bar">
        ${this.arrow(-1)}
        <div class="title">
          <h3>
            <button type="button" aria-haspopup="true" aria-expanded=${this.menu === "books"} @click=${() => this.toggle("books")}>${this.bookName(place.book)}</button>
            <button type="button" aria-haspopup="true" aria-expanded=${this.menu === "chapters"} aria-label=${w.chapters} @click=${() => this.toggle("chapters")}>${place.chapter}</button>
          </h3>
          ${this.panel()}
        </div>
        ${this.arrow(1)}
      </header>
      <div class="bar" part="toolbar">
        <label>${w.translation}
          <select part="translation" @change=${this.switchTranslation}>
            ${this.available.map((t) => html`<option value=${t.id} title=${t.name} ?selected=${t.id === this.translation}>${t.abbreviation}</option>`)}
          </select>
        </label>
        <button type="button" part="back" @click=${() => this.dispatchEvent(new CustomEvent("st-reader-close", { bubbles: true, composed: true }))}>${w.back}</button>
      </div>
      ${this.body()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "st-reader": StReader;
  }
}
