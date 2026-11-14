import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import pkg from "./package.json" with { type: "json" };
import { type Browser, manifest } from "./src/manifest.ts";

const here = import.meta.dirname;
const ENTRIES = ["background", "content", "popup", "options", "tool"];
export const BROWSERS: readonly Browser[] = ["chrome", "firefox"];
const SCHEMES: Record<Browser, string> = { chrome: "chrome-extension", firefox: "moz-extension" };

/**
 * The ScriptureTips site the extension talks to: `ST_SITE` at build time (the development stack
 * if not given). A reader can point it at another installation in the settings.
 */
const SITE = process.env["ST_SITE"] ?? "https://dev.scripturetips.com";

/**
 * The data server passages are read from (vision §7.2): `ST_DATA` at build time (the development
 * stack's data server if not given).
 */
const DATA = process.env["ST_DATA"] ?? "https://dev.scripture.tips";

/**
 * A path on the data server whose pages the extension treats like any other site's: the demo
 * pages (apps/extension/demo), written to try it on. `ST_DEMO` at build time; by default only
 * the development stack's data server has them, so a release build has none.
 */
export const demoPath = (data: string, given?: string): string =>
  given ?? (data === "https://dev.scripture.tips" ? "/demo/" : "");
const DEMO = demoPath(DATA, process.env["ST_DEMO"]);

/** Bundles the extension's scripts (each one file, no imports at run time). */
export async function bundle(outdir: string | null) {
  return build({
    entryPoints: ENTRIES.map((e) => join(here, `src/${e}.ts`)),
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2022",
    legalComments: "none",
    metafile: true,
    write: outdir !== null,
    outdir: outdir ?? join(here, "dist/check"),
    define: {
      __ST_SITE__: JSON.stringify(SITE),
      __ST_DATA__: JSON.stringify(DATA),
      __ST_DEMO__: JSON.stringify(DEMO),
    },
    logLevel: "warning",
  });
}

/** Writes `dist/chrome` and `dist/firefox`, each ready to load unpacked or to pack. */
async function main() {
  for (const browser of BROWSERS) {
    const out = join(here, "dist", browser);
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
    await cp(join(here, "static"), out, { recursive: true });
    // The link mark's address: each browser has its own scheme for the extension's files.
    const css = join(out, "content.css");
    await writeFile(css, (await readFile(css, "utf8")).replaceAll("__SCHEME__", SCHEMES[browser]));
    const result = await bundle(out);
    await writeFile(
      join(out, "manifest.json"),
      `${JSON.stringify(manifest(browser, pkg.version), null, 2)}\n`,
    );
    const bytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
    console.log(
      `${browser}: ${(bytes / 1024).toFixed(1)} KB of script, reader ${SITE}, data ${DATA}`,
    );
  }
}

if (process.argv[1] === import.meta.filename) await main();
