import type { Scheme, WidgetPassage, WidgetTranslation } from "./types.ts";

/** The API's answer was an error: its code (`unknown-translation`, `not-in-canon` …). */
export class ClientError extends Error {
  override readonly name = "ClientError";
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(`The ScriptureTips API answered ${status} (${code}).`);
    this.code = code;
    this.status = status;
  }
}

export interface Client {
  translations(): Promise<readonly WidgetTranslation[]>;
  passage(translation: string, osis: string): Promise<WidgetPassage>;
}

/**
 * The plugin's view of the public API (apps/api `/api/widget`): the translations it may show
 * and a passage's words. Plain GETs with no credentials and no custom headers, so no cookie goes
 * to the API and no preflight is made. Answers are kept for the page's life; a failure isn't kept,
 * so asking again tries again.
 */
export function createClient(options: {
  api: string;
  scheme: Scheme;
  fetch?: typeof fetch;
}): Client {
  const api = options.api.replace(/\/$/, "");
  const load = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const kept = new Map<string, Promise<unknown>>();

  const get = <T>(path: string): Promise<T> => {
    let found = kept.get(path) as Promise<T> | undefined;
    if (!found) {
      found = (async () => {
        const res = await load(`${api}${path}`, { credentials: "omit" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { code?: unknown };
          throw new ClientError(
            typeof body.code === "string" ? body.code : "unavailable",
            res.status,
          );
        }
        return (await res.json()) as T;
      })();
      kept.set(path, found);
      found.catch(() => kept.delete(path));
    }
    return found;
  };

  return {
    translations: async () =>
      (await get<{ translations: WidgetTranslation[] }>("/widget/translations")).translations,
    passage: (translation, osis) =>
      get<WidgetPassage>(
        `/widget/passage?${new URLSearchParams({ translation, ref: osis, scheme: options.scheme })}`,
      ),
  };
}
