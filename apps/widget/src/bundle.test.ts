import { describe, expect, it } from "vitest";
import { bundle } from "../build.ts";

/** The most the plugin script may weigh, minified (testing.md: performance budgets). */
const BUDGET_BYTES = 45 * 1024;

describe("vision §3.6: the website plugin's script", () => {
  it("stays small and leaves the versification tables out", async () => {
    const { metafile } = await bundle(false);
    const inputs = Object.keys(metafile.inputs);
    // The tables convert numbering on the server; the page only finds references.
    expect(inputs.filter((i) => i.includes("versification"))).toEqual([]);
    // Nothing of the server's or the web app's, either.
    expect(inputs.filter((i) => /apps\/(api|web)|node_modules\/(lit|react|next)/.test(i))).toEqual(
      [],
    );
    const bytes = Object.values(metafile.outputs).reduce((n, o) => n + o.bytes, 0);
    expect(bytes).toBeLessThan(BUDGET_BYTES);
  });
});
