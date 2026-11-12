import { linkText } from "./format.ts";
import { addressFor, byId, destinationOf, destinations, FORMAT_NAMES, fill } from "./pages.ts";
import { LINK_FORMATS, type LinkFormat } from "./settings.ts";
import { loadSettings } from "./store.ts";

/**
 * The link generator (vision §3.6): the reader pastes what they're writing, chooses the format and
 * where links go (from their settings at first), and gets it back with the references linked.
 * Each change can be undone and redone.
 */
async function main() {
  const settings = await loadSettings();
  const text = byId<HTMLTextAreaElement>("text");
  const format = byId<HTMLSelectElement>("format");
  const destination = byId<HTMLSelectElement>("destination");
  const undo = byId<HTMLButtonElement>("undo");
  const redo = byId<HTMLButtonElement>("redo");
  const status = byId<HTMLSpanElement>("status");

  fill(
    format,
    LINK_FORMATS.map((f) => ({ value: f, label: FORMAT_NAMES[f] })),
    settings.format,
  );
  fill(destination, destinations(settings), String(settings.destination));

  // Each state of the text: what it was before each change, and after.
  const history: string[] = [];
  let at = -1;
  const buttons = () => {
    undo.disabled = at <= 0;
    redo.disabled = at >= history.length - 1;
  };
  buttons();

  byId<HTMLButtonElement>("apply").addEventListener("click", () => {
    const before = text.value;
    const after = linkText(
      before,
      format.value as LinkFormat,
      addressFor(settings, destinationOf(destination.value)),
    );
    if (after === before) {
      status.textContent = "No references to link.";
      return;
    }
    // A change after undoing drops what could have been redone.
    history.splice(at + 1);
    if (history[history.length - 1] !== before) history.push(before);
    history.push(after);
    at = history.length - 1;
    text.value = after;
    status.textContent = "Links added.";
    buttons();
  });
  undo.addEventListener("click", () => {
    if (at <= 0) return;
    text.value = history[--at] ?? "";
    status.textContent = "";
    buttons();
  });
  redo.addEventListener("click", () => {
    if (at >= history.length - 1) return;
    text.value = history[++at] ?? "";
    status.textContent = "";
    buttons();
  });
  byId<HTMLButtonElement>("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text.value);
      status.textContent = "Copied.";
    } catch {
      text.select();
      status.textContent = "Press Ctrl+C to copy.";
    }
  });
}

void main();
