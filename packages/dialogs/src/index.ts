import {
  type AlertOptions,
  type ChoiceOptions,
  type ConfirmOptions,
  type ModalOptions,
  messagePieces,
  type Resolved,
  resolveAlert,
  resolveChoice,
  resolveConfirm,
  resolveModal,
} from "./options.ts";

export type {
  AlertOptions,
  Choice,
  ChoiceOptions,
  ConfirmOptions,
  ModalOptions,
} from "./options.ts";

/**
 * Shared prompts (vision §3.6): an alert, a confirm and a choice, as a modal dialog over the page,
 * with no dependencies. Each returns a promise (the confirm's is true if the reader went ahead), so
 * a caller reads like `if (await confirmDialog({ ... })) remove()`.
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
  .body { padding: 18px 20px 6px; overflow-wrap: anywhere; }
  .content { padding: 4px 20px 6px; }
  .body h2 { margin: 0 0 6px; font-size: 17px; font-weight: 600; }
  .body p { margin: 0; color: #5b6672; white-space: pre-line; }
  .body p strong { font-weight: 700; color: #1d232a; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 20px 18px; }
  .actions button {
    font: inherit; padding: 6px 16px; cursor: pointer; color: #fff; background: #0054a5;
    border: 1px solid #0054a5; border-radius: 6px;
  }
  .actions button.cancel { color: #0054a5; background: transparent; border-color: #c9d0d6; }
  .actions button.danger { background: #d93025; border-color: #d93025; }
  .actions button:hover { filter: brightness(0.92); }
  .actions button:focus-visible { outline: 2px solid #0054a5; outline-offset: 2px; }
  .actions button.danger:focus-visible { outline-color: #d93025; }
  @media (prefers-color-scheme: dark) {
    dialog { color: #e8edf2; background: #161b21; border-color: #3a434c; }
    .body p { color: #a8b3be; }
    .body p strong { color: #e8edf2; }
    .actions button { color: #0f1317; background: #7cc4ff; border-color: #7cc4ff; }
    .actions button.cancel { color: #7cc4ff; background: transparent; border-color: #3a434c; }
    .actions button.danger { color: #fff; background: #d93025; border-color: #d93025; }
  }
`;

let counter = 0;

/** A host element reset inline (no page's styles reach it), with a shadow root to build in. */
function newHost(): { host: HTMLDivElement; root: ShadowRoot } {
  const host = document.createElement("div");
  host.className = "st-dialog-host";
  const reset = (property: string, value: string) =>
    host.style.setProperty(property, value, "important");
  reset("all", "initial");
  reset("direction", "ltr");
  return { host, root: host.attachShadow({ mode: "open" }) };
}

/** The message's paragraph: text, with only its bold pieces as `<strong>` elements holding text. */
function messageParagraph(message: string, id: string): HTMLParagraphElement {
  const p = document.createElement("p");
  p.id = id;
  for (const piece of messagePieces(message)) {
    if (!piece.bold) p.append(piece.text);
    else {
      const strong = document.createElement("strong");
      strong.textContent = piece.text;
      p.append(strong);
    }
  }
  return p;
}

