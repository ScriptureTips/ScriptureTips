import {
  type AlertOptions,
  type ConfirmOptions,
  type Resolved,
  resolveAlert,
  resolveConfirm,
} from "./options.ts";

export type { AlertOptions, ConfirmOptions } from "./options.ts";

/**
 * Shared prompts (vision §3.6): an alert and a confirm, as a modal dialog over the page, with no
 * dependencies. Each returns a promise (the confirm's is true if the reader went ahead), so a caller
 * reads like `if (await confirmDialog({ ... })) remove()`.
 *
 * Built on the browser's own `<dialog>` (focus kept inside, Escape, the page behind made inert) in
 * a shadow root, with the host element reset inline, so a page's styles can't reach it. Escape, a
 * press on the backdrop and the Cancel button all answer "no". Text is only ever set as text.
 */
const FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';

const STYLES = `
  :host { all: initial; }
  dialog {
    box-sizing: border-box; width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
    margin: auto; padding: 0; overflow: auto;
    font: 400 15px/1.45 ${FONT}; color: #1d232a; background: #fff;
    border: 1px solid #c9d0d6; border-radius: 10px; box-shadow: 0 16px 48px rgb(0 30 60 / 0.35);
    direction: ltr; text-align: start; letter-spacing: normal; text-transform: none;
  }
  dialog::backdrop { background: rgb(15 23 32 / 0.5); }
  .body { padding: 18px 20px 6px; }
  h2 { margin: 0 0 6px; font-size: 17px; font-weight: 600; }
  p { margin: 0; color: #5b6672; overflow-wrap: anywhere; white-space: pre-line; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 20px 18px; }
  button {
    font: inherit; padding: 6px 16px; cursor: pointer; color: #fff; background: #0054a5;
    border: 1px solid #0054a5; border-radius: 6px;
  }
  button.cancel { color: #0054a5; background: transparent; border-color: #c9d0d6; }
  button.danger { background: #d93025; border-color: #d93025; }
  button:hover { filter: brightness(0.92); }
  button:focus-visible { outline: 2px solid #0054a5; outline-offset: 2px; }
  button.danger:focus-visible { outline-color: #d93025; }
  @media (prefers-color-scheme: dark) {
    dialog { color: #e8edf2; background: #161b21; border-color: #3a434c; }
    p { color: #a8b3be; }
    button { color: #0f1317; background: #7cc4ff; border-color: #7cc4ff; }
    button.cancel { color: #7cc4ff; background: transparent; border-color: #3a434c; }
    button.danger { color: #fff; background: #d93025; border-color: #d93025; }
  }
`;

let counter = 0;

/** Shows the dialog and answers whether the button that goes ahead was the way it closed. */
function show(what: Resolved, role: "dialog" | "alertdialog"): Promise<boolean> {
  return new Promise((resolve) => {
    const id = `st-dialog-${++counter}`;
    const host = document.createElement("div");
    host.className = "st-dialog-host";
    const reset = (property: string, value: string) =>
      host.style.setProperty(property, value, "important");
    reset("all", "initial");
    reset("direction", "ltr");
    const root = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLES;
    const dialog = document.createElement("dialog");
    dialog.setAttribute("role", role);
    dialog.setAttribute("aria-labelledby", `${id}-title`);
    const body = document.createElement("div");
    body.className = "body";
    const title = document.createElement("h2");
    title.id = `${id}-title`;
    title.textContent = what.title;
    body.append(title);
    if (what.message) {
      const message = document.createElement("p");
      message.id = `${id}-message`;
      message.textContent = what.message;
      dialog.setAttribute("aria-describedby", message.id);
      body.append(message);
    }
    const actions = document.createElement("div");
    actions.className = "actions";
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = what.danger ? "danger" : "confirm";
    confirm.textContent = what.confirmLabel;
    let cancel: HTMLButtonElement | null = null;
    if (what.cancelLabel) {
      cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "cancel";
      cancel.textContent = what.cancelLabel;
      actions.append(cancel);
    }
    actions.append(confirm);
    dialog.append(body, actions);
    root.append(style, dialog);

    let answer = false;
    confirm.addEventListener("click", () => {
      answer = true;
      dialog.close();
    });
    cancel?.addEventListener("click", () => dialog.close());
    // A press on the backdrop (the dialog element itself, outside its content) answers no.
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    // Escape closes it too (the browser's own), answering no.
    dialog.addEventListener("close", () => {
      host.remove();
      resolve(answer);
    });

    document.body.append(host);
    dialog.showModal();
    (what.focus === "cancel" && cancel ? cancel : confirm).focus();
  });
}

/** Tells the reader something; resolves when they close it. */
export async function alertDialog(options: AlertOptions): Promise<void> {
  await show(resolveAlert(options), "dialog");
}

/** Asks the reader to go ahead or not; resolves true only if they chose to. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  const resolved = resolveConfirm(options);
  return show(resolved, resolved.danger ? "alertdialog" : "dialog");
}
