import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { type Database, translation, translationBook, verseText } from "@scripturetips/db";
import { testDatabase } from "@scripturetips/db/test-support";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { signIn, testAccounts } from "../auth/test-support.ts";
import { testBuilds } from "../pdf-builds/test-support.ts";

let db: Database;
let drop: () => Promise<void>;
let app: NestFastifyApplication;
let owner: string;
let other: string;

/** A canonical ordinal range for one verse of Joel (book 29). */
const range = (chapter: number, verse: number) => {
  const start = 29 * 10_000_000 + chapter * 10_000 + verse * 10;
  return { start, end: start + 9 };
};

beforeAll(async () => {
  let url: string;
  ({ db, url, drop } = await testDatabase());
  // KJV Joel 2:28–29 is Joel 3:1–2 in the Hebrew (canonical) numbering.
  const [t] = await db
    .insert(translation)
    .values({
      catalogId: "kjv",
      abbreviation: "KJV",
      name: "The kjv translation",
      language: "en",
      direction: "ltr",
      scheme: "kjv",
      licenseKey: "public-domain",
    })
    .returning();
  if (!t) throw new Error("no translation");
  await db
    .insert(translationBook)
    .values({ translationId: t.id, book: "Joel", usfm: "JOL", position: 0, names: {} });
  await db.insert(verseText).values(
    [
      [2, 28, 3, 1],
      [2, 29, 3, 2],
    ].map(([chapter = 0, verse = 0, cc = 0, cv = 0]) => ({
      translationId: t.id,
      book: "Joel",
      chapter,
      verse,
      canonical: [`Joel.${cc}.${cv}`],
      mapping: "renumbered",
      canonicalRange: range(cc, cv),
      headings: [],
      content: [`KJV ${chapter}:${verse}.`],
    })),
  );

  const accounts = testAccounts();
  app = await createApp({
    databaseUrl: url,
    accounts: accounts.settings,
    builds: testBuilds().settings,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  owner = await signIn(app, accounts.sent, "linker@example.com");
  await call("PUT", owner, "/api/account", { handle: "linker", name: "A Linker" });
  other = await signIn(app, accounts.sent, "bystander@example.com");
  await call("PUT", other, "/api/account", { handle: "bystander", name: "A Bystander" });
  const made = await call("POST", owner, "/api/compilations", {
    title: "Mine",
    abbreviation: "mine",
    base: "kjv",
  });
  expect(made.statusCode).toBe(201);
});

afterAll(async () => {
  await app?.close();
  await drop();
});

const call = (method: "GET" | "POST" | "PUT" | "DELETE", cookie: string, url: string, p?: object) =>
  app.inject({ method, url, headers: { cookie }, ...(p ? { payload: p } : {}) });
const link = (cookie: string, target: string, source = "Joel.3.2", compilation = "mine") =>
  call("POST", cookie, "/api/links", { compilation, source, target });
const list = (cookie: string, ref: string) =>
  call("GET", cookie, `/api/links?ref=${encodeURIComponent(ref)}`);

describe("domain-model §3.1: scripture links", () => {
  let id: string;

  it("links words to a passage typed in the compilation's numbering, stored canonical", async () => {
    // KJV Joel 2:28 is Joel 3:1 in the canonical numbering.
    const res = await link(owner, "Joel 2:28");
    expect(res.statusCode).toBe(201);
    id = res.json().id;
    expect(res.json()).toMatchObject({ end: "source", other: { osis: "Joel.3.1" } });
  });

  it("keeps the words and where they're pinned, and shows them from either end", async () => {
    const anchor = {
      in: "kjv",
      compilation: "mine",
      start: { verse: "Joel.3.2", offset: 4 },
      end: { verse: "Joel.3.2", offset: 9 },
    };
    const res = await call("POST", owner, "/api/links", {
      compilation: "mine",
      source: "Joel.3.2",
      target: "Joel 2:28",
      quote: "words",
      anchor,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ quote: "words", anchor });
    for (const ref of ["Joel.3.2", "Joel.3.1"])
      expect((await list(owner, ref)).json().links).toContainEqual(
        expect.objectContaining({ id: res.json().id, quote: "words", anchor }),
      );
    // An anchor that isn't one is refused.
    const bad = await call("POST", owner, "/api/links", {
      compilation: "mine",
      source: "Joel.3.2",
      target: "Joel 2:28",
      quote: "words",
      anchor: { ...anchor, start: { verse: "Joel.3.2", offset: -1 } },
    });
    expect(bad.statusCode).toBe(400);
    await call("DELETE", owner, `/api/links/${res.json().id}`);
  });

  it("shows the link from either end, with the other end named", async () => {
    const fromSource = (await list(owner, "Joel.3.2")).json().links;
    expect(fromSource).toMatchObject([{ id, end: "source", other: { osis: "Joel.3.1" } }]);
    const fromTarget = (await list(owner, "Joel.3.1")).json().links;
    expect(fromTarget).toMatchObject([{ id, end: "target", other: { osis: "Joel.3.2" } }]);
  });

  it("finds a link by any overlap with a longer passage", async () => {
    const found = (await list(owner, "Joel.3.1-Joel.3.2")).json().links;
    expect(found).toHaveLength(1);
  });

  it("answers a reference that doesn't parse or exist with a code", async () => {
    const bad = await link(owner, "not a reference");
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toEqual(expect.any(String));
    const missing = await link(owner, "Joel 2:99");
    expect(missing.statusCode).toBe(400);
    const two = await link(owner, "Joel 2:28, 29");
    expect(two.statusCode).toBe(400);
  });

  it("needs a compilation of the user's own", async () => {
    expect((await link(owner, "Joel 2:28", "Joel.3.2", "missing")).statusCode).toBe(404);
    expect((await link(other, "Joel 2:28")).statusCode).toBe(404);
  });

  it("keeps one user's links from another", async () => {
    expect((await list(other, "Joel.3.1")).json().links).toEqual([]);
    expect((await call("DELETE", other, `/api/links/${id}`)).statusCode).toBe(404);
    expect((await list(owner, "Joel.3.1")).json().links).toHaveLength(1);
  });

  it("removes a link", async () => {
    expect((await call("DELETE", owner, `/api/links/${id}`)).statusCode).toBe(204);
    expect((await list(owner, "Joel.3.1")).json().links).toEqual([]);
  });

  it("refuses the signed-out", async () => {
    const res = await app.inject({ method: "GET", url: "/api/links?ref=Joel.3.1" });
    expect(res.statusCode).toBe(401);
  });
});
