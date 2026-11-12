import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The site's content, read from `content/{locale}/`: the words every page shares
 * (`strings.json`), the plain pages (`pages/*.html`), and the help, one folder per product and
 * version (`extension/2.0/`), each with its table of contents (`topics.json`), one HTML fragment
 * per topic and its screenshots (`images/`). A version's folder is the record of how that
 * version worked: once the version is released, only corrections go into it.
 */

/** A help topic. Its `id` is its address and what the products' help links name: never renamed. */
export interface Topic {
  readonly id: string;
  readonly title: string;
  /** One sentence, shown in the table of contents and search results. */
  readonly summary: string;
  /** Other words a reader might search for. */
  readonly keywords: readonly string[];
  /** The topic's HTML fragment, as written (`{id}.html`). */
  readonly body: string;
}

export interface Group {
  readonly title: string;
  readonly topics: readonly Topic[];
}

/** The help for one version of a product. */
export interface DocsVersion {
  /** `2.0`: the product's version without its patch number. */
  readonly version: string;
  readonly groups: readonly Group[];
  /** Every topic, in the order of the table of contents. */
  readonly topics: readonly Topic[];
  /** The screenshots, by file name. */
  readonly images: ReadonlyMap<string, Uint8Array>;
}

export interface Product {
  /** `extension` or `widget`: the address segment. */
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  /** Oldest first; the last is the current one. */
  readonly versions: readonly DocsVersion[];
}

/** A plain page: its title, a description for search engines, and its fragment. */
export interface Page {
  readonly title: string;
  readonly description: string;
  readonly body: string;
}

export const PAGE_IDS = [
  "home",
  "downloads",
  "credits",
  "privacy",
  "terms",
  "contact",
  "not-found",
] as const;
export type PageId = (typeof PAGE_IDS)[number];

/** The words of the pages' frame and the help's furniture. */
export interface Strings {
  readonly siteName: string;
  readonly tagline: string;
  readonly nav: {
    readonly help: string;
    readonly downloads: string;
    readonly credits: string;
    readonly privacy: string;
    readonly terms: string;
    readonly contact: string;
  };
  readonly help: {
    readonly title: string;
    readonly description: string;
    readonly intro: string;
    readonly search: string;
    readonly searchHint: string;
    readonly noResults: string;
    readonly results: string;
    readonly searchFailed: string;
    readonly contents: string;
    readonly version: string;
    readonly versions: string;
    readonly latest: string;
    readonly outdated: string;
    readonly seeLatest: string;
    readonly previous: string;
    readonly next: string;
    readonly allTopics: string;
  };
  readonly products: Record<string, { readonly name: string; readonly summary: string }>;
  readonly pages: Record<PageId, { readonly title: string; readonly description: string }>;
}

export interface Content {
  readonly locale: string;
  readonly strings: Strings;
  readonly pages: Record<PageId, Page>;
  readonly products: readonly Product[];
}

const ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+$/;

/** Orders `2.0`, `2.1`, `2.10`, `10.0` by number. */
export function compareVersions(a: string, b: string): number {
  const [a1 = 0, a2 = 0] = a.split(".").map(Number);
  const [b1 = 0, b2 = 0] = b.split(".").map(Number);
  return a1 - b1 || a2 - b2;
}

/** The help version a product version reads: `2.0.3` reads `2.0`. */
export function docsVersionOf(productVersion: string): string {
  const match = /^(\d+)\.(\d+)(\.\d+)?/.exec(productVersion);
  if (!match) throw new Error(`not a version: "${productVersion}"`);
  return `${match[1]}.${match[2]}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function text(value: unknown, where: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${where} is missing`);
  return value;
}

