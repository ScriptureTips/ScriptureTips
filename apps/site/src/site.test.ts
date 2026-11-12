import { describe, expect, it } from "vitest";
import pkgExtension from "../../extension/package.json" with { type: "json" };
import pkgWidget from "../../widget/package.json" with { type: "json" };
import { site } from "../build.ts";
import {
  type Content,
  compareVersions,
  type DocsVersion,
  docsVersionOf,
  latest,
  type Topic,
} from "./content.ts";
import { settingsFrom } from "./settings.ts";
import { type Files, generate } from "./site.ts";

const decoder = new TextDecoder();
const page = (files: Files, path: string): string => {
  const bytes = files.get(path);
  if (!bytes) throw new Error(`no ${path}; there are ${[...files.keys()].join(", ")}`);
  return decoder.decode(bytes);
};

const settings = settingsFrom({
  ST_SITE: "https://reader.example",
  ST_DATA: "https://data.example",
  CONTACT_EMAIL: "someone@example.org",
});

/** The smallest PNG header that names a size: 200 by 100 pixels. */
const png = new Uint8Array(24);
png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
new DataView(png.buffer).setUint32(16, 200);
new DataView(png.buffer).setUint32(20, 100);

const topic = (id: string, body: string): Topic => ({
  id,
  title: `About ${id}`,
  summary: `What ${id} is.`,
  keywords: [],
  body,
});
const version = (name: string, topics: Topic[]): DocsVersion => ({
  version: name,
  groups: [{ title: "Using it", topics }],
  topics,
  images: new Map([["shot.png", png]]),
});

/** The real content's words and plain pages, with a product that has two versions of its help. */
async function twoVersions(): Promise<Content> {
  const { content } = await site(settings);
  return {
    ...content,
    products: [
      {
        id: "extension",
        name: "Browser extension",
        summary: "An extension.",
        versions: [
          version("2.0", [topic("pin", "<p>Old words.</p>"), topic("gone", "<p>Removed.</p>")]),
          version("2.1", [
            topic("pin", '<h2>Unpinning</h2><p><img src="images/shot.png" alt="The pin."></p>'),
            topic("fresh", '<p>See <a href="topic:pin">the pin</a>.</p>'),
          ]),
        ],
      },
    ],
  };
}

const sources = {
  css: 'body { background: url("__ARTWORK__"); }',
  searchScript: "/* search */",
  logo: png,
  artwork: new TextEncoder().encode("<svg/>"),
};

describe("the help's addresses (AGENTS.md: a contract with the products' help links)", () => {
  it("serves every version at its own address, and the latest without a version too", async () => {
    const files = generate(await twoVersions(), settings, sources);
    for (const path of [
      "about/index.html",
      "about/extension/index.html",
      "about/extension/pin/index.html",
      "about/extension/fresh/index.html",
      "about/extension/2.1/index.html",
      "about/extension/2.1/pin/index.html",
      "about/extension/2.0/index.html",
      "about/extension/2.0/pin/index.html",
      "about/extension/2.0/gone/index.html",
    ]) {
      expect(files.has(path), path).toBe(true);
    }
    // A topic the latest version no longer has is only at its own version.
    expect(files.has("about/extension/gone/index.html")).toBe(false);
    expect(page(files, "about/extension/pin/index.html")).toContain('<h2 id="unpinning">');
    expect(page(files, "about/extension/2.0/pin/index.html")).toContain("Old words.");
  });

  it("says so on an old version's pages, and points to the latest", async () => {
    const files = generate(await twoVersions(), settings, sources);
    const old = page(files, "about/extension/2.0/pin/index.html");
    expect(old).toContain("This is the help for Browser extension 2.0, an older version.");
    expect(old).toContain('<a href="/about/extension/pin/">See the help for version 2.1');
    expect(old).toContain('<meta name="robots" content="noindex, follow">');
    // A topic the latest doesn't have points to the latest contents.
    expect(page(files, "about/extension/2.0/gone/index.html")).toContain(
      '<a href="/about/extension/">See the help for version 2.1',
    );
    const current = page(files, "about/extension/2.1/pin/index.html");
    expect(current).not.toContain("help-outdated");
    expect(current).not.toContain("noindex");
    // The latest version's two addresses are one page to a search engine.
    expect(current).toContain(
      '<link rel="canonical" href="https://data.example/about/extension/pin/">',
    );
  });

  it("links each page to the same topic in the other versions, where they have it", async () => {
    const files = generate(await twoVersions(), settings, sources);
    const current = page(files, "about/extension/pin/index.html");
    expect(current).toContain(
      '<a href="/about/extension/2.1/pin/" aria-current="true">2.1 (latest)</a>',
    );
    expect(current).toContain('<a href="/about/extension/2.0/pin/">2.0</a>');
    expect(page(files, "about/extension/fresh/index.html")).toContain(
      '<a href="/about/extension/2.0/">2.0</a>',
    );
  });

  it("lists only the current pages for search engines", async () => {
    const files = generate(await twoVersions(), settings, sources);
    const sitemap = page(files, "sitemap.xml");
    expect(sitemap).toContain("<loc>https://data.example/about/extension/pin/</loc>");
    expect(sitemap).not.toContain("/2.0/");
    expect(sitemap).not.toContain("/2.1/");
  });
});

