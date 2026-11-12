import { attribute, escapeHtml, slug, textOf } from "./html.ts";

/**
 * Content is written as HTML fragments with a few shorthands, filled in here:
 *
 * - `{{name}}`: a value from the build's settings, and `{{#if name}}…{{else}}…{{/if}}` (not
 *   nested) for text that depends on whether one is set.
 * - `<a href="topic:pin">`: another topic of the same product and version (`#heading` allowed).
 * - `<img src="images/tooltip.png" alt="…">`: a screenshot from the version's `images/` folder.
 *   The build gives it its address, size and lazy loading; the `alt` text is required.
 * - `<h2>` and `<h3>` get an `id` from their words, so a help link can name a heading.
 */
export interface FragmentContext {
  /** Where the fragment is from, for error messages. */
  readonly where: string;
  readonly values: Readonly<Record<string, string | null>>;
  /** The address of a topic from this fragment's page, or null if there's no such topic. */
  topicUrl?(id: string): string | null;
  image?(name: string): { url: string; width: number; height: number } | null;
  /** Rewrites the words a reader sees (not the attributes, so links keep working). */
  shown?(text: string): string;
}

export interface Rendered {
  readonly html: string;
  readonly headings: readonly (readonly [id: string, text: string])[];
  /** The fragment's words, for the search index. */
  readonly text: string;
}

export function renderFragment(source: string, context: FragmentContext): Rendered {
  const { where, values } = context;
  const value = (name: string): string | null => {
    if (!(name in values)) throw new Error(`${where}: {{${name}}} isn't a setting`);
    return values[name] ?? null;
  };

  let html = source.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, name: string, yes: string, no: string | undefined) => (value(name) ? yes : (no ?? "")),
  );
  html = html.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const v = value(name);
    if (v === null) throw new Error(`${where}: {{${name}}} isn't set; put it inside {{#if}}`);
    return escapeHtml(v);
  });
  if (/\{\{|\}\}/.test(html)) throw new Error(`${where}: an unfinished {{…}}`);
  const shown = context.shown;
  if (shown) html = html.replace(/>([^<>]+)</g, (_, text: string) => `>${shown(text)}<`);

  html = html.replace(/href="topic:([^"#]*)(#[^"]*)?"/g, (_, id: string, hash = "") => {
    const url = context.topicUrl?.(id) ?? null;
    if (url === null) throw new Error(`${where}: links to the topic "${id}", which doesn't exist`);
    return `href="${url}${hash}"`;
  });

  html = html.replace(/<img\b[^>]*>/g, (tag) => {
    const src = attribute(tag, "src");
    const alt = attribute(tag, "alt");
    if (!src?.startsWith("images/")) throw new Error(`${where}: an image must be in images/`);
    if (!alt) throw new Error(`${where}: ${src} needs alt text that says what it shows`);
    const image = context.image?.(src.slice("images/".length)) ?? null;
    if (!image) throw new Error(`${where}: ${src} doesn't exist`);
    return `<img src="${image.url}" width="${image.width}" height="${image.height}" alt="${alt}" loading="lazy" decoding="async">`;
  });

  const headings: [string, string][] = [];
  const taken = new Set<string>();
  html = html.replace(
    /<(h[23])(\s[^>]*)?>([\s\S]*?)<\/\1>/g,
    (_, tag: string, attrs = "", inner) => {
      const words = textOf(inner as string);
      let id = attribute(attrs as string, "id") ?? slug(words);
      if (id === "") throw new Error(`${where}: a heading with no words`);
      for (let n = 2; taken.has(id); n++) id = `${slug(words)}-${n}`;
      taken.add(id);
      headings.push([id, words]);
      const rest = (attrs as string).replace(/\sid="[^"]*"/, "");
      return `<${tag} id="${id}"${rest}>${inner}</${tag}>`;
    },
  );

  return { html, headings, text: textOf(html) };
}
