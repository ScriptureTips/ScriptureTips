import { createHash } from "node:crypto";
import { extname } from "node:path";
import {
  type Content,
  type DocsVersion,
  latest,
  PAGE_IDS,
  type PageId,
  type Product,
  type Topic,
} from "./content.ts";
import { type Rendered, renderFragment } from "./fragment.ts";
import { escapeHtml } from "./html.ts";
import { pngSize, SHOT_SCALE } from "./png.ts";
import type { SearchIndex } from "./search.ts";
import type { Settings } from "./settings.ts";

/**
 * Makes the whole site from its content: every page as a file, and under `assets/` everything a
 * page loads, each named with a hash of its bytes so it can be cached for good (site.caddy).
 *
 * The help's addresses are a contract with the products' help links (AGENTS.md):
 * `/about/{product}/{version}/{topic}/` is that version's topic for good, and
 * `/about/{product}/{topic}/` is the current version's.
 */

/** What the build hands over besides the content. */
export interface Sources {
  /** The stylesheet; `__ARTWORK__` in it becomes the background artwork's address. */
  readonly css: string;
  /** The help search's script, bundled. */
  readonly searchScript: string;
  readonly logo: Uint8Array;
  readonly artwork: Uint8Array;
}

export type Files = Map<string, Uint8Array>;

const encoder = new TextEncoder();

/** Where a plain page is served. */
const PAGE_PATHS: Record<PageId, string> = {
  home: "/",
  downloads: "/downloads/",
  credits: "/credits/",
  privacy: "/privacy/",
  terms: "/terms/",
  contact: "/contact/",
  "not-found": "/404.html",
};

interface Frame {
  readonly title: string;
  readonly description: string;
  /** The page's own address (a path), and the one search engines should keep, if another. */
  readonly path: string;
  readonly canonical?: string;
  readonly noindex?: boolean;
  /** The help's pages are wider and load the search script. */
  readonly help?: boolean;
  readonly main: string;
}

export function generate(content: Content, settings: Settings, sources: Sources): Files {
  const files: Files = new Map();
  const { strings } = content;

  const put = (path: string, body: string | Uint8Array) => {
    if (files.has(path)) throw new Error(`two files at ${path}`);
    files.set(path, typeof body === "string" ? encoder.encode(body) : body);
  };
  /** Adds a file under `assets/`, named with its hash, and gives its address. */
  const asset = (name: string, body: string | Uint8Array): string => {
    const bytes = typeof body === "string" ? encoder.encode(body) : body;
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    const ext = extname(name);
    const path = `assets/${name.slice(0, name.length - ext.length)}.${hash}${ext}`;
    if (!files.has(path)) files.set(path, bytes);
    return `/${path}`;
  };

  const logo = asset("logo.png", sources.logo);
  const artwork = asset("clouds-and-birds.svg", sources.artwork);
  const css = asset("site.css", sources.css.replaceAll("__ARTWORK__", artwork));
  const searchScript = asset("search.js", sources.searchScript);

  // The help is written for the public names: a build for the development stack still links to
  // its own addresses, but never shows "dev." to a reader.
  const publicNames = [settings.site, settings.data].map((url): [string, string] => {
    const { host } = new URL(url);
    return [host, host.replace(/^dev\./, "")];
  });
  const shown = (text: string): string =>
    publicNames.reduce((t, [from, to]) => t.split(from).join(to), text);

  const values: Record<string, string | null> = {
    site: settings.site,
    data: settings.data,
    siteHost: new URL(settings.site).host,
    dataHost: new URL(settings.data).host,
    contactEmail: settings.contactEmail,
    chromeStore: settings.chromeStore,
    firefoxStore: settings.firefoxStore,
  };

  const footer = [
    ["/about/", strings.nav.help],
    ["/downloads/", strings.nav.downloads],
    ["/credits/", strings.nav.credits],
    ["/privacy/", strings.nav.privacy],
    ["/terms/", strings.nav.terms],
    ...(settings.contactEmail ? [["/contact/", strings.nav.contact]] : []),
  ] as [string, string][];

  const frame = (page: Frame): string => {
    const title =
      page.path === "/"
        ? `${strings.siteName}: ${strings.tagline}`
        : `${page.title} · ${strings.siteName}`;
    return `<!doctype html>
<html lang="${content.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
${page.noindex ? '<meta name="robots" content="noindex, follow">\n' : ""}${
  page.path === "/404.html"
    ? ""
    : `<link rel="canonical" href="${settings.data}${page.canonical ?? page.path}">\n`
}<link rel="icon" href="${logo}">
<link rel="stylesheet" href="${css}">
${page.help ? `<script src="${searchScript}" defer></script>\n` : ""}</head>
<body>
<header class="site-header">
<a href="/" class="brand"><img src="${logo}" width="48" height="48" alt=""><span>${escapeHtml(strings.siteName)}</span></a>
<nav aria-label="${escapeHtml(strings.siteName)}"><a href="/about/">${escapeHtml(strings.nav.help)}</a><a href="/downloads/">${escapeHtml(strings.nav.downloads)}</a></nav>
</header>
<main${page.help ? ' class="wide"' : ""}>
${page.main}
</main>
<footer class="site-footer">
${footer.map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`).join("\n")}
</footer>
</body>
</html>
`;
  };

  // The plain pages.
  for (const id of PAGE_IDS) {
    if (id === "contact" && !settings.contactEmail) continue;
    const page = content.pages[id];
    const { html } = renderFragment(page.body, { where: `pages/${id}.html`, values, shown });
    const path = PAGE_PATHS[id];
    put(
      path.endsWith("/") ? `${path.slice(1)}index.html` : path.slice(1),
      frame({
        title: page.title,
        description: page.description,
        path,
        main: `<article class="info-page">\n${html}</article>`,
      }),
    );
  }

  // The help: each version's topics rendered once, with its search index.
  interface Docs {
    readonly product: Product;
    readonly version: DocsVersion;
    readonly rendered: ReadonlyMap<string, Rendered>;
    readonly index: string;
  }
  const docs = (product: Product, version: DocsVersion): Docs => {
    const where = `${product.id}/${version.version}`;
    const ids = new Set(version.topics.map((t) => t.id));
    const images = new Map<string, { url: string; width: number; height: number }>();
    for (const [name, bytes] of version.images) {
      const { width, height } = pngSize(bytes);
      images.set(name, {
        url: asset(`${product.id}-${name}`, bytes),
        width: Math.round(width / SHOT_SCALE),
        height: Math.round(height / SHOT_SCALE),
      });
    }
    const rendered = new Map<string, Rendered>();
    for (const topic of version.topics) {
      rendered.set(
        topic.id,
        renderFragment(topic.body, {
          where: `${where}/${topic.id}.html`,
          values,
          shown,
          // Every topic page is one folder below its version's contents page.
          topicUrl: (id) => (ids.has(id) ? `../${id}/` : null),
          image: (name) => images.get(name) ?? null,
        }),
      );
    }
    const index: SearchIndex = {
      product: product.id,
      name: product.name,
      version: version.version,
      topics: version.topics.map((topic) => {
        const r = rendered.get(topic.id) as Rendered;
        return {
          id: topic.id,
          title: topic.title,
          summary: topic.summary,
          keywords: topic.keywords,
          headings: r.headings,
          text: r.text,
        };
      }),
    };
    return {
      product,
      version,
      rendered,
      index: asset(`search-${product.id}-${version.version}.json`, JSON.stringify(index)),
    };
  };

  const searchForm = (scopes: readonly { index: string; base: string }[], page: boolean) =>
    `<form class="help-search" role="search" action="/about/" hidden data-search="${escapeHtml(
      JSON.stringify(scopes),
    )}" data-strings="${escapeHtml(
      JSON.stringify({
        none: strings.help.noResults,
        results: strings.help.results,
        failed: strings.help.searchFailed,
        version: strings.help.version,
      }),
    )}"${page ? " data-page" : ""}>
