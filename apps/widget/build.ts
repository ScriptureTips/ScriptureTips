import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";

/**
 * Builds the website plugin: one minified script that declares `window.ScriptureTips`, in
 * `dist/` (which the scripture.tips site's build takes, apps/site), and a copy in the web app's
 * `public/widget/`, where an app instance serves it. The bundle must
 * stay small (the versification tables, in particular, stay out: see `bundle.test.ts`).
 */
/**
 * The reader its links open (vision §7.2): `ST_SITE` at build time, as the extension's build reads
 * it (the development stack if not given; `https://scripturetips.com` in production, or a
 * satellite's own address). The script is served by the data server, which has no reader.
 */
const SITE = process.env["ST_SITE"] ?? "https://dev.scripturetips.com";

export async function bundle(write: boolean) {
  return build({
    entryPoints: [join(import.meta.dirname, "src/main.ts")],
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2020",
    legalComments: "none",
    metafile: true,
    write,
    outfile: join(import.meta.dirname, "dist/scripturetips.js"),
    define: { __ST_SITE__: JSON.stringify(SITE) },
    logLevel: "warning",
  });
}

if (process.argv[1] === import.meta.filename) {
  const result = await bundle(true);
  const out = join(import.meta.dirname, "dist/scripturetips.js");
  const served = join(import.meta.dirname, "../web/public/widget");
  await mkdir(served, { recursive: true });
  await copyFile(out, join(served, "scripturetips.js"));
  const bytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
  console.log(`scripturetips.js: ${(bytes / 1024).toFixed(1)} KB, reader ${SITE}`);
}
