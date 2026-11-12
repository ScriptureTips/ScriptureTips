import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import { build } from "esbuild";
import { type Content, loadContent } from "./src/content.ts";
import { type Settings, settingsFrom } from "./src/settings.ts";
import { type Files, generate } from "./src/site.ts";

/**
 * Builds the scripture.tips site (vision §7.2) into `dist/`: plain files, each text file with a
 * Brotli and a gzip copy beside it, served by Caddy under the rules in `site.caddy`.
 *
 *   ./toolbox pnpm --filter @scripturetips/widget build   (the plugin's script, served here too)
 *   ./toolbox pnpm --filter @scripturetips/site build
 */
const here = import.meta.dirname;
export const CONTENT = join(here, "content");
/** The only language published so far. Others get a folder of their own beside it. */
export const LOCALE = "en-US";
const BRAND = join(here, "../web/public/brand");
const WIDGET = join(here, "../widget/dist/scripturetips.js");

/** The help search's script, as one small file. */
export async function searchScript(): Promise<string> {
  const result = await build({
    entryPoints: [join(here, "src/client/search.ts")],
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2020",
    legalComments: "none",
    write: false,
    logLevel: "warning",
  });
  const [file] = result.outputFiles;
  if (!file) throw new Error("the search script wasn't built");
  return file.text;
}

/** Every file of the site, from the content in the repository. */
export async function site(
  settings: Settings,
  content?: Content,
): Promise<{ files: Files; content: Content }> {
  const loaded = content ?? (await loadContent(CONTENT, LOCALE));
  const files = generate(loaded, settings, {
    css: await readFile(join(here, "src/styles.css"), "utf8"),
    searchScript: await searchScript(),
    logo: await readFile(join(BRAND, "logo-48.png")),
    artwork: await readFile(join(BRAND, "clouds-and-birds.svg")),
  });
  return { files, content: loaded };
}

const COMPRESSED = new Set([".html", ".css", ".js", ".json", ".svg", ".xml", ".txt"]);
const brotli = promisify(brotliCompress);
const gz = promisify(gzip);

async function main() {
  const settings = settingsFrom(process.env);
  const { files } = await site(settings);
  // The website plugin's script (apps/widget), which site owners load from here.
  try {
    files.set("widget/scripturetips.js", await readFile(WIDGET));
  } catch {
    throw new Error(
      "apps/widget/dist/scripturetips.js is missing: run `pnpm --filter @scripturetips/widget build` first",
    );
  }

  // Emptied, not removed: the development stack's Caddy has this folder mounted.
  const out = join(here, "dist");
  await mkdir(out, { recursive: true });
  for (const entry of await readdir(out)) await rm(join(out, entry), { recursive: true });

  let bytes = 0;
  for (const [path, body] of files) {
    const file = join(out, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
    bytes += body.byteLength;
    if (COMPRESSED.has(extname(path))) {
      await writeFile(
        `${file}.br`,
        await brotli(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
      );
      await writeFile(`${file}.gz`, await gz(body, { level: 9 }));
    }
  }
  console.log(
    `site: ${files.size} files, ${(bytes / 1024).toFixed(0)} KB, reader ${settings.site}, data ${settings.data}`,
  );
}

if (process.argv[1] === import.meta.filename) await main();