<label for="help-q">${escapeHtml(strings.help.search)}</label>
<input type="search" id="help-q" name="q" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(strings.help.searchHint)}">
<p class="search-status" role="status"></p>
<ol class="search-results"></ol>
</form>`;

  const contents = (d: Docs, base: string, current: string | null) =>
    d.version.groups
      .map(
        (group) => `<h3>${escapeHtml(group.title)}</h3>
<ul>
${group.topics
  .map(
    (t) =>
      `<li><a href="${base}${t.id}/"${t.id === current ? ' aria-current="page"' : ""}>${escapeHtml(t.title)}</a>${
        current === null ? `<span class="summary">${escapeHtml(t.summary)}</span>` : ""
      }</li>`,
  )
  .join("\n")}
</ul>`,
      )
      .join("\n");

  /** The other versions of this page, and the notice on an old one. */
  const versions = (d: Docs, topic: Topic | null) => {
    const { product, version } = d;
    const newest = latest(product);
    const links = [...product.versions].reverse().map((v) => {
      const label = `${v.version}${v === newest ? ` (${strings.help.latest})` : ""}`;
      const there = topic && v.topics.some((t) => t.id === topic.id) ? `${topic.id}/` : "";
      return v === version
        ? `<li><a href="/about/${product.id}/${v.version}/${there}" aria-current="true">${escapeHtml(label)}</a></li>`
        : `<li><a href="/about/${product.id}/${v.version}/${there}">${escapeHtml(label)}</a></li>`;
    });
    return `<nav class="help-versions" aria-label="${escapeHtml(strings.help.versions)}"><span>${escapeHtml(
      strings.help.versions,
    )}</span><ul>${links.join("")}</ul></nav>`;
  };
  const outdated = (d: Docs, topic: Topic | null) => {
    const newest = latest(d.product);
    if (newest === d.version) return "";
    const there = topic && newest.topics.some((t) => t.id === topic.id) ? `${topic.id}/` : "";
    return `<p class="help-outdated" role="note">${escapeHtml(
      strings.help.outdated
        .replace("{product}", d.product.name)
        .replace("{version}", d.version.version),
    )} <a href="/about/${d.product.id}/${there}">${escapeHtml(
      strings.help.seeLatest.replace("{version}", newest.version),
    )}</a></p>`;
  };

  /** One version's pages under `base`: its contents page and a page for each topic. */
  const helpPages = (d: Docs, base: string, alias: boolean) => {
    const { product, version } = d;
    const isLatest = latest(product) === version;
    const name = `${product.name} ${version.version}`;
    const scopes = [{ index: d.index, base }];
    const common = {
      help: true,
      noindex: !isLatest,
    };
    put(
      `${base.slice(1)}index.html`,
      frame({
        ...common,
        title: `${product.name} ${strings.help.title.toLowerCase()}${alias ? "" : ` (${version.version})`}`,
        description: product.summary,
        path: base,
        ...(isLatest ? { canonical: `/about/${product.id}/` } : {}),
        main: `<div class="help help-contents">
