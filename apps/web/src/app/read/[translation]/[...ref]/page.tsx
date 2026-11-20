import { parseOsisPassage } from "@scripturetips/passage";
import { english } from "@scripturetips/reference";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentAccount } from "../../../../account/api.ts";
import { myCompilation, myCompilations } from "../../../../compilations/api.ts";
import { books, type PassageResponse, passage, translations } from "../../../../reader/api.ts";
import {
  designations,
  Statement,
  translationAttribution,
} from "../../../../reader/attributions.tsx";
import { BookList } from "../../../../reader/BookList.tsx";
import {
  arrangeBooks,
  type ChapterRef,
  neighbors,
  readingOrder,
} from "../../../../reader/books.ts";
import { ChapterBar } from "../../../../reader/ChapterBar.tsx";
import { creditLines } from "../../../../reader/credits.ts";
import { Passage } from "../../../../reader/Passage.tsx";
import { PassageTitle } from "../../../../reader/PassageEdit.tsx";
import { bookSlug, ownsCompilation, readerTarget, referenceFor } from "../../../../reader/paths.ts";
import { ReaderNav } from "../../../../reader/ReaderNav.tsx";
import { ReaderSearch } from "../../../../reader/ReaderSearch.tsx";
import { ReaderTabs } from "../../../../reader/ReaderTabs.tsx";
import { translationOptions } from "../../../../translations/menu.ts";

/** How many verses each side the context button adds. */
const CONTEXT = 3;

/**
 * The most translations shown at once, stacked: each is a fetch and a render, so a guest is held
 * to a few (a request naming dozens would be a cheap way to load the server).
 */
const MOST_TRANSLATIONS = 40;
const MOST_TRANSLATIONS_GUEST = 6;

interface Props {
  params: Promise<{ translation: string; ref: string[] }>;
  /** `with`: more translations to show under the first, comma separated (catalog or `@handle/slug`). */
  searchParams: Promise<{ with?: string }>;
}

/**
 * A passage (`/read/leb/genesis/1`, `/read/@handle/slug/genesis/1`), or a compilation's book
 * list (`/read/@handle/slug`). Compilations are shown only to their owner.
 */
