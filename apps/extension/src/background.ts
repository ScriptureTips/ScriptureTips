import { ext } from "./browser.ts";
import { apiOf, SETTINGS_KEY } from "./settings.ts";
import { type FetchReply, type FetchRequest, loadSettings, saveSettings } from "./store.ts";

/**
 * The background (a service worker in Chrome, an event page in Firefox). On install it saves the
 * settings, carrying over v1.0.3's on an update (v1.0.3 reset them on every update; this never
 * does). It fetches passages for the content scripts, so the requests come from the extension,
 * not from the pages, and it answers only for the ScriptureTips API's widget routes.
 */
ext.runtime.onInstalled.addListener(async () => {
  const stored = await ext.storage.sync.get(null);
  if (!(SETTINGS_KEY in stored)) await saveSettings(await loadSettings());
});

const isFetch = (m: unknown): m is FetchRequest =>
  typeof m === "object" &&
  m !== null &&
  (m as FetchRequest).type === "fetch" &&
  typeof (m as FetchRequest).url === "string";

async function load(url: string): Promise<FetchReply> {
  const allowed = `${apiOf(await loadSettings())}/widget/`;
  if (!url.startsWith(allowed)) return { error: "Only the ScriptureTips API is fetched." };
  try {
    const res = await fetch(url, { credentials: "omit" });
    return { status: res.status, body: await res.text() };
  } catch {
    return { error: "ScriptureTips couldn't be reached." };
  }
}

ext.runtime.onMessage.addListener((message, _sender, respond) => {
  if (!isFetch(message)) return undefined;
  load(message.url).then(respond);
  // The answer comes later.
  return true;
});
