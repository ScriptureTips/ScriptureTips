import {
  CHOICES_KEY,
  createScriptureLinks,
  SCRIPTURETIPS,
  type ScriptureLinks,
} from "@scripturetips/scripture-links";
import { ext } from "./browser.ts";
import { openGeneratorWindow } from "./generator-window.ts";
import { apiOf, leftAlone, outsideSite, type Settings, siteOf } from "./settings.ts";
import { type FetchReply, loadSettings, onSettingsChange } from "./store.ts";
import { DEFAULT_TEXT_SCALE, loadTextScale, onTextScaleChange } from "./text-scale.ts";

/** Who the extension's links are marked as made by: a site's own plugin leaves them alone. */
const OWNER = "extension";

/**
 * Passages are fetched by the background, so the page's own rules (its content security policy,
 * mixed content) don't stop them, and no request goes from the page itself.
 */
const viaBackground: typeof fetch = async (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const reply = (await ext.runtime.sendMessage({ type: "fetch", url })) as FetchReply | undefined;
  if (!reply || "error" in reply) throw new TypeError(reply?.error ?? "No answer.");
  return new Response(reply.body, {
    status: reply.status,
    headers: { "content-type": "application/json" },
  });
};

/**
 * The reader's translation choice for each link, kept in the extension's own storage, one entry
 * per site: never in the page's `localStorage`, which belongs to the site and which it could read.
 * Loaded before the links are made, written back as choices are made.
 */
async function choicesFor(host: string): Promise<Storage> {
  const key = `choices:${host}`;
  const got = await ext.storage.local.get(key);
  let value = typeof got[key] === "string" ? got[key] : null;
  const storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
    getItem: (k) => (k === CHOICES_KEY ? value : null),
    setItem(k, v) {
      if (k !== CHOICES_KEY) return;
      value = v;
      void ext.storage.local.set({ [key]: v });
    },
    removeItem(k) {
      if (k === CHOICES_KEY) storage.setItem(k, "{}");
    },
  };
  return storage as Storage;
}

let instance: ScriptureLinks | null = null;
/** The reader's text size for the tooltip (the popup's magnifying glasses), per browser. */
let textScale = DEFAULT_TEXT_SCALE;
/** Which start is the latest, so one overtaken while it waited gives way. */
let latest = 0;

async function start(settings: Settings): Promise<void> {
  const mine = ++latest;
  instance?.destroy();
  instance = null;
  if (leftAlone(settings, new URL(location.href)) || !document.body) return;
  const storage = await choicesFor(location.host);
  if (mine !== latest) return;
  const outside = outsideSite(settings);
  instance = createScriptureLinks({
    api: apiOf(),
    site: siteOf(settings),
    owner: OWNER,
    destination: outside ? outside.url : SCRIPTURETIPS,
    ...(outside?.translation ? { destinationTranslation: outside.translation } : {}),
    // Read more goes there too, with the site's name beside it.
    ...(outside?.name ? { destinationName: outside.name } : {}),
    ...(settings.translation ? { translation: settings.translation } : {}),
    fetch: viaBackground,
    storage,
    textScale,
    // No page restyles the tooltip: not even through the custom properties a site's plugin reads.
    themable: false,
  });
  instance.run("body");
}

void Promise.all([loadSettings(), loadTextScale()]).then(([settings, scale]) => {
  textScale = scale;
  return start(settings);
});
// A new text size reaches the tooltip at once, without the page being scanned again.
onTextScaleChange((scale) => {
  textScale = scale;
  instance?.setPreferences({ textScale: scale });
});
// Turned off or on here, or another destination chosen: the page is done again.
onSettingsChange((settings) => void start(settings));
// The popup's Generator opens the link generator as a window on this page (the top frame only: the
// message reaches every frame of the tab).
ext.runtime.onMessage.addListener((message) => {
  if ((message as { type?: string } | null)?.type !== "open-generator" || window !== window.top) {
    return undefined;
  }
  void loadSettings().then(openGeneratorWindow);
  return undefined;
});
