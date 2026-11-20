/** What the widget reader needs of the data server's `/api/widget` routes, and its page arithmetic. */

export interface ReaderTranslation {
  readonly id: string;
  readonly abbreviation: string;
  readonly name: string;
  readonly language: string;
  readonly direction: "ltr" | "rtl";
}

export interface ReaderBook {
  readonly osis: string;
  readonly name: string;
  readonly chapters: readonly number[];
  readonly section?: "ot" | "nt" | "other";
}

export interface ReaderVerse {
  readonly number: string;
  readonly text: string;
}

export interface ReaderChapter {
  readonly translation: ReaderTranslation;
  readonly label: string;
  readonly verses: readonly ReaderVerse[];
  readonly more: boolean;
  readonly attribution: {
    readonly designation: string;
    readonly statement: string;
    readonly links: readonly { readonly text: string; readonly url: string }[];
  } | null;
}

export interface ReaderApi {
  translations(): Promise<readonly ReaderTranslation[]>;
  books(translation: string): Promise<readonly ReaderBook[]>;
  chapter(translation: string, book: string, chapter: number): Promise<ReaderChapter>;
}

/** The reader's reads: plain GETs with no credentials, kept for the page's life (a failure isn't). */
export function readerApi(api: string, fetchImpl: typeof fetch = fetch): ReaderApi {
  const base = api.replace(/\/$/, "");
  const kept = new Map<string, Promise<unknown>>();
  const get = <T>(path: string): Promise<T> => {
    let found = kept.get(path) as Promise<T> | undefined;
    if (!found) {
      found = (async () => {
        const res = await fetchImpl(`${base}${path}`, {
          credentials: "omit",
          headers: { accept: "application/json" },
        });
        if (!res.ok) throw new Error(`The reader failed (${res.status}).`);
        return (await res.json()) as T;
      })();
      kept.set(path, found);
      found.catch(() => kept.delete(path));
    }
    return found;
  };
  return {
    translations: async () =>
      (await get<{ translations: ReaderTranslation[] }>("/widget/translations")).translations,
    books: async (translation) =>
      (await get<{ books: ReaderBook[] }>(`/widget/books?${new URLSearchParams({ translation })}`))
        .books,
    chapter: (translation, book, chapter) =>
      get<ReaderChapter>(
        `/widget/chapter?${new URLSearchParams({ translation, book, chapter: String(chapter) })}`,
      ),
  };
}

/** A passage inside one chapter: `from` and `to` are null for the whole chapter. */
export interface Place {
  readonly book: string;
  readonly chapter: number;
  readonly from: number | null;
  readonly to: number | null;
}

/** `John.3.16`, `Joel.2.28-Joel.2.32` or a chapter (`John.3`) as a place; null across chapters. */
export function parsePlace(osis: string): Place | null {
  const m =
    /^([1-3A-Za-z]{2,10})\.(\d+)(?:\.(\d+)(?:![a-z])?)?(?:-([1-3A-Za-z]{2,10})\.(\d+)(?:\.(\d+)(?:![a-z])?)?)?$/.exec(
      osis,
    );
  if (!m) return null;
  const [, book, chapter, from, endBook, endChapter, to] = m;
  if (endBook && (endBook !== book || endChapter !== chapter)) return null;
  return {
    book: book as string,
    chapter: Number(chapter),
    from: from ? Number(from) : null,
    to: from ? Number(to ?? from) : null,
  };
}

/** The first and last verse number a printed number covers ("16", "16–17", "" for a heading). */
export function verseSpan(number: string): [number, number] {
  const m = /^(\d+)(?:[–-](\d+))?/.exec(number);
  if (!m) return [0, 0];
  return [Number(m[1]), Number(m[2] ?? m[1])];
}

/** The verses of a chapter inside a place's range (all of them for a whole chapter). */
export function versesIn(verses: readonly ReaderVerse[], place: Place): readonly ReaderVerse[] {
  const { from, to } = place;
  if (from === null || to === null) return verses;
  return verses.filter((v) => {
    const [a, b] = verseSpan(v.number);
    // A psalm's heading (no number) belongs with the first verse.
    return v.number === "" ? from <= 1 : a <= to && b >= from;
  });
}

/** How many verses each side "Read in context" adds. */
export const CONTEXT = 3;

/**
 * What "Read in context" shows for part of a chapter: the passage widened by a few verses each
 * side, or null when that wouldn't show anything more. Whole (`from` and `to` null) when it
 * reaches both ends of the chapter.
 */
export function widen(place: Place, verses: readonly ReaderVerse[]): Place | null {
  if (place.from === null || place.to === null) return null;
  const spans = verses.map((v) => verseSpan(v.number)).filter(([a]) => a > 0);
  if (spans.length === 0) return null;
  const first = Math.min(...spans.map(([a]) => a));
  const last = Math.max(...spans.map(([, b]) => b));
  const from = Math.max(first, place.from - CONTEXT);
  const to = Math.min(last, place.to + CONTEXT);
  if (from === place.from && to === place.to) return null;
  return from === first && to === last
    ? { ...place, from: null, to: null }
    : { ...place, from, to };
}

/** The chapter before or after, across books; null at the ends. */
export function step(
  books: readonly ReaderBook[],
  book: string,
  chapter: number,
  direction: -1 | 1,
): { book: string; chapter: number } | null {
  const at = books.findIndex((b) => b.osis === book);
  const here = books[at];
  if (!here) return null;
  const i = here.chapters.indexOf(chapter) + direction;
  const within = here.chapters[i];
  if (within !== undefined) return { book, chapter: within };
  const other = books[at + direction];
  if (!other) return null;
  const edge = direction === 1 ? other.chapters[0] : other.chapters[other.chapters.length - 1];
  return edge === undefined ? null : { book: other.osis, chapter: edge };
}
