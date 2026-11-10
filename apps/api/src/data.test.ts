import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { translation, translationBook, verseText } from "@scripturetips/db";
import { testDatabase } from "@scripturetips/db/test-support";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiRoleFromEnv, createApp } from "./app.ts";

let drop: () => Promise<void>;
let app: NestFastifyApplication;

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
  });
  // No account or build settings: the data server must start without Valkey, SMTP or a file store.
  app = await createApp({ role: "data", databaseUrl: test.url });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
  await drop();
});

const get = (url: string) => app.inject({ method: "GET", url });

describe("vision §7.2: the data server", () => {
  it("serves what the extension and website plugins read, with no cookies", async () => {
    const list = await get("/api/widget/translations");
    expect(list.statusCode).toBe(200);
    expect(list.json().translations.map((t: { id: string }) => t.id)).toEqual(["kjv"]);
    expect(list.headers["access-control-allow-origin"]).toBe("*");
    expect(list.headers["set-cookie"]).toBeUndefined();

    const passage = await get("/api/widget/passage?translation=kjv&ref=Joel.2.27");
    expect(passage.statusCode).toBe(200);
    expect(passage.json()).toMatchObject({
      verses: [{ number: "27", text: "And ye shall know." }],
    });
    expect(passage.headers["set-cookie"]).toBeUndefined();
  });

  it.each([
    ["GET", "/api/translations"],
    ["GET", "/api/translations/kjv/passages?ref=Joel%202:27"],
    ["GET", "/api/auth/get-session"],
    ["POST", "/api/auth/email-otp/send-verification-otp"],
    ["GET", "/api/account"],
    ["GET", "/api/compilations"],
    ["GET", "/api/publications/someone/something/books"],
    ["GET", "/api/links?ref=Joel.2.27"],
    ["GET", "/api/search?q=know"],
    ["POST", "/api/study/words"],
  ] as const)("doesn't serve %s %s", async (method, url) => {
    const res = await app.inject({ method, url });
    expect(res.statusCode).toBe(404);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("API_ROLE", () => {
  it("is an app instance unless it says data", () => {
    expect(apiRoleFromEnv(undefined)).toBe("app");
    expect(apiRoleFromEnv("")).toBe("app");
    expect(apiRoleFromEnv("app")).toBe("app");
    expect(apiRoleFromEnv("data")).toBe("data");
  });

  it("refuses anything else, so a typo can't start the wrong server", () => {
    expect(() => apiRoleFromEnv("Data")).toThrow(/API_ROLE/);
  });
});
