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

/** Two translations of Joel 3:1–2 (canonical): the KJV numbers them 2:28–29. */
async function translationOf(
  catalogId: string,
  scheme: string,
  numbers: [number, number, number, number][],
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
      licenseKey: "public-domain",
    })
    .returning();
  if (!t) throw new Error("no translation");
  await db
    .insert(translationBook)
    .values({ translationId: t.id, book: "Joel", usfm: "JOL", position: 0, names: {} });
  await db.insert(verseText).values(
    numbers.map(([chapter, verse, cc, cv]) => ({
      translationId: t.id,
      book: "Joel",
      chapter,
      verse,
      canonical: [`Joel.${cc}.${cv}`],
      mapping: "renumbered",
      canonicalRange: range(cc, cv),
      headings: [],
      content: [`${catalogId.toUpperCase()} words of ${chapter}:${verse}.`],
    })),
  );
}

beforeAll(async () => {
  let url: string;
  ({ db, url, drop } = await testDatabase());
  await translationOf("kjv", "kjv", [
    [2, 28, 3, 1],
    [2, 29, 3, 2],
  ]);
  await translationOf("other", "kjv", [
    [2, 28, 3, 1],
    [2, 29, 3, 2],
  ]);
  const accounts = testAccounts();
  app = await createApp({
    databaseUrl: url,
    accounts: accounts.settings,
    builds: testBuilds().settings,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  owner = await signIn(app, accounts.sent, "annotator@example.com");
  await call("PUT", owner, "/api/account", { handle: "annotator", name: "An Annotator" });
  other = await signIn(app, accounts.sent, "onlooker@example.com");
  await call("PUT", other, "/api/account", { handle: "onlooker", name: "An Onlooker" });
  for (const cookie of [owner, other])
    expect(
      (
        await call("POST", cookie, "/api/compilations", {
          title: "Mine",
          abbreviation: "mine",
          base: "kjv",
        })
      ).statusCode,
    ).toBe(201);
});

afterAll(async () => {
  await app?.close();
  await drop();
});

const call = (
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  cookie: string,
  url: string,
  p?: object,
) => app.inject({ method, url, headers: { cookie }, ...(p ? { payload: p } : {}) });

const anchor = {
  in: "kjv",
  compilation: "mine",
  start: { verse: "Joel.3.2", offset: 4 },
  end: { verse: "Joel.3.2", offset: 9 },
};

const annotate = (cookie: string, body: string, extra: object = {}) =>
  call("POST", cookie, "/api/annotations", {
    compilation: "mine",
    source: "Joel.3.2",
    body,
    quote: "words",
    anchor,
    ...extra,
  });

describe("domain-model §3.4: annotations", () => {
  let id: string;

  it("keeps the user's text on selected words, with the words and where they're pinned", async () => {
    const res = await annotate(owner, "  A thought.  ");
    expect(res.statusCode).toBe(201);
    id = res.json().id;
    expect(res.json()).toMatchObject({
      quote: "words",
      anchor,
      body: "A thought.",
      passage: { osis: "Joel.3.2", label: "Joel 3:2" },
      collections: [],
    });
    const listed = (await call("GET", owner, "/api/annotations?ref=Joel.3.1-Joel.3.2")).json();
    expect(listed.annotations).toMatchObject([{ id, body: "A thought." }]);
    expect((await call("GET", owner, "/api/annotations?ref=Joel.3.1")).json().annotations).toEqual(
      [],
    );
  });

  it("changes an annotation's text", async () => {
    const res = await call("PATCH", owner, `/api/annotations/${id}`, { body: "Another thought." });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id, body: "Another thought." });
  });

  it("refuses empty text, and needs a compilation of the user's own", async () => {
    expect((await annotate(owner, "   ")).statusCode).toBe(400);
    expect((await annotate(owner, "Text", { compilation: "missing" })).statusCode).toBe(404);
  });

  it("keeps one user's annotations from another", async () => {
    expect((await call("GET", other, "/api/annotations?ref=Joel.3.2")).json().annotations).toEqual(
      [],
    );
    expect(
      (await call("PATCH", other, `/api/annotations/${id}`, { body: "Mine" })).statusCode,
    ).toBe(404);
    expect((await call("DELETE", other, `/api/annotations/${id}`)).statusCode).toBe(404);
  });

  it("removes an annotation", async () => {
    expect((await call("DELETE", owner, `/api/annotations/${id}`)).statusCode).toBe(204);
    expect((await call("GET", owner, "/api/annotations?ref=Joel.3.2")).json().annotations).toEqual(
      [],
    );
  });

  it("refuses the signed-out", async () => {
    const res = await app.inject({ method: "GET", url: "/api/annotations?ref=Joel.3.1" });
    expect(res.statusCode).toBe(401);
  });
});

