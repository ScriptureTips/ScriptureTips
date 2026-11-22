// cspell:ignore ordinality numnode alnum
import { Inject, Injectable } from "@nestjs/common";
import { and, type Database as Db, isNull, lemma, sql } from "@scripturetips/db";
import { BOOKS } from "@scripturetips/passage";
import { english } from "@scripturetips/reference";
import { editableText } from "../compilations/wording.ts";
import { DATABASE } from "../database.ts";
import { categoryOf, type StudyCategory } from "../study/categories.ts";
import { TranslationsService } from "../translations/translations.service.ts";
import {
  escapeRegex,
  FOLDED_MARKS,
  fold,
  HIT_CLOSE,
  HIT_OPEN,
  type SearchKind,
  type SnippetPart,
  snippetOf,
  strongOf,
  wordsNeeded,
  wordsOf,
} from "./query.ts";
import { isStopWord, withoutStopWords } from "./stop-words.ts";

export interface SearchParams {
  readonly q: string;
  readonly kinds: ReadonlySet<SearchKind>;
  /** The translations to search (catalog IDs); null for every one. */
  readonly translations: readonly string[] | null;
  /**
   * The translation the verses are shown in (a catalog ID), whichever translation's words matched:
   * each verse found is listed once, in its numbering and words (the query's words flagged where
   * it has them), and a verse it lacks is left out. A passage the query names is read in it too.
   * Null: each verse in a translation that matched.
   */
  readonly showIn: string | null;
  /** The most results of each kind. */
  readonly limit: number;
  /** Verses to skip, for the next page of text results (reference and original words don't page). */
  readonly offset: number;
  /** How many characters of a passage a reference result's preview shows. */
  readonly previewLength: number;
}

/** A passage the query names ("jn 3 16"), in the first translation searched. */
export interface ReferenceResult {
  readonly kind: "reference";
  readonly id: string;
  /** "John 3:16". */
  readonly label: string;
  /** As written, in the translation's numbering (OSIS). */
  readonly reference: string;
  readonly translation: { readonly id: string; readonly abbreviation: string };
  /** The start of the passage, as plain text. */
  readonly preview: string;
}

/** A verse whose words match, with the matched words flagged. */
export interface TextResult {
  readonly kind: "text";
  readonly id: string;
  readonly label: string;
  /** The verse in its translation's numbering (OSIS): `John.3.16`. */
  readonly reference: string;
  readonly translation: { readonly id: string; readonly abbreviation: string };
  readonly snippet: readonly SnippetPart[];
  /**
   * The same verse in other translations, which hold words of the query this one lacks: together
   * they hold all the words (or all but `missing`). Only on results that came from several.
   */
  readonly also?: readonly {
    readonly translation: { readonly id: string; readonly abbreviation: string };
    readonly snippet: readonly SnippetPart[];
  }[];
  /** Words of the query no translation of this verse holds: the verse is a near match. */
  readonly missing?: readonly string[];
}

/** A Hebrew or Greek word (a lemma) the query is, or whose gloss or form it matches. */
export interface OriginalResult {
  readonly kind: "original";
  readonly id: string;
  /** `H0430`. */
  readonly strong: string;
  readonly headword: string | null;
  readonly transliteration: string | null;
  readonly gloss: string | null;
  readonly partOfSpeech: string | null;
  readonly category: StudyCategory;
  /** How often it occurs in the original text. */
  readonly occurrences: number;
}

export type SearchResult = ReferenceResult | TextResult | OriginalResult;

export interface SearchResponse {
  readonly query: string;
  readonly results: SearchResult[];
  /** Kinds asked for that this engine doesn't search (yet). */
  readonly unavailable: string[];
  readonly tookMs: number;
  /** True when more verses match than this page holds: ask again with a larger `offset`. */
  readonly more?: true;
}

export interface Suggestion {
  /** A book to start a reference with, or a word from the dictionaries. */
  readonly kind: "book" | "word";
  readonly text: string;
}

