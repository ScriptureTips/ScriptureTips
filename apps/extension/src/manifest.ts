/** The browsers the extension is built for, each with its own manifest from this one source. */
export type Browser = "chrome" | "firefox";

/**
 * The extension's ID on Firefox (required for Manifest V3 there). Not yet claimed on
 * addons.mozilla.org: sources.md §8 item 33.
 */
export const GECKO_ID = "@scripturetips";

/**
 * The manifest (Manifest V3). The permissions are kept to those v1.0.3 had, or fewer: an update
 * that asks for more is turned off by Chrome until each user approves it again. Links are made in
 * every page and frame (as v1.0.3 did), except Google's, which v1.0.3 left alone too.
 */
export function manifest(browser: Browser, version: string) {
  return {
    manifest_version: 3,
    default_locale: "en",
    name: "__MSG_appName__",
    description: "__MSG_appDesc__",
    version,
    icons: { "16": "icons/icon-16.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" },
    action: { default_popup: "popup.html", default_title: "__MSG_appName__" },
    options_page: "options.html",
    permissions: ["storage", "activeTab"],
    // Chrome runs a service worker; Firefox doesn't support one and runs the same script as an
    // event page.
    background:
      browser === "chrome" ? { service_worker: "background.js" } : { scripts: ["background.js"] },
    content_scripts: [
      {
        matches: ["<all_urls>"],
        exclude_globs: ["*://*google.com/*"],
        js: ["content.js"],
        all_frames: true,
        run_at: "document_idle",
      },
    ],
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: GECKO_ID,
              // Firefox's own consent for data transmission (below) starts with 140.
              strict_min_version: "140.0",
              // The passages asked for come from the page's text, sent to ScriptureTips on hover
              // or tap: Mozilla counts that as website content (sources.md §8 item 33).
              data_collection_permissions: { required: ["websiteContent"] },
            },
          },
        }
      : {}),
  };
}