describe("domain-model §3.1: a link's note and target can be changed", () => {
  it("changes the note and the passage it goes to, and lists the collections it's in", async () => {
    const made = await call("POST", owner, "/api/links", {
      compilation: "mine",
      source: "Joel.3.2",
      target: "Joel 2:28",
      quote: "words",
      anchor,
    });
    expect(made.json()).toMatchObject({ note: null, collections: [] });
    const id = made.json().id;
    const noted = await call("PATCH", owner, `/api/links/${id}`, { note: " Why. " });
    expect(noted.json()).toMatchObject({ id, note: "Why.", other: { osis: "Joel.3.1" } });
    // Typed in the numbering of the compilation the words were selected in (the anchor's).
    const moved = await call("PATCH", owner, `/api/links/${id}`, { target: "Joel 2:29" });
    expect(moved.json()).toMatchObject({ id, note: "Why.", other: { osis: "Joel.3.2" } });
    expect((await call("PATCH", owner, `/api/links/${id}`, { note: "" })).json().note).toBeNull();
    expect((await call("PATCH", other, `/api/links/${id}`, { note: "Hers" })).statusCode).toBe(404);
    await call("DELETE", owner, `/api/links/${id}`);
  });

  it("makes another link for the same words in another wording", async () => {
    const make = (wording: string) =>
      call("POST", owner, "/api/links", {
        compilation: "mine",
        source: "Joel.3.2",
        target: "Joel 2:28",
        quote: "words",
        anchor: { ...anchor, in: wording },
      });
    const one = await make("kjv");
    const two = await make("@compilation");
    expect(two.json().id).not.toBe(one.json().id);
    expect((await make("kjv")).json().id).toBe(one.json().id);
    for (const r of [one, two]) await call("DELETE", owner, `/api/links/${r.json().id}`);
  });

  it("makes a link with a note, in collections; the same link again joins them, never rewords", async () => {
    const pocket = (await call("POST", owner, "/api/collections", { title: "Links kept" })).json()
      .id;
    const desk = (await call("POST", owner, "/api/collections", { title: "Links desk" })).json().id;
    const make = (extra: object) =>
      call("POST", owner, "/api/links", {
        compilation: "mine",
        source: "Joel.3.2",
        target: "Joel 2:28",
        quote: "words",
        anchor,
        ...extra,
      });
    const first = await make({ collections: [pocket] });
    expect(first.json()).toMatchObject({ note: null, collections: [pocket] });
    // The same words to the same passage, no note: the link there, now in both collections.
    const again = await make({ collections: [desk] });
    expect(again.json()).toMatchObject({ id: first.json().id, collections: [pocket, desk] });
    // With a note: a link of its own; the first one's note is untouched.
    const noted = await make({ note: "  Why.  ", collections: [desk] });
    expect(noted.json().id).not.toBe(first.json().id);
    expect(noted.json()).toMatchObject({ note: "Why.", collections: [desk] });
    const items = (await call("GET", owner, `/api/collections/items?in=${desk}`)).json().items;
    expect(items.map((i: { id: string; text: string | null }) => [i.id, i.text])).toEqual([
      [first.json().id, null],
      [noted.json().id, "Why."],
    ]);
    // Not into another user's collection.
    const hers = (await call("POST", other, "/api/collections", { title: "Her links" })).json().id;
    expect((await make({ collections: [hers] })).statusCode).toBe(404);
    for (const r of [first, noted]) await call("DELETE", owner, `/api/links/${r.json().id}`);
    for (const c of [pocket, desk]) await call("DELETE", owner, `/api/collections/${c}`);
    await call("DELETE", other, `/api/collections/${hers}`);
  });
});