/** Shows the dialog and answers whether the button that goes ahead was the way it closed. */
function show(what: Resolved, role: "dialog" | "alertdialog"): Promise<boolean> {
  return new Promise((resolve) => {
    const id = `st-dialog-${++counter}`;
    const { host, root } = newHost();

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
      // Text only: bold pieces become <strong> elements holding text, never parsed markup.
      const message = messageParagraph(what.message, `${id}-message`);
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

/**
 * Asks the reader to go ahead one of several ways (`choices`, each a button, with what it does
 * listed under the message), or not: resolves the chosen one's `value`, or null for Cancel,
 * Escape or a press on the backdrop. The focus starts on the first choice.
 */
export function choiceDialog<T extends string>(options: ChoiceOptions<T>): Promise<T | null> {
  const what = resolveChoice(options);
  return new Promise((resolve) => {
    const id = `st-dialog-${++counter}`;
    const { host, root } = newHost();
    const style = document.createElement("style");
    // The choices' descriptions: here, not in STYLES, which every dialog (the extension's) carries.
    style.textContent = `${STYLES}
      .body dl { margin: 10px 0 0; } .body dt { font-weight: 600; }
      .body dd { margin: 0 0 8px; color: #5b6672; overflow-wrap: anywhere; }
      @media (prefers-color-scheme: dark) { .body dd { color: #a8b3be; } }`;
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-labelledby", `${id}-title`);
    const body = document.createElement("div");
    body.className = "body";
    const title = document.createElement("h2");
    title.id = `${id}-title`;
    title.textContent = what.title;
    body.append(title);
    const described: string[] = [];
    if (what.message) {
      const message = messageParagraph(what.message, `${id}-message`);
      described.push(message.id);
      body.append(message);
    }
    const explained = what.choices.filter((c) => c.description);
    if (explained.length > 0) {
      const list = document.createElement("dl");
      list.id = `${id}-choices`;
      for (const c of explained) {
        const term = document.createElement("dt");
        term.textContent = c.label;
        const detail = document.createElement("dd");
        detail.textContent = c.description;
        list.append(term, detail);
      }
      described.push(list.id);
      body.append(list);
    }
    if (described.length > 0) dialog.setAttribute("aria-describedby", described.join(" "));
    const actions = document.createElement("div");
    actions.className = "actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "cancel";
    cancel.textContent = what.cancelLabel;
    cancel.addEventListener("click", () => dialog.close());
    actions.append(cancel);
    let answer: T | null = null;
    const buttons = what.choices.map((c) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "confirm";
      button.textContent = c.label;
      button.addEventListener("click", () => {
        answer = c.value;
        dialog.close();
      });
      actions.append(button);
      return button;
    });
    dialog.append(body, actions);
    root.append(style, dialog);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      host.remove();
      resolve(answer);
    });
    document.body.append(host);
    dialog.showModal();
    (buttons[0] ?? cancel).focus();
  });
}

/**
 * A modal holding content of the caller's own (a form, a list), closed with a Done button, Escape
 * or a press on the backdrop. Resolves when it closes. The content is the caller's nodes, so they
 * can keep them up to date while it is open; `stylesheets` bring the caller's own classes into the
 * dialog (the dialog is in a shadow root, which the page's styles don't reach). Prompts opened from
 * inside it (a confirm) stack above it.
 */
export function modalDialog(options: ModalOptions): Promise<void> {
  const what = resolveModal(options);
  return new Promise((resolve) => {
    const id = `st-dialog-${++counter}`;
    const { host, root } = newHost();
    const style = document.createElement("style");
    style.textContent = `${STYLES} dialog.modal { width: min(${what.width}px, calc(100vw - 32px)); }`;
    const links = what.stylesheets.map((href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      return link;
    });
    const dialog = document.createElement("dialog");
    dialog.className = "modal";
    dialog.setAttribute("aria-labelledby", `${id}-title`);
    const body = document.createElement("div");
    body.className = "body";
    const title = document.createElement("h2");
    title.id = `${id}-title`;
    title.textContent = what.title;
    body.append(title);
    const content = document.createElement("div");
    content.className = "content";
    content.append(options.content);
    const actions = document.createElement("div");
    actions.className = "actions";
    const done = document.createElement("button");
    done.type = "button";
    done.className = "confirm";
    done.textContent = what.closeLabel;
    done.addEventListener("click", () => dialog.close());
    actions.append(done);
    dialog.append(body, content, actions);
    root.append(style, ...links, dialog);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      host.remove();
      resolve();
    });
    document.body.append(host);
    dialog.showModal();
    // The first thing in it that can be used; the Done button if there is nothing.
    const first = content.querySelector<HTMLElement>("button, input, select, textarea, a[href]");
    (first ?? done).focus();
  });
}
