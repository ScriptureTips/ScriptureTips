import { describe, expect, it } from "vitest";
import { ClientError, createClient } from "./client.ts";

/** A fetch that answers from a table, counting what it was asked and how. */
function fake(answers: Record<string, { status?: number; body: unknown }>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const found = answers[url];
    if (!found) throw new Error(`unexpected ${url}`);
    return new Response(JSON.stringify(found.body), { status: found.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("vision §3.6: the plugin's reading of the public API", () => {
  it("asks for translations and passages with no credentials, and keeps the answers", async () => {
    const { fetchImpl, calls } = fake({
      "https://st.test/api/widget/translations": { body: { translations: [{ id: "kjv" }] } },
      "https://st.test/api/widget/passage?translation=kjv&ref=John.3.16&scheme=kjv": {
        body: { label: "John 3:16" },
      },
    });
    const client = createClient({ api: "https://st.test/api/", scheme: "kjv", fetch: fetchImpl });
    expect(await client.translations()).toEqual([{ id: "kjv" }]);
    expect(await client.translations()).toEqual([{ id: "kjv" }]);
    expect(await client.passage("kjv", "John.3.16")).toMatchObject({ label: "John 3:16" });
    await client.passage("kjv", "John.3.16");
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.init?.credentials === "omit")).toBe(true);
    // Nothing but the address: no custom headers, so the browser makes no preflight request.
    expect(calls.every((c) => c.init?.headers === undefined)).toBe(true);
  });

  it("reports the API's error code, and tries again after a failure", async () => {
    const answers: Record<string, { status?: number; body: unknown }> = {
      "https://st.test/api/widget/passage?translation=heb&ref=Joel.2.28&scheme=hebrew": {
        status: 404,
        body: { code: "not-in-canon" },
      },
    };
    const { fetchImpl, calls } = fake(answers);
    const client = createClient({ api: "https://st.test/api", scheme: "hebrew", fetch: fetchImpl });
    await expect(client.passage("heb", "Joel.2.28")).rejects.toMatchObject({
      code: "not-in-canon",
      status: 404,
    });
    await expect(client.passage("heb", "Joel.2.28")).rejects.toBeInstanceOf(ClientError);
    expect(calls).toHaveLength(2);
  });
});
