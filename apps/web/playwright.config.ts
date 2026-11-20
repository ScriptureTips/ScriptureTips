import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the running dev stack (`./dev up`), run in the toolbox. The browser
 * opens the app as https://dev.scripturetips.com, which inside the stack is an alias of the
 * Caddy container, with the dev stack's self-signed certificate (accepted here). Screenshots go
 * to test-results/ (not committed).
 */
const baseURL = "https://dev.scripturetips.com";

/** Gecko, for the few checks that differ by engine. Opt in with PW_FIREFOX=1 and --project=firefox. */
const firefox = process.env["PW_FIREFOX"]
  ? [
      {
        name: "firefox",
        testMatch: /engines\.spec\.ts$/,
        use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 900 } },
      },
    ]
  : [];

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
    ...firefox,
  ],
});