async function folders(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

async function loadVersion(dir: string, where: string): Promise<DocsVersion> {
  const manifest: unknown = JSON.parse(await readFile(join(dir, "topics.json"), "utf8"));
  if (!isRecord(manifest) || !Array.isArray(manifest["groups"])) {
    throw new Error(`${where}/topics.json needs "groups"`);
  }
  const seen = new Set<string>();
  const groups: Group[] = [];
  for (const g of manifest["groups"] as unknown[]) {
    if (!isRecord(g) || !Array.isArray(g["topics"])) {
      throw new Error(`${where}/topics.json: a group needs "topics"`);
    }
    const topics: Topic[] = [];
    for (const t of g["topics"] as unknown[]) {
      if (!isRecord(t)) throw new Error(`${where}/topics.json: a topic must be an object`);
      const id = text(t["id"], `${where}/topics.json: a topic's id`);
      if (!ID.test(id))
        throw new Error(`${where}: "${id}" isn't a topic id (lowercase-and-dashes)`);
      if (seen.has(id)) throw new Error(`${where}: the topic "${id}" is listed twice`);
      seen.add(id);
      const keywords = t["keywords"] ?? [];
      if (!Array.isArray(keywords) || keywords.some((k) => typeof k !== "string")) {
        throw new Error(`${where}/${id}: keywords must be a list of words`);
      }
      let body: string;
      try {
        body = await readFile(join(dir, `${id}.html`), "utf8");
      } catch {
        throw new Error(`${where}/${id}.html is missing`);
      }
      topics.push({
        id,
        title: text(t["title"], `${where}/${id}: the title`),
        summary: text(t["summary"], `${where}/${id}: the summary`),
        keywords: keywords as string[],
        body,
      });
    }
    groups.push({ title: text(g["title"], `${where}: a group's title`), topics });
  }
  const written = (await readdir(dir)).filter((f) => f.endsWith(".html"));
  for (const file of written) {
    if (!seen.has(file.slice(0, -5))) throw new Error(`${where}/${file} isn't in topics.json`);
  }
  const images = new Map<string, Uint8Array>();
  for (const file of await readdir(join(dir, "images")).catch(() => [] as string[])) {
    if (file.endsWith(".png")) images.set(file, await readFile(join(dir, "images", file)));
  }
  return {
    version: where.slice(where.lastIndexOf("/") + 1),
    groups,
    topics: groups.flatMap((g) => g.topics),
    images,
  };
}

/** Reads and checks one locale's content. Anything missing or misnamed stops the build. */
export async function loadContent(root: string, locale: string): Promise<Content> {
  const dir = join(root, locale);
  const strings = JSON.parse(await readFile(join(dir, "strings.json"), "utf8")) as Strings;

  const pages = {} as Record<PageId, Page>;
  for (const id of PAGE_IDS) {
    const words = strings.pages[id];
    if (!words) throw new Error(`strings.json has no pages.${id}`);
    pages[id] = {
      title: text(words.title, `pages.${id}.title`),
      description: text(words.description, `pages.${id}.description`),
      body: await readFile(join(dir, "pages", `${id}.html`), "utf8"),
    };
  }

  const products: Product[] = [];
  for (const id of Object.keys(strings.products)) {
    const words = strings.products[id];
    if (!ID.test(id) || !words) throw new Error(`"${id}" isn't a product id`);
    const names = await folders(join(dir, id));
    const versions: DocsVersion[] = [];
    for (const name of names.sort(compareVersions)) {
      if (!VERSION.test(name)) throw new Error(`${id}/${name}: a version folder is named like 2.0`);
      versions.push(await loadVersion(join(dir, id, name), `${id}/${name}`));
    }
    if (versions.length === 0) throw new Error(`${id} has no version of its help`);
    products.push({ id, name: words.name, summary: words.summary, versions });
  }
  return { locale, strings, pages, products };
}

/** A product's current help: its newest version. */
export function latest(product: Product): DocsVersion {
  const version = product.versions[product.versions.length - 1];
  if (!version) throw new Error(`${product.id} has no version of its help`);
  return version;
}
