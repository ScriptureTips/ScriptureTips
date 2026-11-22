import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { translation, translationBook, verseText } from "@scripturetips/db";
import { testDatabase } from "@scripturetips/db/test-support";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accountsOpenFromEnv, apiRoleFromEnv, createApp } from "./app.ts";

let drop: () => Promise<void>;
let data: NestFastifyApplication;
let reader: NestFastifyApplication;

beforeAll(async () => {
  const test = await testDatabase();
  drop = test.drop;
  const [t] = await test.db
    .insert(translation)
    .values({
      catalogId: "kjv",
      abbreviation: "KJV",
      name: "King James Version",
      language: "en",
      direction: "ltr",
      scheme: "kjv",
      licenseKey: "public-domain",
    })
    .returning();
  if (!t) throw new Error("no translation");
  await test.db
    .insert(translationBook)
    .values({ translationId: t.id, book: "Joel", usfm: "JOL", position: 0, names: {} });
  const start = 29 * 10_000_000 + 2 * 10_000 + 27 * 10;
  await test.db.insert(verseText).values({
    translationId: t.id,
    book: "Joel",
    chapter: 2,
    verse: 27,
    canonical: ["Joel.2.27"],
    mapping: "same",
    canonicalRange: { start, end: start + 9 },
    headings: [],
    content: ["And ye shall know."],
    plain: "And ye shall know.",
  });
  // No account or build settings: neither must need Valkey, SMTP or a file store to start.
  data = await createApp({ role: "data", databaseUrl: test.url });
  reader = await createApp({ role: "app", accountsOpen: false, databaseUrl: test.url });
  for (const app of [data, reader]) {
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }
});

afterAll(async () => {
  await data?.close();
  await reader?.close();
  await drop();
});

/** Routes that need an account, or that an instance with accounts closed has no use for. */
const ACCOUNT_ROUTES = [
  ["GET", "/api/auth/get-session"],
  ["POST", "/api/auth/email-otp/send-verification-otp"],
  ["GET", "/api/account"],
  ["GET", "/api/account/bot-check"],
  ["GET", "/api/compilations"],
  ["GET", "/api/publications/someone/something/books"],
  ["GET", "/api/links?ref=Joel.2.27"],
  ["GET", "/api/annotations?ref=Joel.2.27"],
  ["GET", "/api/collections"],
  ["GET", "/api/collections/items"],
] as const;

describe("vision §7.2: the data server", () => {
  it("serves what the extension and website plugins read, with no cookies", async () => {
    const list = await data.inject({ method: "GET", url: "/api/widget/translations" });
    expect(list.statusCode).toBe(200);
    expect(list.json().translations.map((t: { id: string }) => t.id)).toEqual(["kjv"]);
    expect(list.headers["access-control-allow-origin"]).toBe("*");
    expect(list.headers["set-cookie"]).toBeUndefined();

    const passage = await data.inject({
      method: "GET",
      url: "/api/widget/passage?translation=kjv&ref=Joel.2.27",
    });
    expect(passage.statusCode).toBe(200);
    expect(passage.json()).toMatchObject({
      verses: [{ number: "27", text: "And ye shall know." }],
    });
    expect(passage.headers["set-cookie"]).toBeUndefined();
  });

  it("serves the search widget's search, suggestions and passages, open to any origin", async () => {
    const found = await data.inject({ method: "GET", url: "/api/widget/search?q=know" });
    expect(found.statusCode).toBe(200);
    expect(found.json().results[0]).toMatchObject({ kind: "text", reference: "Joel.2.27" });
    expect(found.headers["access-control-allow-origin"]).toBe("*");
    expect(found.headers["set-cookie"]).toBeUndefined();

    const ref = await data.inject({ method: "GET", url: "/api/widget/search?q=Joel%202:27" });
    expect(ref.json().results[0]).toMatchObject({ kind: "reference", reference: "Joel.2.27" });

    const suggest = await data.inject({ method: "GET", url: "/api/widget/suggest?q=Joe" });
    expect(suggest.statusCode).toBe(200);
    expect(suggest.headers["access-control-allow-origin"]).toBe("*");

    // A translation that may not be shown is never searched, even when asked for by name.
    const none = await data.inject({
      method: "GET",
      url: "/api/widget/search?q=know&translations=not-shown",
    });
    expect(none.json().results).toEqual([]);

    // A search result's reference is in the translation's own numbering.
    const own = await data.inject({
      method: "GET",
      url: "/api/widget/passage?translation=kjv&ref=Joel.2.27&scheme=own",
    });
    expect(own.json()).toMatchObject({ verses: [{ text: "And ye shall know." }] });

    // The widget reader's book list and whole chapters.
    const books = await data.inject({ method: "GET", url: "/api/widget/books?translation=kjv" });
    expect(books.json()).toEqual({
      books: [{ osis: "Joel", name: "Joel", chapters: [2], section: "ot" }],
    });
    expect(books.headers["access-control-allow-origin"]).toBe("*");
    const chapter = await data.inject({
      method: "GET",
      url: "/api/widget/chapter?translation=kjv&book=Joel&chapter=2",
    });
    expect(chapter.json()).toMatchObject({ verses: [{ number: "27" }], more: false });
    expect(chapter.headers["access-control-allow-origin"]).toBe("*");
    const missing = await data.inject({
      method: "GET",
      url: "/api/widget/chapter?translation=kjv&book=Joel&chapter=9",
    });
    expect(missing.statusCode).toBe(404);
  });

  it.each([
    ...ACCOUNT_ROUTES,
    ["GET", "/api/translations"],
    ["GET", "/api/translations/kjv/passages?ref=Joel%202:27"],
    ["GET", "/api/search?q=know"],
    ["POST", "/api/study/words"],
  ] as const)("doesn't serve %s %s", async (method, url) => {
    const res = await data.inject({ method, url });
    expect(res.statusCode).toBe(404);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("vision §10 extension release: an app instance with accounts closed", () => {
  it.each([
    ["GET", "/api/translations"],
    ["GET", "/api/translations/kjv/passages?ref=Joel%202:27"],
    ["GET", "/api/translations/kjv/books"],
    ["GET", "/api/search?q=know"],
    ["GET", "/api/search/suggest?q=jo"],
    ["GET", "/api/widget/translations"],
  ] as const)("serves the reader's %s %s, with no cookies", async (method, url) => {
    const res = await reader.inject({ method, url });
    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("reads the study words", async () => {
    const res = await reader.inject({
      method: "POST",
      url: "/api/study/words",
      payload: { strongs: [] },
    });
    expect(res.statusCode).toBeLessThan(300);
  });

  it.each(ACCOUNT_ROUTES)("doesn't serve %s %s", async (method, url) => {
    const res = await reader.inject({ method, url });
    expect(res.statusCode).toBe(404);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("API_ROLE and ACCOUNTS", () => {
  it("is an app instance with accounts unless told otherwise", () => {
    expect(apiRoleFromEnv(undefined)).toBe("app");
    expect(apiRoleFromEnv("")).toBe("app");
    expect(apiRoleFromEnv("app")).toBe("app");
    expect(apiRoleFromEnv("data")).toBe("data");
    expect(accountsOpenFromEnv(undefined)).toBe(true);
    expect(accountsOpenFromEnv("open")).toBe(true);
    expect(accountsOpenFromEnv("closed")).toBe(false);
  });

  it("refuses anything else, so a typo can't start the wrong server", () => {
    expect(() => apiRoleFromEnv("Data")).toThrow(/API_ROLE/);
    expect(() => accountsOpenFromEnv("no")).toThrow(/ACCOUNTS/);
  });
});
