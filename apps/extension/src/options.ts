import { DEFAULT_TRANSLATION, type WidgetTranslation } from "@scripturetips/scripture-links";
import { byId, destinationOf, destinations, FORMAT_NAMES, fill } from "./pages.ts";
import {
  apiOf,
  BUILT_IN_SITE,
  LINK_FORMATS,
  type LinkFormat,
  type OutsideSite,
  PRESET_SITES,
  type Settings,
} from "./settings.ts";
import { loadSettings, saveSettings } from "./store.ts";

/**
 * The settings page: where links go, the translation passages open in, the outside reading sites,
 * the link generator's format, the sites the extension is turned off on, and another ScriptureTips
 * installation to use. Each change is saved as it's made.
 */
let settings: Settings;

const status = () => byId<HTMLParagraphElement>("status");

async function save(next: Settings, redraw = false): Promise<void> {
  settings = next;
  if (redraw) draw();
  try {
    await saveSettings(next);
    status().textContent = "Saved.";
  } catch {
    // Sync storage refused it (too large, or too many writes at once).
    status().textContent = "That couldn't be saved. Try again in a moment.";
  }
}

/** The translations ScriptureTips can show, from its API; the default alone if it can't be reached. */
async function translations(): Promise<{ value: string; label: string }[]> {
  try {
    const res = await fetch(`${apiOf()}/widget/translations`, { credentials: "omit" });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { translations: WidgetTranslation[] };
    return body.translations.map((t) => ({ value: t.id, label: `${t.name} (${t.abbreviation})` }));
  } catch {
    status().textContent = "The list of translations couldn't be loaded from ScriptureTips.";
    return [{ value: DEFAULT_TRANSLATION, label: "King James Version (KJV)" }];
  }
}

function siteFields(site: OutsideSite, index: number): HTMLFieldSetElement {
  const set = document.createElement("fieldset");
  const field = (label: string, key: keyof OutsideSite) => {
    const id = `site-${index}-${key}`;
    const l = document.createElement("label");
    l.htmlFor = id;
    l.textContent = label;
    const input = document.createElement("input");
    input.type = "text";
    input.id = id;
    input.value = site[key];
    input.spellcheck = false;
    input.addEventListener("change", () => {
      const sites = settings.outsideSites.map((s, i) =>
        i === index ? { ...s, [key]: input.value.trim() } : s,
      );
      void save({ ...settings, outsideSites: sites }, key === "name");
    });
    set.append(l, input);
  };
  field("Name", "name");
  field("Address", "url");
  field("Translation", "translation");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "quiet";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    const sites = settings.outsideSites.filter((_, i) => i !== index);
    const d = settings.destination;
    // The destination follows its site, or goes back to ScriptureTips if that site went.
    const destination =
      typeof d !== "number" || d === index ? "scripturetips" : d > index ? d - 1 : d;
    void save({ ...settings, outsideSites: sites, destination }, true);
  });
  const row = document.createElement("div");
  row.className = "row";
  row.append(remove);
  set.append(row);
  return set;
}

function draw(): void {
  fill(byId("destination"), destinations(settings), String(settings.destination));
  byId("sites").replaceChildren(...settings.outsideSites.map(siteFields));
}

async function main() {
  settings = await loadSettings();
  draw();
  fill(
    byId("format"),
    LINK_FORMATS.map((f) => ({ value: f, label: FORMAT_NAMES[f] })),
    settings.format,
  );
  const disabled = byId<HTMLTextAreaElement>("disabled");
  disabled.value = settings.disabledSites.join("\n");
  const site = byId<HTMLInputElement>("site");
  site.value = settings.site ?? "";
  site.placeholder = BUILT_IN_SITE;

  byId<HTMLSelectElement>("destination").addEventListener("change", (e) => {
    void save({
      ...settings,
      destination: destinationOf((e.target as HTMLSelectElement).value),
    });
  });
  byId<HTMLSelectElement>("format").addEventListener("change", (e) => {
    void save({ ...settings, format: (e.target as HTMLSelectElement).value as LinkFormat });
  });
  disabled.addEventListener("change", () => {
    const hosts = disabled.value
      .split(/\s+/)
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    void save({ ...settings, disabledSites: [...new Set(hosts)] });
  });
  site.addEventListener("change", () => {
    const value = site.value.trim();
    if (value && !/^https?:\/\/[^/]+/.test(value)) {
      status().textContent = "The address needs to start with https://";
      return;
    }
    void save({ ...settings, site: value ? new URL(value).origin : null });
  });
  byId<HTMLButtonElement>("add-site").addEventListener("click", () => {
    void save(
      {
        ...settings,
        outsideSites: [...settings.outsideSites, { name: "", url: "", translation: "" }],
      },
      true,
    );
  });
  byId<HTMLButtonElement>("restore-sites").addEventListener("click", () => {
    const known = new Set(settings.outsideSites.map((s) => s.url));
    const missing = PRESET_SITES.filter((s) => !known.has(s.url));
    void save({ ...settings, outsideSites: [...settings.outsideSites, ...missing] }, true);
  });

  const translation = byId<HTMLSelectElement>("translation");
  fill(translation, await translations(), settings.translation ?? DEFAULT_TRANSLATION);
  translation.addEventListener("change", () => {
    void save({ ...settings, translation: translation.value });
  });
}

void main();