/** How ts_headline marks a match: brackets that don't occur in scripture. */
const HEADLINE = `StartSel=${HIT_OPEN}, StopSel=${HIT_CLOSE}, MaxFragments=1, MaxWords=32, MinWords=14, ShortWord=2`;

const clip = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, length).replace(/\s+\S*$/, "")}…` : text;

/** A query matching any of the words (for flagging each one a verse holds). */
const websearch_or = (words: readonly string[]) => words.join(" or ");

const list = (values: readonly string[]) =>
  sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );

@Injectable()
export class SearchService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    @Inject(TranslationsService) private readonly translations: TranslationsService,
  ) {}

  async search(params: SearchParams): Promise<SearchResponse> {
    const started = Date.now();
    const results: SearchResult[] = [];
    // A later page is more verses only: the passage and the original words are in the first.
    const first = params.offset === 0;
    // Each kind is searched at once; the answer lists reference, original, then text.
    const [reference, original, text] = await Promise.all([
      first && params.kinds.has("reference") ? this.reference(params) : [],
      first && params.kinds.has("original") ? this.original(params) : [],
      params.kinds.has("text") ? this.text(params) : { results: [], more: false },
    ]);
    results.push(...reference, ...original, ...text.results);
    return {
      query: params.q,
      results,
      unavailable: [],
      tookMs: Date.now() - started,
      ...(text.more ? { more: true as const } : {}),
    };
  }

  /** The passage the query names, if it names one, in the first translation searched (or shown). */
  private async reference({
    q,
    translations,
    showIn,
    previewLength,
  }: SearchParams): Promise<ReferenceResult[]> {
    const id = showIn ?? translations?.[0] ?? (await this.translations.list())[0]?.id;
    if (!id) return [];
    const found = await this.translations.passage(id, q);
    if (!found.ok) return [];
    return found.passages.map((p) => ({
      kind: "reference",
      id: `reference:${id}:${p.entered}`,
      label: p.label,
      reference: p.entered,
      translation: { id, abbreviation: found.translation.abbreviation },
      // A range's preview runs through its verses, so it isn't only the first.
      preview: clip(
        p.verses.map((v) => editableText(v.content as never).replace(/\u00b6\s*/g, "")).join(" "),
        previewLength,
      ),
    }));
  }

  /**
   * Verses whose words match, stemmed ("forgiven" finds "forgive"); "quoted phrases" stay together.
   * Verses holding every word come first, one result for each translation. Then, as far as the
   * limit allows, a verse whose translations hold the words *between* them (one has one word, another
   * the other: `also` names them), and then near matches that lack a word or two (`missing`).
   */
  private async text(params: SearchParams): Promise<{ results: TextResult[]; more: boolean }> {
    if (params.translations?.length === 0) return { results: [], more: false };
    // One more than the page, to know whether there's another page; the pages before it are found
    // again and skipped (a page is a slice of the same ordered list).
    if (withoutStopWords(params.q) === "") return { results: [], more: false };
    const want = params.offset + params.limit + 1;
    const exact = await this.exactText({ ...params, limit: want });
    const words = wordsOf(params.q)?.filter((w) => !isStopWord(w));
    const all =
      exact.length >= want || !words || words.length < 2
        ? exact
        : [...exact, ...(await this.combinedText(params, words, want - exact.length))];
    return {
      results: all.slice(params.offset, params.offset + params.limit),
      more: all.length > params.offset + params.limit,
    };
  }

  private async exactText({ q, translations, showIn, limit }: SearchParams): Promise<TextResult[]> {
    const scope = translations ? sql`and t.catalog_id in (${list(translations)})` : sql``;
    // Shown in one translation: each verse found is that translation's verse holding its canonical
    // start (or the verse itself, without one, when it's that translation's), once.
    const picked = showIn
      ? sql`picked as (
          select distinct on (s.id) st.catalog_id, st.abbreviation, s.book, s.chapter, s.verse,
                 s.plain, o.tsq, o.best
          from once o
          join translation st on st.catalog_id = ${showIn}
          join verse_text s on s.translation_id = st.id
            and (s.canonical_range @> o.place or s.id = o.vid)
          order by s.id, o.best desc
        )`
      : sql`picked as (
          select catalog_id, abbreviation, book, chapter, verse, plain, tsq, best from once
        )`;
    const order = translations?.length ? sql`array[${list(translations)}]` : sql`array[]`;
    // The words a plain query leaves out are dropped here; a quoted phrase keeps every word.
    const query = withoutStopWords(q);
    const rows = await this.db.execute<{
      translation: string;
      abbreviation: string;
      book: string;
      chapter: number;
      verse: number;
      headline: string;
    }>(sql`
      with q as (select websearch_to_tsquery('scripture', ${query}) as tsq),
      found as (
        select t.catalog_id, t.abbreviation, v.book, v.chapter, v.verse, v.plain, q.tsq,
               v.id as vid, lower(v.canonical_range) as place,
               coalesce(lower(v.canonical_range)::text, v.id::text) as grp,
               ts_rank_cd(v.search, q.tsq) as rank,
               array_position(${order}::text[], t.catalog_id) as preferred,
               max(ts_rank_cd(v.search, q.tsq))
                 over (partition by coalesce(lower(v.canonical_range)::text, v.id::text)) as best
        from verse_text v
        join translation t on t.id = v.translation_id
        cross join q
        where v.search @@ q.tsq ${scope}
      ), once as (
        -- A verse is listed once, from the first translation listed that has it (else the best
        -- match): the limit counts verses, not their copies in every translation.
        select distinct on (grp) * from found
        order by grp, preferred nulls last, rank desc, catalog_id
      ), ${picked}
      select catalog_id as translation, abbreviation, book, chapter, verse,
             ts_headline('scripture', plain, tsq, ${HEADLINE}) as headline
      from picked
      order by best desc, catalog_id, chapter, verse
      limit ${limit}`);
    return rows.map((r) => ({
      kind: "text",
      id: `text:${r.translation}:${r.book}.${r.chapter}.${r.verse}`,
      label: `${english.name(r.book, "full", "one")} ${r.chapter}:${r.verse}`,
      reference: `${r.book}.${r.chapter}.${r.verse}`,
      translation: { id: r.translation, abbreviation: r.abbreviation },
      snippet: snippetOf(r.headline),
    }));
  }

  /**
   * Verses no single translation matches in full, where the words are found across the
   * translations of the same canonical verse (or, a few short, all but one or two of the words).
   * Verses are the same one when their canonical ranges start together; one without a canonical
   * place is by itself.
   */
  private async combinedText(
    { translations, showIn }: SearchParams,
    words: readonly string[],
    room: number,
  ): Promise<TextResult[]> {
    const scope = translations ? sql`and t.catalog_id in (${list(translations)})` : sql``;
    const either = websearch_or(words);
    // Shown in one translation: each verse chosen is that translation's verse holding its
    // canonical start (or the verse itself, when it's that translation's); one it lacks goes.
    const shown = showIn
      ? sql`select distinct on (c.grp) c.grp, st.catalog_id, st.abbreviation, s.book, s.chapter,
                   s.verse, ts_headline('scripture', s.plain,
                     websearch_to_tsquery('scripture', ${either}), ${HEADLINE}) as headline
            from chosen c
            join translation st on st.catalog_id = ${showIn}
            join verse_text s on s.translation_id = st.id
              and (s.canonical_range @> c.place or s.id::text = c.grp)
            order by c.grp, s.chapter, s.verse`
      : sql`select null::text as grp, null::text as catalog_id, null::text as abbreviation,
                   null::text as book, null::int as chapter, null::int as verse,
                   null::text as headline
            where false`;
    const rows = await this.db.execute<{
      translation: string;
      abbreviation: string;
      book: string;
      chapter: number;
      verse: number;
      grp: string;
      found: number[];
      live: number[];
      headline: string;
      shown_translation: string | null;
      shown_abbreviation: string | null;
      shown_book: string | null;
      shown_chapter: number | null;
      shown_verse: number | null;
      shown_headline: string | null;
    }>(sql`
      with terms as (
        select x.ord, websearch_to_tsquery('scripture', x.word) as tsq
        from unnest(array[${list(words)}]::text[])
          with ordinality as x(word, ord)
      ), live as (
        select ord, tsq from terms where numnode(tsq) > 0
      ), hit as (
        select v.id, v.book, v.chapter, v.verse, t.catalog_id, t.abbreviation, l.ord,
               coalesce(lower(v.canonical_range)::text, v.id::text) as grp,
               lower(v.canonical_range) as place
        from verse_text v
        join translation t on t.id = v.translation_id
        join live l on v.search @@ l.tsq
        where true ${scope}
      ), per_verse as (
        select id, book, chapter, verse, catalog_id, abbreviation, grp, min(place) as place,
               array_agg(ord order by ord) as found
        from hit group by id, book, chapter, verse, catalog_id, abbreviation, grp
      ), per_group as (
        -- The words found anywhere in the verse's translations, and the most in one translation:
        -- each from one pass, joined (not looked up verse by verse).
        select h.grp, h.place, h.covered, b.best
        from (
          select grp, min(place) as place, count(distinct ord) as covered from hit group by grp
        ) h
        join (
          select grp, max(cardinality(found)) as best from per_verse group by grp
        ) b on b.grp = h.grp
      ), chosen as (
        select * from per_group
        where covered >= ${wordsNeeded(words.length)}
          and best < (select count(*) from live)
        order by covered desc, best desc, place nulls last, grp
        limit ${room}
      ), shown as (${shown})
      select pv.catalog_id as translation, pv.abbreviation, pv.book, pv.chapter, pv.verse, pv.grp,
             pv.found, (select array_agg(ord order by ord) from live) as live,
             ts_headline('scripture', vt.plain,
               websearch_to_tsquery('scripture', ${either}), ${HEADLINE}) as headline,
             sh.catalog_id as shown_translation, sh.abbreviation as shown_abbreviation,
             sh.book as shown_book, sh.chapter as shown_chapter, sh.verse as shown_verse,
             sh.headline as shown_headline
      from chosen c
      join per_verse pv on pv.grp = c.grp
      join verse_text vt on vt.id = pv.id
      left join shown sh on sh.grp = c.grp
      order by c.covered desc, c.best desc, c.place nulls last, c.grp,
               cardinality(pv.found) desc, pv.catalog_id`);

    type Row = (typeof rows)[number];
    const groups = new Map<string, Row[]>();
    for (const r of rows) groups.set(r.grp, [...(groups.get(r.grp) ?? []), r]);
    return [...groups.values()].flatMap((verses) => {
      const [first] = verses;
      if (!first) return [];
      // The translation with the most of the words, then the ones that add words it lacks.
      const covered = new Set(first.found);
      const others = verses.slice(1).filter((r) => {
        const adds = r.found.some((o) => !covered.has(o));
        for (const o of r.found) covered.add(o);
        return adds;
      });
      const missing = first.live.filter((o) => !covered.has(o)).map((o) => words[o - 1] ?? "");
      const part = (r: Row) => ({
        translation: { id: r.translation, abbreviation: r.abbreviation },
        snippet: snippetOf(r.headline),
      });
      if (showIn) {
        // The verse in the translation shown, alone: the words are found in others.
        const s = first;
        if (!s.shown_book || s.shown_chapter === null || s.shown_verse === null) return [];
        const reference = `${s.shown_book}.${s.shown_chapter}.${s.shown_verse}`;
        return [
          {
            kind: "text" as const,
            id: `text:${s.shown_translation}:${reference}`,
            label: `${english.name(s.shown_book, "full", "one")} ${s.shown_chapter}:${s.shown_verse}`,
            reference,
            translation: {
              id: s.shown_translation ?? "",
              abbreviation: s.shown_abbreviation ?? "",
            },
            snippet: snippetOf(s.shown_headline ?? ""),
            ...(missing.length > 0 ? { missing } : {}),
          },
        ];
      }
      return [
        {
          kind: "text" as const,
          id: `text:${first.translation}:${first.book}.${first.chapter}.${first.verse}`,
          label: `${english.name(first.book, "full", "one")} ${first.chapter}:${first.verse}`,
          reference: `${first.book}.${first.chapter}.${first.verse}`,
          ...part(first),
          ...(others.length > 0 ? { also: others.map(part) } : {}),
          ...(missing.length > 0 ? { missing } : {}),
        },
      ];
    });
  }

  /**
   * Hebrew and Greek words: by Strong's number (`H430`), by English gloss (whole words), or by
   * their own form, with or without vowel points and accents.
   */
  private async original({ q, limit }: SearchParams): Promise<OriginalResult[]> {
    const strong = strongOf(q);
    const found = await this.db.execute<{
      id: string;
      strong: string;
      headword: string | null;
      transliteration: string | null;
      gloss: string | null;
      part_of_speech: string | null;
      name_kind: "person" | "place" | "other" | null;
    }>(
      strong
        ? sql`
          select id, strong, headword, transliteration, gloss, part_of_speech, name_kind
          from lemma where base_lemma_id is null and strong = ${strong.base}
          limit ${limit}`
        : sql`
          select id, strong, headword, transliteration, gloss, part_of_speech, name_kind
          from lemma
          where base_lemma_id is null and (
            lower(gloss) = lower(${q})
            or gloss ~* ${`\\m${escapeRegex(q.trim())}\\M`}
            or lower(regexp_replace(normalize(headword, NFD), ${FOLDED_MARKS}, '', 'g')) = ${fold(q)}
          )
          order by (lower(gloss) = lower(${q})) desc nulls last, strong
          limit ${limit * 4}`,
    );
    if (found.length === 0) return [];
    const counts = await this.db.execute<{ base: string; n: number }>(sql`
      select coalesce(l.base_lemma_id, l.id) as base, count(*)::int as n
      from token t join lemma l on l.id = t.lemma_id
      where coalesce(l.base_lemma_id, l.id) in (${list(found.map((r) => r.id))})
      group by 1`);
    const used = new Map(counts.map((c) => [c.base, c.n]));
    return (
      found
        .map((r, order) => ({ r, order }))
        // The exact matches stay first; commoner words come before rarer ones.
        .sort(
          (a, b) =>
            (strong ? 0 : a.order - b.order) || (used.get(b.r.id) ?? 0) - (used.get(a.r.id) ?? 0),
        )
        .slice(0, limit)
        .map(({ r }) => ({
          kind: "original",
          id: `original:${r.strong}`,
          strong: r.strong,
          headword: r.headword,
          transliteration: r.transliteration,
          gloss: r.gloss,
          partOfSpeech: r.part_of_speech,
          category: categoryOf({ partOfSpeech: r.part_of_speech, nameKind: r.name_kind }),
          occurrences: used.get(r.id) ?? 0,
        }))
    );
  }

  /** What the typed text could become: a book to start a reference with, or a word. */
  async suggest(
    text: string,
    kinds: ReadonlySet<SearchKind>,
    limit: number,
  ): Promise<Suggestion[]> {
    const typed = text.trim();
    if (typed.length === 0) return [];
    const suggestions: Suggestion[] = [];
    if (kinds.has("reference") && !/\d/.test(typed)) {
      const start = fold(typed);
      for (const b of BOOKS) {
        const name = english.name(b.osis, "full", "several");
        if (fold(name).startsWith(start)) suggestions.push({ kind: "book", text: name });
      }
    }
    if (kinds.has("original") && suggestions.length < limit) {
      const words = await this.db
        .selectDistinct({ gloss: lemma.gloss })
        .from(lemma)
        .where(
          and(
            isNull(lemma.baseLemmaId),
            sql`lower(${lemma.gloss}) like ${`${typed.toLowerCase()}%`}`,
          ),
        )
        .orderBy(lemma.gloss)
        .limit(limit);
      for (const w of words) if (w.gloss) suggestions.push({ kind: "word", text: w.gloss });
    }
    return suggestions.slice(0, limit);
  }
}
