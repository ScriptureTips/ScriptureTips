import { mountAll, mountPairs, mountSearch } from "@scripturetips/search/embed";

/**
 * The search half of the plugin, loaded only when a page asks for a search (`ScriptureTips.search`
 * or a `<div class="st-search">`): the core search elements, so pages that only link references
 * stay small. `main.ts` loads this file from the same place as itself and calls what it left on
 * `window.ScriptureTipsEmbed`.
 */
(window as unknown as { ScriptureTipsEmbed: unknown }).ScriptureTipsEmbed = {
  mountAll,
  mountSearch,
};