describe("caching: what a page loads is named by its bytes", () => {
  it("puts every stylesheet, script, image and search index under /assets/ with a hash", async () => {
    const files = generate(await twoVersions(), settings, sources);
    const html = page(files, "about/extension/pin/index.html");
    const loaded = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    expect(loaded.length).toBeGreaterThanOrEqual(4);
    for (const url of loaded) {
      expect(url).toMatch(/^\/assets\/[a-z0-9.-]+\.[0-9a-f]{12}\.(css|js|png|svg|json)$/);
      expect(files.has((url as string).slice(1)), url).toBe(true);
    }
    // The search index too, named in the form's data.
    const index = /search-extension-2\.1\.[0-9a-f]{12}\.json/.exec(html)?.[0];
    expect(files.has(`assets/${index}`)).toBe(true);
    // A screenshot is shown at half its pixel size (taken at twice the screen's resolution).
    expect(html).toMatch(
      /<img src="\/assets\/extension-shot\.[0-9a-f]{12}\.png" width="100" height="50"/,
    );
  });

  it("changes a file's name when its bytes change, and only then", async () => {
    const content = await twoVersions();
    const names = (css: string) =>
      [...generate(content, settings, { ...sources, css }).keys()].filter((p) =>
        p.startsWith("assets/"),
      );
    const before = names(sources.css);
    const after = names(`${sources.css} /* changed */`);
    expect(after.filter((n) => !before.includes(n))).toEqual([
      expect.stringMatching(/^assets\/site\./),
    ]);
  });
});

describe("the site as it's built from the repository", () => {
  it("has the help for the version each product is at (AGENTS.md: documented with the feature)", async () => {
    const { content } = await site(settings);
    for (const [id, productVersion] of [
      ["extension", pkgExtension.version],
      ["widget", pkgWidget.version],
    ] as const) {
      const product = content.products.find((p) => p.id === id);
      expect(product, id).toBeDefined();
      expect(latest(product as NonNullable<typeof product>).version, id).toBe(
        docsVersionOf(productVersion),
      );
    }
  });

  it("has every page the owner asked for, and no link or image that leads nowhere", async () => {
    const { files } = await site(settings);
    for (const path of [
      "index.html",
      "about/index.html",
      "downloads/index.html",
      "credits/index.html",
      "privacy/index.html",
      "terms/index.html",
      "contact/index.html",
      "404.html",
    ]) {
      expect(files.has(path), path).toBe(true);
    }
    const missing: string[] = [];
    for (const [path, bytes] of files) {
      if (!path.endsWith(".html")) continue;
      // Code samples show markup; they aren't links.
      const html = decoder.decode(bytes).replace(/<(pre|code)\b[\s\S]*?<\/\1>/g, "");
      for (const [, url] of html.matchAll(/(?:href|src|action)="([^"]+)"/g)) {
        if (!url || /^(https?:|mailto:|#)/.test(url)) continue;
        const base = new URL(`/${path.replace(/index\.html$/, "")}`, "https://x.example");
        const target = new URL(url, base);
        // The API is the data server's own (apps/api), not a file.
        if (target.pathname.startsWith("/api/") || target.pathname.startsWith("/widget/")) continue;
        const file = target.pathname.endsWith("/")
          ? `${target.pathname.slice(1)}index.html`
          : target.pathname.slice(1);
        const page = files.get(file);
        if (!page) missing.push(`${path}: ${url}`);
        else if (target.hash && !decoder.decode(page).includes(`id="${target.hash.slice(1)}"`)) {
          missing.push(`${path}: ${url} (no such heading)`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("leaves the contact page out, and every link to it, when no address is set", async () => {
    const { files } = await site(settingsFrom({}));
    expect(files.has("contact/index.html")).toBe(false);
    for (const [path, bytes] of files) {
      if (path.endsWith(".html")) expect(decoder.decode(bytes), path).not.toContain("/contact/");
    }
  });

  it("names the extension's store listings only once they are set", async () => {
    const without = page((await site(settings)).files, "downloads/index.html");
    expect(without).not.toContain("chromewebstore");
    const withStore = settingsFrom({
      CHROME_STORE_URL: "https://chromewebstore.google.com/detail/example",
    });
    expect(page((await site(withStore)).files, "downloads/index.html")).toContain(
      '<a href="https://chromewebstore.google.com/detail/example">',
    );
  });
});

describe("versions", () => {
  it("are ordered by number, and a full version reads its first two numbers' help", () => {
    expect(["2.10", "2.9", "10.0", "2.0"].sort(compareVersions)).toEqual([
      "2.0",
      "2.9",
      "2.10",
      "10.0",
    ]);
    expect(docsVersionOf("2.0.3")).toBe("2.0");
    expect(docsVersionOf("12.4")).toBe("12.4");
    expect(() => docsVersionOf("two")).toThrow();
  });
});

describe("public names", () => {
  it("never shows a development address in a page's words, though links keep it", async () => {
    const dev = settingsFrom({ CONTACT_EMAIL: "someone@example.org" });
    const { files } = await site(dev);
    let links = 0;
    for (const [path, bytes] of files) {
      if (!path.endsWith(".html")) continue;
      const html = decoder.decode(bytes);
      const words = [...html.matchAll(/>([^<>]+)</g)].map((m) => m[1]).join(" ");
      expect(words, path).not.toMatch(/dev\.scripture/);
      links += (html.match(/href="https:\/\/dev\.scripture/g) ?? []).length;
    }
    expect(links).toBeGreaterThan(0);
  });
});
