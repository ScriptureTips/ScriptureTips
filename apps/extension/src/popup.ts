import { ext } from "./browser.ts";
import { byId } from "./pages.ts";
import { loadSettings, saveSettings } from "./store.ts";

/**
 * The toolbar popup: turn the extension off (or on again) for the site in the current tab, and the
 * way to the link generator and the settings. The tab's address is read through `activeTab`, which
 * the click on the toolbar button grants.
 */
async function main() {
  const where = byId<HTMLParagraphElement>("where");
  const off = byId<HTMLInputElement>("off");
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  let url: URL | null = null;
  try {
    url = tab?.url ? new URL(tab.url) : null;
  } catch {
    url = null;
  }
  if (!url || !/^https?:$/.test(url.protocol)) {
    where.textContent = "Scripture Tips doesn't link references on this page.";
    off.disabled = true;
    return;
  }
  const host = url.host;
  where.textContent = host;
  off.checked = (await loadSettings()).disabledSites.includes(host);
  off.addEventListener("change", async () => {
    const settings = await loadSettings();
    const others = settings.disabledSites.filter((h) => h !== host);
    await saveSettings({ ...settings, disabledSites: off.checked ? [...others, host] : others });
  });
}

void main();
