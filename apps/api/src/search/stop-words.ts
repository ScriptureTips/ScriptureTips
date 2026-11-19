/**
 * The words a plain search query leaves out: ScriptureTips's own short list, not the database's.
 * They're in the search index like any other word, so a "quoted phrase" matches word for word
 * ("money is the root of all evil"); they're only dropped from a query typed without quotes, where
 * they would have to be in every verse found and say nothing about which.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set(["the", "a", "of", "and"]);

/** A word as a query holds it: lower case, without punctuation or a leading `-` around it. */
const bare = (token: string): string =>
  token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();

export const isStopWord = (word: string): boolean => STOP_WORDS.has(bare(word));

/**
 * The query as the database should read it: the stop words left out of everything typed outside
 * double quotes, and each "quoted phrase" kept exactly as written. (`-the` goes too: leaving
 * nothing out of a verse says nothing.)
 */
export function withoutStopWords(query: string): string {
  const parts = query.split(/(["“][^"”“]*["”])/u);
  return parts
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .split(/\s+/)
            .filter((token) => token !== "" && !isStopWord(token))
            .join(" "),
    )
    .filter((part) => part !== "")
    .join(" ");
}
