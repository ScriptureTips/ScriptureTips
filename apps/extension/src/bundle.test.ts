import { describe, expect, it } from "vitest";
import { bundle, demoPath } from "../build.ts";

/** The most the content script may weigh, minified: it runs in every page and frame. */
const CONTENT_BUDGET = 50 * 1024;

describe("vision §3.6: the browser extension's scripts", () => {
  it("keep the content script small and the versification tables out", async () => {
    const { metafile } = await bundle(null);
    const inputs = Object.keys(metafile.inputs);
    expect(inputs.filter((i) => i.includes("versification"))).toEqual([]);
    expect(inputs.filter((i) => /apps\/(api|web)|node_modules\/(lit|react|next)/.test(i))).toEqual(
      [],
    );
    const content = Object.entries(metafile.outputs).find(([path]) => path.endsWith("content.js"));
    expect(content?.[1].bytes).toBeLessThan(CONTENT_BUDGET);
  });

  it("have the demo pages' exception only in a build for the development stack", () => {
    expect(demoPath("https://dev.scripture.tips")).toBe("/demo/");
    // A release build, for the real data server, has none.
    expect(demoPath("https://scripture.tips")).toBe("");
    expect(demoPath("https://data.example.org")).toBe("");
    // Unless asked for.
    expect(demoPath("https://scripture.tips", "/try/")).toBe("/try/");
  });
});
