import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  type Database,
  lemma,
  sourceText,
  token,
  translation,
  translationBook,
  verseText,
} from "@scripturetips/db";
import { testDatabase } from "@scripturetips/db/test-support";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { testAccounts } from "../auth/test-support.ts";
import { testBuilds } from "../pdf-builds/test-support.ts";

let db: Database;
let drop: () => Promise<void>;
let app: NestFastifyApplication;

const range = (book: number, chapter: number, verse: number) => {
  const start = book * 10_000_000 + chapter * 10_000 + verse * 10;
  return { start, end: start + 9 };
};

/** A verse as text: the words, with the plain text search finds them by. */
const verse = (translationId: string, chapter: number, n: number, text: string) => ({
  translationId,
  book: "John",
  chapter,
  verse: n,
  canonical: [`John.${chapter}.${n}`],
  mapping: "same",
  canonicalRange: range(43, chapter, n),
  headings: [],
  content: [text],
  plain: text,
});

beforeAll(async () => {
  let url: string;
  ({ db, url, drop } = await testDatabase());
  const [kjv, web] = await db
    .insert(translation)
    .values(
      [
        ["kjv", "KJV", "King James Version"],
        ["web", "WEB", "World English Bible"],
      ].map(([catalogId, abbreviation, name]) => ({
        catalogId: catalogId ?? "",
        abbreviation: abbreviation ?? "",
        name: name ?? "",
        language: "en",
        direction: "ltr" as const,
        scheme: "kjv",
        licenseKey: "public-domain",
      })),
    )
    .returning();
  if (!kjv || !web) throw new Error("no translations");
  await db.insert(translationBook).values(
    [kjv, web].map((t) => ({
      translationId: t.id,
      book: "John",
      usfm: "JHN",
      position: 0,
      names: {},
    })),
  );
  await db
    .insert(verseText)
    .values([
      verse(kjv.id, 3, 16, "For God so loved the world, that he gave his only begotten Son"),
      verse(kjv.id, 3, 17, "For God sent not his Son into the world to condemn the world"),
      verse(web.id, 3, 16, "For God so loved the world, that he gave his one and only Son"),
      verse(kjv.id, 1, 14, "And the Word was made flesh, and dwelt among us"),
      verse(web.id, 1, 14, "The Word became flesh and lived among us"),
      verse(kjv.id, 6, 1, "The shoot grew up, and he went on a long way before the rest"),
      verse(kjv.id, 6, 2, "A shoot before him grew up in the field"),
      verse(kjv.id, 6, 3, "Another shoot came up beside the field"),
      verse(kjv.id, 13, 34, "A new commandment I give unto you, That ye love one another"),
    ]);
  // The Greek and Hebrew words: love (agape), God (Elohim).
  const [agape, elohim] = await db
    .insert(lemma)
    .values([
      {
        language: "grc",
        strong: "G0026",
        key: "G0026",
        headword: "ἀγάπη",
        transliteration: "agapē",
        gloss: "love",
        partOfSpeech: "noun",
      },
      {
        language: "heb",
        strong: "H0430",
        key: "H0430",
        headword: "אֱלֹהִים",
        transliteration: "ʼĕlōhîm",
        gloss: "God",
        partOfSpeech: "noun",
      },
    ])
    .returning();
  const [source] = await db
    .insert(sourceText)
    .values({
      catalogId: "t",
      name: "T",
      language: "grc",
      tradition: "t",
      licenseKey: "x",
      report: {},
    })
    .returning();
  const word = (position: number, lemmaId: string | undefined) => ({
    sourceTextId: source?.id ?? "",
    book: "John",
    chapter: 3,
    verse: 16,
    position,
    reading: "NKO",
    surface: "x",
    lemmaId: lemmaId ?? null,
    canonical: ["John.3.16"],
    canonicalRange: null,
  });
  await db.insert(token).values([word(1, agape?.id), word(2, agape?.id), word(3, elohim?.id)]);
  app = await createApp({
    databaseUrl: url,
    accounts: testAccounts().settings,
    builds: testBuilds().settings,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
  await drop();
});

const find = (query: string) =>
  app
    .inject({ method: "GET", url: `/api/search?${query}` })
    .then((r) => ({ status: r.statusCode, body: r.json(), headers: r.headers }));

describe("vision §3.14: scripture text search", () => {
  it("finds verses by their words, with each word's other forms, flagging what matched", async () => {
    const { status, body } = await find("q=love&kinds=text&translations=kjv,web");
    expect(status).toBe(200);
    const labels = body.results.map((r: { label: string }) => r.label);
    // "love" finds "loved" (John 3:16) and "love" (John 13:34).
    expect(labels).toEqual(expect.arrayContaining(["John 3:16", "John 13:34"]));
    expect(labels).not.toContain("John 3:17");
    const first = body.results.find((r: { id: string }) => r.id === "text:kjv:John.3.16");
    expect(first.snippet.some((p: { t: string; hit?: boolean }) => p.hit && p.t === "loved")).toBe(
      true,
    );
    expect(first.snippet.map((p: { t: string }) => p.t).join("")).toContain(
      "For God so loved the world",
    );
  });

  it("lists a verse once, from the first translation asked for, so the limit counts verses", async () => {
    // John 3:16 is in both translations; it takes one place, in the one listed first.
    const web = await find("q=world&kinds=text&translations=web,kjv");
    const labels = web.body.results.map((r: { label: string }) => r.label);
    expect(labels).toEqual(expect.arrayContaining(["John 3:16", "John 3:17"]));
    expect(labels.filter((l: string) => l === "John 3:16")).toHaveLength(1);
    expect(web.body.results.find((r: { label: string }) => r.label === "John 3:16").id).toBe(
      "text:web:John.3.16",
    );
    const kjv = await find("q=world&kinds=text&translations=kjv,web");
    expect(kjv.body.results.find((r: { label: string }) => r.label === "John 3:16").id).toBe(
      "text:kjv:John.3.16",
    );
    // Two places, two verses: not John 3:16 twice.
    const two = await find("q=world&kinds=text&limit=2");
    expect(new Set(two.body.results.map((r: { label: string }) => r.label)).size).toBe(2);
  });

  it("keeps a quoted phrase together, and in order", async () => {
    // (A stop word inside the phrase is skipped, as the database does; one at its start is ignored.)
    expect((await find('q="loved the world"&kinds=text')).body.results.length).toBe(1);
    expect((await find('q="world loved"&kinds=text')).body.results.length).toBe(0);
  });

  it("searches only the translations asked for", async () => {
    const { body } = await find("q=world&kinds=text&translations=web");
    expect(body.results.map((r: { translation: { id: string } }) => r.translation.id)).toEqual([
      "web",
    ]);
    expect((await find("q=world&kinds=text&translations=nobody")).body.results).toEqual([]);
  });

  it("finds a verse whose words are split between translations, saying which has which", async () => {
    // KJV has "dwelt", WEB has "became": neither has both.
    const { body } = await find("q=dwelt+became&kinds=text");
    expect(body.results).toHaveLength(1);
    const [hit] = body.results;
    expect(hit.label).toBe("John 1:14");
    expect(hit.missing).toBeUndefined();
    const parts = [hit, ...hit.also].map(
      (r: { translation: { id: string }; snippet: { t: string; hit?: boolean }[] }) =>
        `${r.translation.id}:${r.snippet.filter((p) => p.hit).map((p) => p.t)}`,
    );
    expect(parts.sort()).toEqual(["kjv:dwelt", "web:became"]);
  });

  it("lists a verse holding most of the words after the full matches, naming the missing one", async () => {
    const { body } = await find("q=dwelt+became+zebedee&kinds=text");
    expect(body.results.map((r: { label: string }) => r.label)).toEqual(["John 1:14"]);
    expect(body.results[0].missing).toEqual(["zebedee"]);
    // A verse holding every word in one translation stays a plain result, first.
    const mixed = await find("q=love&kinds=text");
    expect(mixed.body.results.every((r: { also?: unknown }) => r.also === undefined)).toBe(true);
  });

  it("indexes every word: 'before' is an ordinary word, and the words closest together come first", async () => {
    const { body } = await find("q=shoot+before&kinds=text");
    expect(body.results.map((r: { label: string }) => r.label)).toEqual(["John 6:2", "John 6:1"]);
    // Both words are flagged in the snippet.
    const marked = body.results[0].snippet
      .filter((p: { hit?: boolean }) => p.hit)
      .map((p: { t: string }) => p.t.toLowerCase());
    expect(marked.sort()).toEqual(["before", "shoot"]);
    // A word no verse has leaves no verse with all the words.
    expect((await find("q=dwelt+before&kinds=text")).body.results).toEqual([]);
    // A near match across translations names the word it lacks.
    const near = (await find("q=dwelt+became+before&kinds=text")).body.results;
    expect(near.map((r: { label: string }) => r.label)).toEqual(["John 1:14"]);
    expect(near[0].missing).toEqual(["before"]);
  });

  it("leaves out only its own stop words (the, a, of, and) from a plain query", async () => {
    // John 13:34 has no "the": it's found when a typed "the" is left out.
    const plain = (await find("q=the+love+commandment&kinds=text")).body.results;
    expect(plain.map((r: { label: string }) => r.label)).toContain("John 13:34");
    // Only stop words: nothing to look for.
    expect((await find("q=the+of+and+a&kinds=text")).body.results).toEqual([]);
  });

  it("keeps every word of a quoted phrase, stop words too, in order", async () => {
    expect((await find('q="that he gave"&kinds=text')).body.results.length).toBe(1);
    // "she" would be skipped as a stop word by the database's English list; here it's a word.
    expect((await find('q="that she gave"&kinds=text')).body.results).toEqual([]);
    // "the" between the words is part of the phrase: "love world" isn't "loved the world".
    expect((await find('q="loved world"&kinds=text')).body.results).toEqual([]);
    expect((await find('q="the love"&kinds=text')).body.results).toEqual([]);
  });

  it("doesn't loosen a quoted phrase, or a query of one word", async () => {
    expect((await find('q="dwelt became"&kinds=text')).body.results).toEqual([]);
    expect((await find("q=zebedee&kinds=text")).body.results).toEqual([]);
  });

  it("gives words that are only stop words no results, not an error", async () => {
    const { status, body } = await find("q=the&kinds=text");
    expect(status).toBe(200);
    expect(body.results).toEqual([]);
  });
});

describe("vision §3.14: reference lookup", () => {
  it("goes straight to a passage named in the query, in the first translation searched", async () => {
    const { body } = await find("q=jn%203:16&kinds=reference&translations=kjv,web");
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      kind: "reference",
      label: "John 3:16",
      reference: "John.3.16",
      translation: { id: "kjv", abbreviation: "KJV" },
    });
    expect(body.results[0].preview).toContain("For God so loved the world");
  });

  it("cuts the preview at the length asked for, at a word, and shows more when allowed", async () => {
    const short = await find("q=jn%203:16&kinds=reference&translations=kjv&previewLength=30");
    expect(short.body.results[0].preview).toBe("For God so loved the world,…");
    const whole = await find("q=jn%203:16&kinds=reference&translations=kjv&previewLength=500");
    expect(whole.body.results[0].preview).toBe(
      "For God so loved the world, that he gave his only begotten Son",
    );
  });

  it("shows every verse of a range in the preview, not only the first", async () => {
    const { body } = await find(
      "q=jn%203:16-17&kinds=reference&translations=kjv&previewLength=500",
    );
    expect(body.results[0]).toMatchObject({ reference: "John.3.16-John.3.17" });
    expect(body.results[0].preview).toBe(
      "For God so loved the world, that he gave his only begotten Son For God sent not his Son into the world to condemn the world",
    );
  });

  it("finds nothing in a query that isn't a reference", async () => {
    expect((await find("q=so%20loved&kinds=reference")).body.results).toEqual([]);
  });
});