${searchForm(scopes, false)}
<article>
${outdated(d, null)}<p class="crumbs"><a href="/about/">${escapeHtml(strings.help.title)}</a></p>
<h1>${escapeHtml(product.name)} <span class="version">${escapeHtml(strings.help.version.replace("{version}", version.version))}</span></h1>
<p>${escapeHtml(product.summary)}</p>
<div class="toc">
${contents(d, base, null)}
</div>
${versions(d, null)}
</article>
</div>`,
      }),
    );
    version.topics.forEach((topic, i) => {
      const rendered = d.rendered.get(topic.id) as Rendered;
      const previous = version.topics[i - 1];
      const next = version.topics[i + 1];
      put(
        `${base.slice(1)}${topic.id}/index.html`,
        frame({
          ...common,
          title: `${topic.title} · ${name}`,
          description: topic.summary,
          path: `${base}${topic.id}/`,
          ...(isLatest ? { canonical: `/about/${product.id}/${topic.id}/` } : {}),
          main: `<div class="help">
${searchForm(scopes, false)}
<article class="help-topic">
${outdated(d, topic)}<p class="crumbs"><a href="/about/">${escapeHtml(strings.help.title)}</a> › <a href="${base}">${escapeHtml(name)}</a></p>
<h1>${escapeHtml(topic.title)}</h1>
${rendered.html}
<nav class="pager" aria-label="${escapeHtml(strings.help.allTopics)}">
${previous ? `<a rel="prev" href="${base}${previous.id}/"><span>${escapeHtml(strings.help.previous)}</span> ${escapeHtml(previous.title)}</a>` : "<span></span>"}
${next ? `<a rel="next" href="${base}${next.id}/"><span>${escapeHtml(strings.help.next)}</span> ${escapeHtml(next.title)}</a>` : "<span></span>"}
</nav>
${versions(d, topic)}
</article>
<nav class="help-nav" aria-label="${escapeHtml(strings.help.contents)}">
<p class="help-product"><a href="${base}">${escapeHtml(name)}</a></p>
${contents(d, base, topic.id)}
</nav>
</div>`,
        }),
      );
    });
  };

  const current: Docs[] = [];
  for (const product of content.products) {
    for (const version of product.versions) {
      const d = docs(product, version);
      helpPages(d, `/about/${product.id}/${version.version}/`, false);
      if (version === latest(product)) {
        helpPages(d, `/about/${product.id}/`, true);
        current.push(d);
      }
    }
  }

  // The help's front page: every product's current contents, and a search across them.
  put(
    "about/index.html",
    frame({
      help: true,
      title: strings.help.title,
      description: strings.help.description,
      path: "/about/",
      main: `<div class="help help-contents">
${searchForm(
  current.map((d) => ({ index: d.index, base: `/about/${d.product.id}/` })),
  true,
)}
<article>
<h1>${escapeHtml(strings.help.title)}</h1>
<p>${escapeHtml(strings.help.intro)}</p>
${current
  .map(
    (d) => `<section class="toc" aria-labelledby="toc-${d.product.id}">
<h2 id="toc-${d.product.id}"><a href="/about/${d.product.id}/">${escapeHtml(d.product.name)}</a> <span class="version">${escapeHtml(
      strings.help.version.replace("{version}", d.version.version),
    )}</span></h2>
<p>${escapeHtml(d.product.summary)}</p>
${contents(d, `/about/${d.product.id}/`, null)}
</section>`,
  )
  .join("\n")}
</article>
</div>`,
    }),
  );

  // For search engines: the current pages only.
  const listed = [...files.keys()]
    .filter((path) => path.endsWith("index.html") && !/^about\/[a-z-]+\/\d+\.\d+\//.test(path))
    .map((path) => `/${path.slice(0, -"index.html".length)}`)
    .sort();
  put(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${listed.map((path) => `<url><loc>${escapeHtml(settings.data + path)}</loc></url>`).join("\n")}
</urlset>
`,
  );
  put(
    "robots.txt",
    `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${settings.data}/sitemap.xml\n`,
  );
  return files;
}
