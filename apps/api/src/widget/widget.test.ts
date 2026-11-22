import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  and,
  type Database,
  eq,
  translation,
  translationBook,
  translatorNote,
  verseText,
} from "@scripturetips/db";
import { testDatabase } from "@scripturetips/db/test-support";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { testAccounts } from "../auth/test-support.ts";
import { testBuilds } from "../pdf-builds/test-support.ts";
import { MAX_WIDGET_VERSES } from "./widget.service.ts";

let db: Database;
let drop: () => Promise<void>;
let app: NestFastifyApplication;

/** A canonical ordinal range for one verse of Joel (book 29). */
const range = (chapter: number, verse: number) => {
  const start = 29 * 10_000_000 + chapter * 10_000 + verse * 10;
  return { start, end: start + 9 };
};

async function addTranslation(
  catalogId: string,
  scheme: string,
  licenseKey: string,
  /** [chapter, verse, canonical chapter, canonical verse, text] */
  verses: [number, number, number, number, string][],
) {
  const [t] = await db
    .insert(translation)
    .values({
      catalogId,
      abbreviation: catalogId.toUpperCase(),
      name: `The ${catalogId} translation`,
      language: "en",
      direction: "ltr",
      scheme,
      licenseKey,
    })
    .returning();
  if (!t) throw new Error("no translation");
  await db
    .insert(translationBook)
    .values({ translationId: t.id, book: "Joel", usfm: "JOL", position: 0, names: {} });
  await db.insert(verseText).values(
    verses.map(([chapter, verse, cc, cv, text]) => ({
      translationId: t.id,
      book: "Joel",
      chapter,
      verse,
      canonical: [`Joel.${cc}.${cv}`],
      mapping: chapter === cc ? "same" : "renumbered",
      canonicalRange: range(cc, cv),
      headings: [],
      content: [text, { type: "note", position: 0 }],
      plain: text,
    })),
  );
}

