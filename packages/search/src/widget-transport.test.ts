import { describe, expect, it } from "vitest";
import { widgetTransport } from "./transport.ts";

/** A fetch that records what it was asked and answers each address with `body`. */
function recorder(body: unknown) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("vision §3.14: the search widget's transport for other sites", () => {
  it("searches and suggests through the public widget routes with no credentials", async () => {
    const { calls, fetchImpl } = recorder({ results: [], more: false, suggestions: [] });
    const t = widgetTransport("https://scripture.tips/api/", fetchImpl);
    const signal = new AbortController().signal;
    await t.search("know", { translations: ["kjv"], limit: 5 }, signal);
    await t.suggest("Joe", {}, signal);
    expect(calls.map((c) => c.url)).toEqual([
      "https://scripture.tips/api/widget/search?q=know&translations=kjv&limit=5",
      "https://scripture.tips/api/widget/suggest?q=Joe",
    ]);
    expect(calls.every((c) => c.init?.credentials === "omit")).toBe(true);
  });

  it("fetches a picked passage by its OSIS reference in the translation's own numbering", async () => {
    const { calls, fetchImpl } = recorder({
      translation: { direction: "rtl" },
      verses: [{ number: "27", text: "And ye shall know." }],
    });
    const t = widgetTransport("https://scripture.tips/api", fetchImpl);
    const text = await t.passage?.("kjv", "Joel 2:27", new AbortController().signal, "Joel.2.27");
    expect(text).toEqual({
      direction: "rtl",
      verses: [{ number: "27", text: "And ye shall know." }],
    });
    expect(calls[0]?.url).toBe(
      "https://scripture.tips/api/widget/passage?translation=kjv&ref=Joel.2.27&scheme=own",
    );
  });

  it("can't fetch a passage it has no reference for", async () => {
    const t = widgetTransport("https://scripture.tips/api", recorder({}).fetchImpl);
    await expect(t.passage?.("kjv", "Joel 2:27", new AbortController().signal)).rejects.toThrow();
  });
});
