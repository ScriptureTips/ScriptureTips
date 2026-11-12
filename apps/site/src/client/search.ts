import { type SearchIndex, search } from "../search.ts";

/**
 * The help's search box. The form is in every help page, hidden until this script runs; the
 * index (a file the build wrote) is fetched when the reader first uses the box, and searched
 * here in the browser. Nothing typed is sent anywhere. `/about/?q=pin` searches at once.
 */
interface Scope {
  readonly index: string;
  /** The address the scope's topics are under. */
  readonly base: string;
}

function start(form: HTMLFormElement): void {
  const input = form.querySelector<HTMLInputElement>("input[type=search]");
  const status = form.querySelector<HTMLElement>(".search-status");
  const list = form.querySelector<HTMLOListElement>(".search-results");
  if (!input || !status || !list) return;
  const scopes = JSON.parse(form.dataset["search"] ?? "[]") as Scope[];
  const strings = JSON.parse(form.dataset["strings"] ?? "{}") as Record<string, string>;
  const several = scopes.length > 1;

  let loading: Promise<{ index: SearchIndex; base: string }[]> | null = null;
  const load = () => {
    loading ??= Promise.all(
      scopes.map(async (scope) => {
        const res = await fetch(scope.index);
        if (!res.ok) throw new Error(String(res.status));
        return { index: (await res.json()) as SearchIndex, base: scope.base };
      }),
    );
    // A failure isn't kept: the next keystroke tries again.
    loading.catch(() => {
      loading = null;
    });
    return loading;
  };

  let latest = 0;
  const run = async () => {
    const query = input.value;
    const turn = ++latest;
    if (query.trim() === "") {
      list.replaceChildren();
      status.textContent = "";
      return;
    }
    let loaded: Awaited<ReturnType<typeof load>>;
    try {
      loaded = await load();
    } catch {
      status.textContent = strings["failed"] ?? "";
      return;
    }
    if (turn !== latest) return;
    const hits = search(
      loaded.map((l) => l.index),
      query,
    );
    status.textContent =
      hits.length === 0
        ? (strings["none"] ?? "")
        : (strings["results"] ?? "").replace("{count}", String(hits.length));
    list.replaceChildren(
      ...hits.map((hit) => {
        const base = loaded.find((l) => l.index === hit.index)?.base ?? "";
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = `${base}${hit.topic.id}/${hit.heading ? `#${hit.heading[0]}` : ""}`;
        link.textContent = hit.heading ? `${hit.topic.title}: ${hit.heading[1]}` : hit.topic.title;
        item.append(link);
        if (several) {
          const where = document.createElement("span");
          where.className = "where";
          where.textContent = hit.index.name;
          item.append(" ", where);
        }
        const snippet = document.createElement("p");
        snippet.textContent = hit.snippet;
        item.append(snippet);
        return item;
      }),
    );
  };

  form.hidden = false;
  input.addEventListener("focus", () => void load().catch(() => {}), { once: true });
  input.addEventListener("input", () => void run());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void run();
  });
  // The help's front page takes a search in its address.
  if ("page" in form.dataset) {
    const asked = new URLSearchParams(location.search).get("q");
    if (asked) {
      input.value = asked;
      void run();
    }
  }
}

for (const form of document.querySelectorAll<HTMLFormElement>("form.help-search")) start(form);
