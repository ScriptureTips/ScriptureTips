// The help's live demo of a search with its own callback (apps/site, widget help "Live demos").
// The help page's content security policy allows only the site's own files, so the demo's code
// is this file, served beside the plugin's script.
(() => {
  var log = document.getElementById("demo-picked");
  if (!log || !window.ScriptureTips) return;
  window.ScriptureTips.search({
    input: "#demo-callback-field",
    results: "#demo-callback-results",
    limit: 5,
    searchOnType: true,
    onSelect: (event) => {
      var r = event.result;
      log.textContent =
        "Picked " + r.label + " (" + r.reference + ", " + r.translation.abbreviation + ")";
    },
  });
})();
