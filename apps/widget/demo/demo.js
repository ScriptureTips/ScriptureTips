// The help's live demos (apps/site, widget help). The help page's content security policy allows
// only the site's own files, so the demos' code is this file, served beside the plugin's script.
(() => {
  const ST = window.ScriptureTips;
  if (!ST) return;

  // The search with its own callback (the "Live demos" topic).
  const picked = document.getElementById("demo-picked");
  if (picked) {
    ST.search({
      input: "#demo-callback-field",
      results: "#demo-callback-results",
      limit: 5,
      searchOnType: true,
      onSelect: ({ result }) => {
        picked.textContent = `Picked ${result.label} (${result.reference}, ${result.translation.abbreviation})`;
      },
    });
  }

  // The tooltip (the "Live demos of the tooltip" topic).
  if (document.getElementById("tooltip-demo")) {
    ST.run("#tooltip-demo");
    const log = document.getElementById("demo-tip-log");
    ST.on("tooltip-open", (detail) => {
      if (log) log.textContent = `Opened ${detail?.reference ?? "a passage"}`;
    });
    const add = document.getElementById("demo-add-text");
    const added = document.getElementById("demo-added");
    add?.addEventListener("click", () => {
      const p = document.createElement("p");
      p.textContent = "Added just now: see Romans 8:28 and Philippians 4:13.";
      added?.appendChild(p);
    });
  }
})();
