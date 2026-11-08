import type { SearchResponse, SearchScope, Suggestion, Transport } from "./types.ts";
import { passageVerse } from "./verses.ts";

/** The query string for a search: the words, then the scope. */
export function queryString(query: string, scope: SearchScope): string {
  const params = new URLSearchParams({ q: query });
  if (scope.kinds && scope.kinds.length > 0) params.set("kinds", scope.kinds.join(","));
  if (scope.translations && scope.translations.length > 0)
    params.set("translations", scope.translations.join(","));
  if (scope.limit !== undefined) params.set("limit", String(scope.limit));
  if (scope.previewLength !== undefined) params.set("previewLength", String(scope.previewLength));
  return params.toString();
}

/**
 * Asks the ScriptureTips API (apps/api `GET /api/search` and `/api/search/suggest`, and a
 * passage's text from `GET /api/translations/{id}/passages`).
 */
export function fetchTransport(
  endpoint: string,
  fetchImpl: typeof fetch = fetch,
  passagesEndpoint = "/api/translations",
): Transport {
  const get = async <T>(url: string, signal: AbortSignal): Promise<T> => {
    const res = await fetchImpl(url, { signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`The search failed (${res.status}).`);
    return (await res.json()) as T;
  };
  return {
    search: (query, scope, signal) =>
      get<SearchResponse>(`${endpoint}?${queryString(query, scope)}`, signal),
    suggest: async (query, scope, signal) =>
      (
        await get<{ suggestions: Suggestion[] }>(
          `${endpoint}/suggest?${queryString(query, scope)}`,
          signal,
        )
      ).suggestions,
    passage: async (translation, reference, signal) => {
      const body = await get<{
        translation: { direction: "ltr" | "rtl" };
        passages: { verses: Parameters<typeof passageVerse>[0][] }[];
      }>(
        `${passagesEndpoint}/${encodeURIComponent(translation)}/passages?ref=${encodeURIComponent(reference)}`,
        signal,
      );
      return {
        direction: body.translation.direction,
        verses: body.passages.flatMap((p) => p.verses.map(passageVerse)),
      };
    },
  };
}
