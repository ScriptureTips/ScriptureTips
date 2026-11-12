import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests of the scripture.tips site as the dev stack serves it (`./dev up` builds it;
 * `./dev site` builds it again), run in the toolbox: `pnpm --filter @scripturetips/site e2e`.
 * Inside the stack the name is an alias of the Caddy container, with the dev certificate.
 */
export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  use: {
    baseURL: "https://dev.scripture.tips",
    ignoreHTTPSErrors: true,
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