describe("domain-model §3.6: annotation collections", () => {
  let study: string;
  let print: string;
  let note: string;
  let link: string;

  it("makes, renames and lists collections, by title", async () => {
    const res = await call("POST", owner, "/api/collections", { title: "Study Bible" });
    expect(res.statusCode).toBe(201);
    study = res.json().id;
    print = (await call("POST", owner, "/api/collections", { title: "Pocket" })).json().id;
    // A title is the user's once.
    expect((await call("POST", owner, "/api/collections", { title: "Pocket" })).statusCode).toBe(
      409,
    );
    expect(
      (await call("PATCH", owner, `/api/collections/${print}`, { title: "Study Bible" }))
        .statusCode,
    ).toBe(409);
    const renamed = await call("PATCH", owner, `/api/collections/${print}`, {
      title: "Pocket Bible",
    });
    expect(renamed.json()).toMatchObject({ id: print, title: "Pocket Bible", count: 0 });
    const listed = (await call("GET", owner, "/api/collections")).json();
    expect(listed.collections.map((c: { title: string }) => c.title)).toEqual([
      "Pocket Bible",
      "Study Bible",
    ]);
    // Another user's collection is as good as missing.
    expect(
      (await call("PATCH", other, `/api/collections/${print}`, { title: "Hers" })).statusCode,
    ).toBe(404);
  });

  it("keeps a collection's description, the preface for its translation (at most 2000 characters)", async () => {
    const made = await call("POST", owner, "/api/collections", {
      title: "Prefaced",
      description: "  Notes on the patriarchs.  ",
    });
    expect(made.statusCode).toBe(201);
    expect(made.json()).toMatchObject({ description: "Notes on the patriarchs.", count: 0 });
    const id = made.json().id;
    const listed = (await call("GET", owner, "/api/collections")).json();
    expect(listed.collections.find((c: { id: string }) => c.id === id)).toMatchObject({
      description: "Notes on the patriarchs.",
    });
    // Renamed, it keeps it; one made without a description (or an empty one) has none.
    expect(
      (await call("PATCH", owner, `/api/collections/${id}`, { title: "Prefaced too" })).json(),
    ).toMatchObject({ description: "Notes on the patriarchs." });
    expect(
      (await call("POST", owner, "/api/collections", { title: "Bare", description: "   " })).json(),
    ).toMatchObject({ description: null });
    expect(
      (
        await call("POST", owner, "/api/collections", {
          title: "Long",
          description: "x".repeat(2001),
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call("POST", owner, "/api/collections", {
          title: "Long",
          description: "x".repeat(2000),
        })
      ).statusCode,
    ).toBe(201);
    for (const c of (await call("GET", owner, "/api/collections")).json().collections)
      if (["Prefaced too", "Bare", "Long"].includes(c.title))
        await call("DELETE", owner, `/api/collections/${c.id}`);
    expect(
      (await call("GET", owner, "/api/collections"))
        .json()
        .collections.map((c: { title: string }) => c.title),
    ).toEqual(["Pocket Bible", "Study Bible"]);
  });

  it("lists links and annotations together in verse order, by collection or in none", async () => {
    note = (await annotate(owner, "In the study Bible", { collections: [study] })).json().id;
    link = (
      await call("POST", owner, "/api/links", {
        compilation: "mine",
        source: "Joel.3.1",
        target: "Joel 2:29",
      })
    ).json().id;
    const all = (await call("GET", owner, "/api/collections/items")).json();
    // Joel 3:1 before 3:2, whichever was made first.
    expect(all.items.map((i: { kind: string; id: string }) => [i.kind, i.id])).toEqual([
      ["link", link],
      ["annotation", note],
    ]);
    expect(all.items[1]).toMatchObject({ text: "In the study Bible", collections: [study] });
    expect(all.items[0]).toMatchObject({ target: { osis: "Joel.3.2" }, text: null });
    expect(
      (await call("GET", owner, "/api/collections/items?in=default")).json().items,
    ).toMatchObject([{ id: link }]);
    expect(
      (await call("GET", owner, `/api/collections/items?in=${study}`)).json().items,
    ).toMatchObject([{ id: note }]);
    const counts = (await call("GET", owner, "/api/collections")).json();
    expect(counts).toMatchObject({ unsorted: 1, total: 2 });
    // Nobody else's.
    expect((await call("GET", other, "/api/collections/items")).json().items).toEqual([]);
    expect((await call("GET", other, `/api/collections/items?in=${study}`)).statusCode).toBe(404);
  });

  it("puts an item in several collections, takes it out, and moves it", async () => {
    const both = await call("PUT", owner, `/api/collections/items/annotation/${note}`, {
      collections: [study, print],
    });
    expect(both.json().collections).toEqual([study, print]);
    const counted = (await call("GET", owner, "/api/collections")).json();
    expect(counted.collections).toEqual([
      expect.objectContaining({ id: print, count: 1 }),
      expect.objectContaining({ id: study, count: 1 }),
    ]);
    // The same item, referenced: an edit shows in both.
    await call("PATCH", owner, `/api/annotations/${note}`, { body: "Edited once" });
    for (const c of [study, print])
      expect(
        (await call("GET", owner, `/api/collections/items?in=${c}`)).json().items,
      ).toMatchObject([{ id: note, text: "Edited once" }]);
    // Moved: out of one, into the other.
    const moved = await call("PUT", owner, `/api/collections/items/link/${link}`, {
      collections: [print],
    });
    expect(moved.json().collections).toEqual([print]);
    // Taken out of all: the default collection.
    await call("PUT", owner, `/api/collections/items/link/${link}`, { collections: [] });
    expect(
      (await call("GET", owner, "/api/collections/items?in=default")).json().items,
    ).toMatchObject([{ id: link }]);
    // Not into another user's collection, and not another user's item.
    const hers = (await call("POST", other, "/api/collections", { title: "Hers" })).json().id;
    expect(
      (
        await call("PUT", owner, `/api/collections/items/link/${link}`, {
          collections: [hers],
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await call("PUT", other, `/api/collections/items/link/${link}`, {
          collections: [hers],
        })
      ).statusCode,
    ).toBe(404);
  });

  it("copies an item into a collection as one of its own, to reword it there", async () => {
    const res = await call("POST", owner, `/api/collections/items/annotation/${note}/copies`, {
      collections: [print],
    });
    expect(res.statusCode).toBe(201);
    const copy = res.json();
    expect(copy).toMatchObject({
      kind: "annotation",
      text: "Edited once",
      quote: "words",
      anchor,
      collections: [print],
    });
    expect(copy.id).not.toBe(note);
    await call("PATCH", owner, `/api/annotations/${copy.id}`, { body: "For the pocket Bible" });
    const original = (await call("GET", owner, "/api/annotations?ref=Joel.3.2")).json().annotations;
    expect(original).toContainEqual(expect.objectContaining({ id: note, body: "Edited once" }));
    const linkCopy = await call("POST", owner, `/api/collections/items/link/${link}/copies`, {
      collections: [],
    });
    expect(linkCopy.json()).toMatchObject({ kind: "link", target: { osis: "Joel.3.2" } });
    expect(linkCopy.json().id).not.toBe(link);
  });

  it("copies an item onto words chosen in another wording, taking their verses", async () => {
    const words = {
      quote: "words of 2:28",
      anchor: {
        in: "other",
        compilation: "mine",
        start: { verse: "Joel.3.1", offset: 6 },
        end: { verse: "Joel.3.1", offset: 19 },
      },
    };
    const res = await call("POST", owner, `/api/collections/items/annotation/${note}/copies`, {
      collections: [study],
      words,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      ...words,
      passage: { osis: "Joel.3.1" },
      text: "Edited once",
      collections: [study],
    });
    // The original stays where it was.
    expect(
      (await call("GET", owner, "/api/annotations?ref=Joel.3.2")).json().annotations,
    ).toContainEqual(expect.objectContaining({ id: note, anchor }));
    // Words that aren't one passage are refused.
    const bad = await call("POST", owner, `/api/collections/items/link/${link}/copies`, {
      collections: [],
      words: {
        ...words,
        anchor: { ...words.anchor, start: { verse: "Joel.3.2", offset: 0 } },
      },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("moves an item onto words chosen in another wording: the same item, in its collections", async () => {
    const made = (await annotate(owner, "To be moved", { collections: [study] })).json();
    const words = {
      quote: "words of 2:28",
      anchor: {
        in: "other",
        compilation: "mine",
        start: { verse: "Joel.3.1", offset: 6 },
        end: { verse: "Joel.3.1", offset: 19 },
      },
    };
    const res = await call(
      "PUT",
      owner,
      `/api/collections/items/annotation/${made.id}/words`,
      words,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: made.id,
      ...words,
      passage: { osis: "Joel.3.1" },
      text: "To be moved",
      collections: [study],
    });
    // Study mode finds it on its new verses, not the old.
    expect(
      (await call("GET", owner, "/api/annotations?ref=Joel.3.1")).json().annotations,
    ).toContainEqual(expect.objectContaining({ id: made.id, quote: "words of 2:28" }));
    expect(
      (await call("GET", owner, "/api/annotations?ref=Joel.3.2")).json().annotations,
    ).not.toContainEqual(expect.objectContaining({ id: made.id }));
    // A link too; not another user's; not words that aren't one passage.
    const moved = await call("PUT", owner, `/api/collections/items/link/${link}/words`, words);
    expect(moved.json()).toMatchObject({
      id: link,
      quote: "words of 2:28",
      target: { osis: "Joel.3.2" },
    });
    expect(
      (await call("PUT", other, `/api/collections/items/link/${link}/words`, words)).statusCode,
    ).toBe(404);
    const bad = await call("PUT", owner, `/api/collections/items/link/${link}/words`, {
      ...words,
      anchor: { ...words.anchor, start: { verse: "Joel.3.2", offset: 0 } },
    });
    expect(bad.statusCode).toBe(400);
    await call("DELETE", owner, `/api/annotations/${made.id}`);
  });

  it("deletes a collection, leaving its items (in the default collection, if in no other)", async () => {
    expect((await call("DELETE", owner, `/api/collections/${print}`)).statusCode).toBe(204);
    const items = (await call("GET", owner, "/api/collections/items")).json().items;
    expect(items).toContainEqual(expect.objectContaining({ id: note, collections: [study] }));
    expect((await call("DELETE", other, `/api/collections/${study}`)).statusCode).toBe(404);
  });

  it("takes an item out of one collection, and deletes it only when no collection holds it", async () => {
    const made2 = async (title: string) =>
      (await call("POST", owner, "/api/collections", { title })).json().id as string;
    const desk = await made2("Desk");
    const shelf = await made2("Shelf");
    const made = await annotate(owner, "Kept twice", { collections: [desk, shelf] });
    const kept = made.json().id;
    const out = (from: string, keep = false, who = owner) =>
      call(
        "DELETE",
        who,
        `/api/collections/items/annotation/${kept}?from=${from}${keep ? "&keep=true" : ""}`,
      );
    // Out of one: it stays in the other.
    const first = await out(desk);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ deleted: false, collections: [shelf] });
    // "Keep" never deletes: out of its last collection is refused, and nothing changes.
    const refused = await out(shelf, true);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().code).toBe("last-collection");
    // From the default collection, while a collection holds it: nothing is deleted.
    expect((await out("default")).json()).toEqual({ deleted: false, collections: [shelf] });
    // Someone else's is as good as missing.
    expect((await out(shelf, false, other)).statusCode).toBe(404);
    // Out of its last collection: deleted.
    expect((await out(shelf)).json()).toEqual({ deleted: true, collections: [] });
    expect((await call("PATCH", owner, `/api/annotations/${kept}`, { body: "x" })).statusCode).toBe(
      404,
    );
    // One in no collection is deleted from the default collection.
    const loose = (await annotate(owner, "Loose")).json().id;
    const gone = await call(
      "DELETE",
      owner,
      `/api/collections/items/annotation/${loose}?from=default`,
    );
    expect(gone.json()).toEqual({ deleted: true, collections: [] });
    for (const c of [desk, shelf]) await call("DELETE", owner, `/api/collections/${c}`);
  });

  it("deleting an item takes it out of every collection", async () => {
    await call("DELETE", owner, `/api/annotations/${note}`);
    const left = (await call("GET", owner, `/api/collections/items?in=${study}`)).json().items;
    expect(left.some((i: { id: string }) => i.id === note)).toBe(false);
  });
});

describe("the wording a copy's words are chosen in", () => {
  it("gives a translation's verses for canonical verses, in its own numbering", async () => {
    const res = await call(
      "GET",
      owner,
      "/api/annotations/wording?ref=Joel.3.2&in=other&compilation=mine",
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      in: "other",
      abbreviation: "OTHER",
      verses: [{ chapter: 2, verse: 29, canonical: ["Joel.3.2"] }],
    });
  });

  it("gives a compilation's own wording, read through its rules", async () => {
    const res = await call(
      "GET",
      owner,
      "/api/annotations/wording?ref=Joel.3.1&in=@compilation&compilation=mine",
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      in: "@compilation",
      compilation: "mine",
      abbreviation: "mine",
      verses: [{ chapter: 2, verse: 28, canonical: ["Joel.3.1"] }],
    });
  });

  it("knows only the user's compilations and the translations there are", async () => {
    const [unknown, hers] = await Promise.all([
      call("GET", owner, "/api/annotations/wording?ref=Joel.3.1&in=nothing&compilation=mine"),
      call("GET", other, "/api/annotations/wording?ref=Joel.3.1&in=@compilation&compilation=x1"),
    ]);
    expect(unknown.statusCode).toBe(404);
    expect(hers.statusCode).toBe(404);
  });
});