describe("vision §3.14: original-language search", () => {
  it("finds a word by Strong's number, however it's typed", async () => {
    for (const q of ["G26", "g0026", "G%200026"]) {
      const { body } = await find(`q=${q}&kinds=original`);
      expect(body.results, q).toHaveLength(1);
      expect(body.results[0]).toMatchObject({
        kind: "original",
        strong: "G0026",
        headword: "ἀγάπη",
        gloss: "love",
        category: "noun",
        occurrences: 2,
      });
    }
  });

  it("finds a word by its English gloss, and by its form with or without vowel points", async () => {
    expect(
      (await find("q=love&kinds=original")).body.results.map((r: { strong: string }) => r.strong),
    ).toEqual(["G0026"]);
    const pointed = await find(`q=${encodeURIComponent("אֱלֹהִים")}&kinds=original`);
    const bare = await find(`q=${encodeURIComponent("אלהים")}&kinds=original`);
    expect(pointed.body.results[0].strong).toBe("H0430");
    expect(bare.body.results[0].strong).toBe("H0430");
    expect(
      (await find(`q=${encodeURIComponent("αγαπη")}&kinds=original`)).body.results[0].strong,
    ).toBe("G0026");
  });
});

describe("vision §3.14: kinds, suggestions and limits", () => {
  it("gives only the kinds asked for, and names kinds it doesn't search", async () => {
    const { body } = await find("q=love&kinds=original,notes");
    expect(body.results.every((r: { kind: string }) => r.kind === "original")).toBe(true);
    expect(body.unavailable).toEqual(["notes"]);
    const all = await find("q=love");
    expect(new Set(all.body.results.map((r: { kind: string }) => r.kind))).toEqual(
      new Set(["original", "text"]),
    );
  });

  it("suggests a book to start a reference with, and a word", async () => {
    const books = await app.inject({ method: "GET", url: "/api/search/suggest?q=joh" });
    expect(books.json().suggestions).toContainEqual({ kind: "book", text: "John" });
    const words = await app.inject({
      method: "GET",
      url: "/api/search/suggest?q=lov&kinds=original",
    });
    expect(words.json().suggestions).toEqual([{ kind: "word", text: "love" }]);
  });

  it("is public reference data: cacheable", async () => {
    expect((await find("q=love")).headers["cache-control"]).toBe("public, max-age=60");
  });

  it("refuses a missing query or an excessive limit", async () => {
    expect((await find("kinds=text")).status).toBe(400);
    expect((await find("q=love&limit=500")).status).toBe(400);
    expect((await find(`q=${"x".repeat(201)}`)).status).toBe(400);
  });
});
