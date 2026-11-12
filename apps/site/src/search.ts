/**
 * The help's search, run in the reader's browser over an index the build writes: nothing a
 * reader types is sent anywhere. Pure, so the build's tests and the page's script share it.
 */

export interface IndexedTopic {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly keywords: readonly string[];
  /** The topic's headings: their address fragment and words. */
  readonly headings: readonly (readonly [id: string, text: string])[];
  /** The topic's words. */
  readonly text: string;
}

/** One product version's topics. */
export interface SearchIndex {
  readonly product: string;
  readonly name: string;
  readonly version: string;
  readonly topics: readonly IndexedTopic[];
}

export interface Hit {
  readonly index: SearchIndex;
  readonly topic: IndexedTopic;
  readonly score: number;
  /** The heading the words were found in, when the title didn't have them. */
  readonly heading: readonly [id: string, text: string] | null;
  /** Some of the topic's words around the first match. */
  readonly snippet: string;
}

/** The words of a text, lowercased, without accents. */
export function words(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

const has = (field: readonly string[], term: string) => field.some((w) => w.startsWith(term));

const WEIGHTS = { title: 8, keywords: 6, headings: 4, summary: 3, text: 1 } as const;

function snippetOf(text: string, terms: readonly string[], fallback: string): string {
  const lower = text.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const found = lower.search(new RegExp(`(^|[^\\p{L}\\p{N}])${term}`, "u"));
    if (found >= 0 && (at < 0 || found < at)) at = found;
  }
  if (at < 0) return fallback;
  const start = Math.max(0, text.lastIndexOf(" ", Math.max(0, at - 60)));
  const end = text.indexOf(" ", Math.min(text.length, at + 110));
  const piece = text.slice(start, end < 0 ? text.length : end).trim();
  return `${start > 0 ? "… " : ""}${piece}${end >= 0 ? " …" : ""}`;
}

/**
 * The topics that have every word of the query (each word matching the start of a word), best
 * first: a match in the title counts most, then keywords, headings, the summary and the text.
 */
export function search(indexes: readonly SearchIndex[], query: string, limit = 12): Hit[] {
  const terms = [...new Set(words(query))];
  if (terms.length === 0) return [];
  const hits: Hit[] = [];
  for (const index of indexes) {
    for (const topic of index.topics) {
      const fields = {
        title: words(topic.title),
        keywords: topic.keywords.flatMap(words),
        headings: topic.headings.flatMap(([, text]) => words(text)),
        summary: words(topic.summary),
        text: words(topic.text),
      };
      let score = 0;
      let all = true;
      for (const term of terms) {
        let best = 0;
        for (const [name, weight] of Object.entries(WEIGHTS)) {
          if (weight > best && has(fields[name as keyof typeof fields], term)) best = weight;
        }
        if (best === 0) {
          all = false;
          break;
        }
        score += best;
      }
      if (!all) continue;
      const inTitle = terms.some((term) => has(fields.title, term));
      const heading = inTitle
        ? null
        : (topic.headings.find(([, text]) => terms.some((term) => has(words(text), term))) ?? null);
      hits.push({
        index,
        topic,
        score,
        heading,
        snippet: snippetOf(topic.text, terms, topic.summary),
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
