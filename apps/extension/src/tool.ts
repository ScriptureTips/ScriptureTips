import { ext } from "./browser.ts";
import { GENERATOR_HTML, mountGenerator, parseHtml } from "./generator.ts";
import { byId } from "./pages.ts";
import { loadSettings } from "./store.ts";

/** The link generator as a page of its own (vision §3.6); the form is `generator.ts`. */
async function main() {
  const settings = await loadSettings();
  byId<HTMLElement>("generator").replaceChildren(parseHtml(GENERATOR_HTML));
  mountGenerator(document, settings, () => void ext.runtime.openOptionsPage());
}

void main();
