import { defineConfig } from "@playwright/test";

/**
 * Takes the help's screenshots (`shots/`), from the real extension and website plugin against
 * the running dev stack, and writes them into the content folder of each product's current
 * version. Run in the toolbox after building the extension and the widget (AGENTS.md).
 */
export default defineConfig({
  testDir: "shots",
  testMatch: /.*\.shots\.ts$/,
  outputDir: "test-results",
  workers: 1,
  use: { ignoreHTTPSErrors: true },
});
