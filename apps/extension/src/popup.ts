import { ext } from "./browser.ts";
import { byId } from "./pages.ts";
import { loadSettings, saveSettings } from "./store.ts";
import {
  loadTextScale,
  onTextScaleChange,
  percent,
  saveTextScale,
  stepScale,
  TEXT_SCALES,
} from "./text-scale.ts";

/**
 * The toolbar popup: a switch that turns the extension off (or on again) for the site in the current
 * tab (right = on), and the cards that lead to the link generator (a window on the page) and the settings. The tab's address is read through `activeTab`, which
 * the click on the toolbar button grants. The footer's magnifying glasses make the text of the
 * passage tooltips on pages larger or smaller; this popup's own text stays as it is.
 */
async function zoom() {
  const out = byId<HTMLButtonElement>("zoom-out");
  const into = byId<HTMLButtonElement>("zoom-in");
  const now = byId<HTMLOutputElement>("zoom-now");
  const show = (scale: number) => {
    now.textContent = percent(scale);
    out.disabled = scale <= (TEXT_SCALES[0] as number);
    into.disabled = scale >= (TEXT_SCALES.at(-1) as number);
  };
  let scale = await loadTextScale();
  show(scale);
  const change = async (direction: 1 | -1) => {
    scale = stepScale(scale, direction);
    show(scale);
    await saveTextScale(scale);
  };
  out.addEventListener("click", () => void change(-1));
  into.addEventListener("click", () => void change(1));
  onTextScaleChange((next) => {
    scale = next;
    show(scale);
  });
}

async function main() {
  // Before the tab is looked at: a page the extension leaves alone still has a text size.
  void zoom();
  const where = byId<HTMLParagraphElement>("where");
  const on = byId<HTMLInputElement>("on");
  // The native checkbox reports its state itself; the attribute keeps it in step for readers that look.
  const mirror = () => on.setAttribute("aria-checked", String(on.checked));
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  let url: URL | null = null;
  try {
    url = tab?.url ? new URL(tab.url) : null;
  } catch {
    url = null;
  }
  // The generator opens as a window on the page. Where that can't be (the page isn't one the
  // extension runs on, or its script isn't there), the link opens it in a tab of its own.
  const tool = byId<HTMLAnchorElement>("tool");
  const tabId = tab?.id;
  if (url && /^https?:$/.test(url.protocol) && tabId !== undefined) {
    tool.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await ext.tabs.sendMessage(tabId, { type: "open-generator" });
        window.close();
      } catch {
        await ext.tabs.create({ url: ext.runtime.getURL("tool.html") });
      }
    });
  }
  if (!url || !/^https?:$/.test(url.protocol)) {
    where.textContent = "Scripture Tips doesn't link references on this page.";
    on.checked = false;
    mirror();
    on.disabled = true;
    return;
  }
  const host = url.host;
  where.textContent = host;
  on.checked = !(await loadSettings()).disabledSites.includes(host);
  mirror();
  on.addEventListener("change", async () => {
    mirror();
    const settings = await loadSettings();
    const others = settings.disabledSites.filter((h) => h !== host);
    await saveSettings({ ...settings, disabledSites: on.checked ? others : [...others, host] });
  });
}

void main();
