import { ext } from "./browser.ts";
import { migrate, normalize, SETTINGS_KEY, type Settings } from "./settings.ts";

/** The reader's settings: those saved, or carried over from v1.0.3, or the defaults. */
export async function loadSettings(): Promise<Settings> {
  return migrate(await ext.storage.sync.get(null));
}

export async function saveSettings(settings: Settings): Promise<void> {
  await ext.storage.sync.set({ [SETTINGS_KEY]: normalize(settings) });
}

/** Calls `fn` with the new settings whenever they change (in any of the reader's browsers). */
export function onSettingsChange(fn: (settings: Settings) => void): void {
  ext.storage.onChanged.addListener((changes, area) => {
    const change = changes[SETTINGS_KEY];
    if (area === "sync" && change) fn(normalize(change.newValue));
  });
}

/** What the content script asks the background for. */
export interface FetchRequest {
  readonly type: "fetch";
  readonly url: string;
}
export type FetchReply =
  | { readonly status: number; readonly body: string }
  | { readonly error: string };