beforeAll(async () => {
  let url: string;
  ({ db, url, drop } = await testDatabase());
  // KJV Joel 2:28–29 is Joel 3:1–2 in the Hebrew (canonical) numbering.
  await addTranslation("kjv", "kjv", "public-domain", [
    [2, 27, 2, 27, "KJV 2:27."],
    [2, 28, 3, 1, "KJV 2:28."],
    [2, 29, 3, 2, "KJV 2:29."],
    ...Array.from({ length: 20 }, (_, i): [number, number, number, number, string] => [
      1,
      i + 1,
      1,
      i + 1,
      `KJV 1:${i + 1}.`,
    ]),
  ]);
  await addTranslation("heb", "hebrew", "public-domain", [
    [3, 1, 3, 1, "HEB 3:1."],
    [3, 2, 3, 2, "HEB 3:2."],
  ]);
  await addTranslation("leb", "kjv", "leb", [[2, 28, 3, 1, "LEB 2:28."]]);
  await addTranslation("unrecorded", "kjv", "terms-not-recorded", [[2, 28, 3, 1, "X 2:28."]]);

  const accounts = testAccounts();
  app = await createApp({
    databaseUrl: url,
    accounts: accounts.settings,
    builds: testBuilds().settings,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
  await drop();
});

const get = (url: string) => app.inject({ method: "GET", url });
const passage = (translationId: string, ref: string, scheme?: string) =>
  get(
    `/api/widget/passage?translation=${translationId}&ref=${encodeURIComponent(ref)}${scheme ? `&scheme=${scheme}` : ""}`,
  );

describe("vision §3.6: what website plugins read", () => {
  it("lists only the translations whose terms are on record, to any origin, cacheable", async () => {
    const res = await get("/api/widget/translations");
    expect(res.statusCode).toBe(200);
    expect(
      res
        .json()
        .translations.map((t: { id: string }) => t.id)
        .sort(),
    ).toEqual(["heb", "kjv", "leb"]);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["cache-control"]).toMatch(/public/);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("gives a passage's words, with its label and no notes", async () => {
    const res = await passage("kjv", "Joel.2.28-Joel.2.29");
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.json()).toMatchObject({
      translation: { id: "kjv", abbreviation: "KJV", direction: "ltr" },
      label: "Joel 2:28–29",
      verses: [
        { number: "28", text: "KJV 2:28." },
        { number: "29", text: "KJV 2:29." },
      ],
      more: false,
      attribution: null,
    });
  });

  it("carries a verse's notes with the place of their marks in its words", async () => {
    const [t] = await db.select().from(translation).where(eq(translation.catalogId, "kjv"));
    const [verse] = await db
      .select()
      .from(verseText)
      .where(
        and(
          eq(verseText.translationId, t?.id ?? ""),
          eq(verseText.chapter, 2),
          eq(verseText.verse, 28),
        ),
      );
    await db.insert(translatorNote).values({
      verseTextId: verse?.id ?? "",
      position: 0,
      kind: "footnote",
      marker: "f",
      caller: "+",
      category: null,
      span: null,
      body: [
        { type: "char", marker: "fr", content: ["2.28 "] },
        "Or ",
        { type: "char", marker: "it", content: ["afterward"] },
      ],
    });
    const res = await passage("kjv", "Joel.2.28-Joel.2.29");
    const [first, second] = res.json().verses;
    // The mark falls after the verse's words; the note is its words without its reference.
    expect(first).toEqual({
      number: "28",
      text: "KJV 2:28.",
      notes: [{ at: "KJV 2:28.".length, letter: "a", text: "Or afterward" }],
    });
    // A verse with none says nothing of them.
    expect(second).toEqual({ number: "29", text: "KJV 2:29." });
  });

  it("reads a reference in the KJV's numbering out of a translation numbered another way", async () => {
    // KJV Joel 2:28 is Hebrew Joel 3:1.
    const res = await passage("heb", "Joel.2.28");
    expect(res.json()).toMatchObject({
      label: "Joel 3:1",
      verses: [{ number: "1", text: "HEB 3:1." }],
    });
    // The same reference, said to be in the Hebrew numbering, is Joel 3:1 there too, and
    // Joel 2:28 in the KJV.
    const other = await passage("kjv", "Joel.3.1", "hebrew");
    expect(other.json()).toMatchObject({ label: "Joel 2:28", verses: [{ text: "KJV 2:28." }] });
  });

  it("carries the attribution a license asks for", async () => {
    const res = await passage("leb", "Joel.2.28");
    expect(res.json().attribution).toMatchObject({
      designation: "LEB",
      links: expect.arrayContaining([expect.objectContaining({ url: expect.any(String) })]),
    });
  });

  it("shows a few verses of a long passage and says there's more", async () => {
    const res = await passage("kjv", "Joel.1.1-Joel.1.20");
    expect(res.json().verses).toHaveLength(MAX_WIDGET_VERSES);
    expect(res.json().more).toBe(true);
  });

  it("finds verses by any translation's words, shown in one that may be shown here", async () => {
    // The LEB's Joel 2:28 (canonical 3:1) shown in the KJV: the KJV's verse, in its numbering.
    const kjv = await get("/api/widget/search?q=LEB&kinds=text&showIn=kjv");
    expect(kjv.statusCode).toBe(200);
    expect(kjv.json().results).toEqual([
      expect.objectContaining({ id: "text:kjv:Joel.2.28", label: "Joel 2:28" }),
    ]);
    // One that may not be shown here is ignored: the verse comes as found, never in its words.
    const hidden = await get("/api/widget/search?q=LEB&kinds=text&showIn=unrecorded");
    expect(hidden.json().results.map((r: { id: string }) => r.id)).toEqual(["text:leb:Joel.2.28"]);
  });

  it("answers a translation it won't show, or a reference it can't use, with a code", async () => {
    const unrecorded = await passage("unrecorded", "Joel.2.28");
    expect(unrecorded.statusCode).toBe(404);
    expect(unrecorded.json().code).toBe("unknown-translation");
    expect((await passage("nothing", "Joel.2.28")).statusCode).toBe(404);
    expect((await passage("kjv", "not a passage")).statusCode).toBe(400);
  });
});
