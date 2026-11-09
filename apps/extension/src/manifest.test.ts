import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { manifest } from "./manifest.ts";

/** What v1.0.3 (the version on the Chrome Web Store) asked for. */
const V103 = { version: "1.0.3", permissions: ["storage", "tabs", "activeTab"] };

const newer = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++)
    if ((x?.[i] ?? 0) !== (y?.[i] ?? 0)) return (x?.[i] ?? 0) > (y?.[i] ?? 0);
  return false;
};

describe("vision §3.6: the update to v1.0.3 (same Web Store listing)", () => {
  for (const browser of ["chrome", "firefox"] as const) {
    const m = manifest(browser, pkg.version);
    it(`asks ${browser} for no permission v1.0.3 didn't have, so the update isn't turned off`, () => {
      for (const p of m.permissions) expect(V103.permissions).toContain(p);
      expect(m).not.toHaveProperty("host_permissions");
      expect(m.content_scripts[0]?.matches).toEqual(["<all_urls>"]);
    });
    it(`marks ${browser}'s links, opening only the mark's image to pages`, () => {
      expect(m.content_scripts[0]?.css).toEqual(["content.css"]);
      expect(m.web_accessible_resources).toEqual([
        { resources: ["mark.png"], matches: ["*://*/*"] },
      ]);
    });
  }

  it("is a later version than v1.0.3", () => {
    expect(newer(pkg.version, V103.version)).toBe(true);
  });

  it("runs a service worker in Chrome and an event page in Firefox, with Firefox's ID", () => {
    expect(manifest("chrome", "2.0.0").background).toEqual({ service_worker: "background.js" });
    const firefox = manifest("firefox", "2.0.0");
    expect(firefox.background).toEqual({ scripts: ["background.js"] });
    expect(firefox.browser_specific_settings?.gecko.id).toMatch(
      /^[a-zA-Z0-9-._]*@[a-zA-Z0-9-._]+$/,
    );
  });
});
