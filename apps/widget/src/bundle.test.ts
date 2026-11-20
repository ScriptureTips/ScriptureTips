import { describe, expect, it } from "vitest";
import { bundle } from "../build.ts";

/** The most the plugin script may weigh, minified (testing.md: performance budgets). */
const BUDGET_BYTES = 45 * 1024;
/** The search code, loaded only when a page asks for a search. */
const SEARCH_BUDGET_BYTES = 90 * 1024;

describe("vision §3.6: the website plugin's script", () => {
  it("stays small and leaves the versification tables and the search elements out", async () => {
    const { metafile } = await bundle(false);
    const main = metafile.outputs["dist/scripturetips.js"];
    if (!main) throw new Error("no main script");
    const inputs = Object.keys(main.inputs);
    // The tables convert numbering on the server; the page only finds references.
    expect(inputs.filter((i) => i.includes("versification"))).toEqual([]);
    // Nothing of the server's or the web app's, and the search elements come only when asked for.
    expect(
      inputs.filter((i) =>
        /apps\/(api|web)|node_modules\/(lit|react|next)|packages\/search/.test(i),
      ),
    ).toEqual([]);
    expect(main.bytes).toBeLessThan(BUDGET_BYTES);
  });

  it("keeps the search code in its own file, within its budget", async () => {
    const { metafile } = await bundle(false);
    const search = metafile.outputs["dist/scripturetips-search.js"];
    if (!search) throw new Error("no search script");
    expect(
      Object.keys(search.inputs).filter((i) =>
        /apps\/(api|web)|node_modules\/(react|next)/.test(i),
      ),
    ).toEqual([]);
    expect(search.bytes).toBeLessThan(SEARCH_BUDGET_BYTES);
  });
});