async function load({ params }: Props) {
  const { translation, ref } = await params;
  const [target, account] = [readerTarget(translation, ref), await currentAccount()];
  if (!target || !ownsCompilation(target.id, account?.handle)) notFound();
  const { id, segments } = target;
  if (segments.length === 0) {
    const compilation = await myCompilation(id.split("/")[1] ?? "");
    if (!compilation) notFound();
    return { kind: "books" as const, id, account, compilation };
  }
  const reference = referenceFor(segments);
  if (!reference) notFound();
  return {
    kind: "passage" as const,
    id,
    account,
    reference,
    // The path after the translation, to toggle translations on the same passage.
    tail: segments.join("/"),
    result: await passage(id, reference),
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const loaded = await load(props);
  const t = await getTranslations("reader");
  if (loaded.kind === "books")
    return { title: t("booksTitle", { translation: loaded.compilation.abbreviation }) };
  if (!loaded.result.ok) return {};
  const label = loaded.result.passages.map((p) => p.label).join("; ");
  return {
    title: t("title", { passage: label, translation: loaded.result.translation.abbreviation }),
  };
}

export default async function Read(props: Props) {
  const loaded = await load(props);
  const { id, account } = loaded;
  const canon = account?.canon ?? null;
  if (loaded.kind === "books") {
    const { compilation } = loaded;
    return (
      <BookList
        id={id}
        abbreviation={compilation.abbreviation}
        name={compilation.title}
        direction={compilation.direction}
        books={(await books(id)) ?? []}
        canon={canon}
        signedIn
      />
    );
  }
  const { reference, result, tail } = loaded;
  const t = await getTranslations("errors");
  const tr = await getTranslations("reader");
  const ts = await getTranslations("search");
  const [catalog, mine] = await Promise.all([translations().catch(() => []), myCompilations()]);
  if (
    !result.ok &&
    (result.code === "unknown-translation" || result.code === "unknown-compilation")
  )
    notFound();
  // More translations to stack under the first: known ones (a catalog translation, or the
  // viewer's own compilation), once each, up to a few; the rest are left out.
  const known = new Set([...catalog.map((c) => c.id), ...mine.map((c) => c.id)]);
  const extras = [
    ...new Set(
      ((await props.searchParams).with ?? "").split(",").filter((e) => e !== id && known.has(e)),
    ),
  ].slice(0, (account ? MOST_TRANSLATIONS : MOST_TRANSLATIONS_GUEST) - 1);
  const shown = [id, ...extras];
  const others = await Promise.all(extras.map((e) => passage(e, reference)));
  const results: [string, PassageResponse][] = [
    [id, result],
    ...extras.map((e, i): [string, PassageResponse] => [
      e,
      others[i] ?? { ok: false, code: "unavailable" },
    ]),
  ];
  // The other translations are kept as the reader moves through the passage's chapters.
  const keep = extras.length > 0 ? `?with=${extras.map(encodeURIComponent).join(",")}` : "";
  const readPath = (path: string) => `${path}${keep}`;
  // Previous and next chapters, in the reader's canon order, for a single passage.
  const only = result.ok && result.passages.length === 1 ? result.passages[0] : undefined;
  let around: { previous?: ChapterRef; next?: ChapterRef } = {};
  const available = await books(id).catch(() => null);
  const reading =
    result.ok && result.passages[0]
      ? parseOsisPassage(result.passages[0].entered).start.book
      : undefined;
  if (only) {
    const { start, end } = parseOsisPassage(only.entered);
    if (available)
      around = neighbors(
        readingOrder(arrangeBooks(available, canon)),
        start.book,
        start.chapter,
        end.chapter,
      );
  }
  // Part of a chapter can be widened by a few verses each side, for context, until it's the whole.
  let wider: string | undefined;
  let chapterPath: string | undefined;
  if (only && !only.wholeChapters) {
    const { start, end } = parseOsisPassage(only.entered);
    if (start.chapter === end.chapter) {
      const whole = await passage(
        id,
        `${english.name(start.book, "full", "one")} ${start.chapter}`,
      );
      const numbers = whole.ok ? (whole.passages[0]?.verses ?? []).map((v) => v.to ?? v.verse) : [];
      const first = Math.min(
        ...(whole.ok ? (whole.passages[0]?.verses ?? []).map((v) => v.verse) : [1]),
      );
      const last = Math.max(...numbers, end.verse);
      const from = Math.max(first, start.verse - CONTEXT);
      const to = Math.min(last, end.verse + CONTEXT);
      chapterPath = `/read/${id}/${bookSlug(start.book)}/${start.chapter}`;
      if (from < start.verse || to > end.verse) {
        wider = from === first && to === last ? chapterPath : `${chapterPath}/${from}-${to}`;
      }
    }
  }
  const chapterLink = (c: ChapterRef, key: "previous" | "next") => (
    <a
      href={readPath(`/read/${id}/${bookSlug(c.osis)}/${c.chapter}`)}
      rel={key === "previous" ? "prev" : "next"}
    >
      {tr(key, { chapter: `${english.name(c.osis, "full", "one")} ${c.chapter}` })}
    </a>
  );
  /** One translation's passages, with its credit and attribution (a heading when several show). */
  const block = async (blockId: string, res: PassageResponse) => {
    const handle = blockId.startsWith("@") ? (blockId.split("/")[0] ?? "").slice(1) : "";
    const { credit, notices } = res.ok
      ? await creditLines(res, handle)
      : { credit: null, notices: [] };
    // A translation's own attribution (the owner's private compilation reader shows none yet).
    const attribution = res.ok
      ? translationAttribution(res.translation.id, res.translation.license)
      : null;
    const designationOf = attribution
      ? designations([attribution], res.ok ? res.translation.id : undefined)
      : undefined;
    return (
      <section
        key={blockId}
        className="reader-version"
        aria-label={res.ok ? res.translation.name : blockId}
      >
        {shown.length > 1 ? (
          <h2 className="reader-version-heading">
            {res.ok ? res.translation.abbreviation : blockId}
            {res.ok ? <small>{res.translation.name}</small> : null}
          </h2>
        ) : null}
        {res.ok ? (
          res.passages.map((p, i) => (
            <Passage
              key={p.entered}
              passage={p}
              index={i}
              direction={res.translation.direction}
              canon={canon}
              sources={res.sources}
              designationOf={designationOf}
              showLabel={false}
              below={
                chapterPath ? (
                  <p className="passage-context">
                    {wider && wider !== chapterPath ? (
                      <a href={readPath(wider)} rel="nofollow">
                        {tr("context")}
                      </a>
                    ) : null}
                    <a href={readPath(chapterPath)}>{tr("wholeChapter")}</a>
                  </p>
                ) : undefined
              }
            />
          ))
        ) : (
          <p className="error" role="alert">
            {t.has(res.code) ? t(res.code) : t("unavailable")}
          </p>
        )}
        {credit ? <p className="translation-credit">{credit}</p> : null}
        {attribution ? <Statement a={attribution} /> : null}
        {notices.map((n) => (
          <p key={n.kind} className="translation-credit edit-notice">
            {n.text}
          </p>
        ))}
      </section>
    );
  };
  // The Translation button says the abbreviation of the translation read (and how many more).
  const abbreviationOf = (e: string) =>
    catalog.find((c) => c.id === e)?.abbreviation ??
    mine.find((c) => c.id === e)?.abbreviation ??
    e;
  const navProps = {
    selected: shown,
    tail,
    abbreviation: `${abbreviationOf(id)}${shown.length > 1 ? ` +${shown.length - 1}` : ""}`,
    compilations: mine.map((c) => ({ id: c.id, label: `${c.abbreviation}: ${c.title}` })),
    translations: translationOptions(catalog, account, shown),
    limit: account ? MOST_TRANSLATIONS : MOST_TRANSLATIONS_GUEST,
  };
  const fullTitle = result.ok ? result.passages.map((p) => p.label).join("; ") : reference;
  const passageTitle = (shownAs?: string) => (
    <PassageTitle
      translation={id}
      also={extras}
      title={fullTitle}
      {...(shownAs !== undefined ? { shown: shownAs } : {})}
      direction={result.ok ? result.translation.direction : "ltr"}
      labels={{ change: tr("changePassage"), field: ts("reference"), read: ts("go") }}
    />
  );
  // In the bar the book and chapter are already named, so the title says only what's more
  // (":1–3"); for a whole chapter it's just the pencil.
  const startOfOnly = only ? parseOsisPassage(only.entered).start : undefined;
  const bookLabel = startOfOnly ? english.name(startOfOnly.book, "full", "one") : "";
  const afterBook = only?.label.startsWith(bookLabel)
    ? only.label.slice(bookLabel.length).trim()
    : "";
  // ("Genesis 2" in the bar, then ":18–25").
  const afterChapter =
    startOfOnly && afterBook.startsWith(`${startOfOnly.chapter}:`)
      ? afterBook.slice(String(startOfOnly.chapter).length)
      : "";
  return (
    <div className="reader">
      {/* Held at the top of the window while the chapter scrolls, as in the editor. */}
      {only && available ? (
        <div className="reader-head">
          <ChapterBar
            osis={parseOsisPassage(only.entered).start.book}
            chapter={parseOsisPassage(only.entered).start.chapter}
            chapters={
              available.find((b) => b.osis === parseOsisPassage(only.entered).start.book)
                ?.chapters ?? []
            }
            previous={around.previous}
            next={around.next}
            href={(to, n) => readPath(`/read/${id}/${bookSlug(to)}/${n}`)}
            after={passageTitle(afterChapter)}
            menu={<ReaderTabs id={id} books={available} canon={canon} current={reading} />}
          />
        </div>
      ) : (
        passageTitle()
      )}
      {/* The translations, under the bar and to the right. */}
      <div className="reader-translations">
        <ReaderSearch
          translation={id}
          catalog={catalog.map((c) => c.id)}
          labels={{ field: ts("homeField"), button: ts("homeGo") }}
        />
        <ReaderNav {...navProps} />
      </div>
      {await Promise.all(results.map(([blockId, res]) => block(blockId, res)))}
      {/* A single chapter has the bar's arrows; other passages link to the books. */}
      {result.ok && !only ? (
        <nav className="chapter-nav" aria-label={tr("chapterNav")}>
          <span>{around.previous ? chapterLink(around.previous, "previous") : null}</span>
          <a href={`/read/${id}`}>{tr("books")}</a>
          <span>{around.next ? chapterLink(around.next, "next") : null}</span>
        </nav>
      ) : null}
    </div>
  );
}
