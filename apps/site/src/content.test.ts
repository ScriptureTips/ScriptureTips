import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONTENT, LOCALE } from "../build.ts";
import { loadContent, PAGE_IDS } from "./content.ts";

let dir: string | null = null;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true });
  dir = null;
});

/** A locale folder with one product and version, from the files given. */
async function folder(files: Record<string, string>): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), "site-content-"));
  const pages = Object.fromEntries(PAGE_IDS.map((id) => [id, { title: id, description: id }]));
  const all: Record<string, string> = {
    "strings.json": JSON.stringify({ products: { extension: { name: "E", summary: "S" } }, pages }),
    ...Object.fromEntries(PAGE_IDS.map((id) => [`pages/${id}.html`, "<p>x</p>"])),
    ...files,
  };
  for (const [path, body] of Object.entries(all)) {
    await mkdir(join(dir, "en-US", path, ".."), { recursive: true });
    await writeFile(join(dir, "en-US", path), body);
  }
  return dir;
}

const manifest = (...ids: string[]) =>
  JSON.stringify({
    groups: [{ title: "G", topics: ids.map((id) => ({ id, title: id, summary: id })) }],
  });

describe("the content folder", () => {
  it("loads as it is in the repository", async () => {
    const content = await loadContent(CONTENT, LOCALE);
    expect(content.products.map((p) => p.id)).toEqual(["extension", "widget"]);
    for (const product of content.products) {
      for (const version of product.versions) {
        expect(version.topics.length, `${product.id} ${version.version}`).toBeGreaterThan(0);
      }
    }
  });

  it("orders a product's versions by number", async () => {
    const root = await folder({
      "extension/2.10/topics.json": manifest("a"),
      "extension/2.10/a.html": "<p>a</p>",
      "extension/2.9/topics.json": manifest("a"),
      "extension/2.9/a.html": "<p>a</p>",
    });
    const content = await loadContent(root, "en-US");
    expect(content.products[0]?.versions.map((v) => v.version)).toEqual(["2.9", "2.10"]);
  });

  it("refuses a topic with no file, a file with no topic, and a misnamed id or version", async () => {
    await expect(
      loadContent(await folder({ "extension/2.0/topics.json": manifest("a") }), "en-US"),
    ).rejects.toThrow("a.html is missing");
    await expect(
      loadContent(
        await folder({
          "extension/2.0/topics.json": manifest("a"),
          "extension/2.0/a.html": "",
          "extension/2.0/b.html": "",
        }),
        "en-US",
      ),
    ).rejects.toThrow("b.html isn't in topics.json");
    await expect(
      loadContent(
        await folder({ "extension/2.0/topics.json": manifest("2x"), "extension/2.0/2x.html": "" }),
        "en-US",
      ),
    ).rejects.toThrow("isn't a topic id");
    await expect(
      loadContent(
        await folder({
          "extension/2.0.1/topics.json": manifest("a"),
          "extension/2.0.1/a.html": "",
        }),
        "en-US",
      ),
    ).rejects.toThrow("named like 2.0");
  });
});
