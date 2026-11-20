/**
 * The behavior of a small tooltip that opens over its trigger: on a mouse hover or the keyboard
 * focus, and on a touch's tap. Framework-free, so the web app's `HoverTip`, the website plugin
 * and the browser extension's tooltip all behave alike. The wrapper holds the trigger and the
 * tooltip (an element with `role="tooltip"`); this sets `data-open` on the wrapper while it's open
 * and the stylesheet shows the tooltip then.
 *
 * - The pointer leaving the trigger or the tooltip closes it after a short delay, and going onto
 *   either, the tooltip included, cancels that, so the pointer can cross any gap between them
 *   (the tooltip needn't move to hide it) and the tooltip's text can be selected.
 * - Pressing on the tooltip's text moves the focus off the trigger; that doesn't close it while
 *   the pointer is on it, or while a touch that began on it hasn't been followed by one elsewhere.
 * - Escape closes it. A press or tap outside closes it.
 * - On a touch screen the first tap on a link trigger opens the tooltip without following the link;
 *   a tap while it's open follows it.
 */

export interface HoverTipOptions {
  /** Milliseconds from the pointer leaving to the tooltip closing. 250. */
  readonly delay?: number;
  /** The tooltip opened or closed (to place it, say). */
  readonly onChange?: (open: boolean) => void;
}

export interface HoverTipBinding {
  readonly isOpen: () => boolean;
  readonly open: () => void;
  readonly close: () => void;
  /** Takes the listeners away (and closes). */
  readonly destroy: () => void;
}

export function bindHoverTip(wrapper: HTMLElement, options: HoverTipOptions = {}): HoverTipBinding {
  const delay = options.delay ?? 250;
  const listening = new AbortController();
  const { signal } = listening;
  let isOpen = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The pointer is on the trigger or the tip (a touch that began there counts until one begins
  // elsewhere).
  let within = false;
  // Whether the tip was already open when a touch began, and whether the last press was a touch.
  let openAtTouch = false;
  let touched = false;

  const set = (open: boolean) => {
    if (open === isOpen) return;
    isOpen = open;
    if (open) wrapper.setAttribute("data-open", "");
    else wrapper.removeAttribute("data-open");
    options.onChange?.(open);
  };
  const cancel = () => clearTimeout(timer);
  const show = () => {
    cancel();
    set(true);
  };
  const hideSoon = () => {
    cancel();
    timer = setTimeout(() => set(false), delay);
  };
  const inTip = (target: EventTarget | null) =>
    target instanceof Element && target.closest('[role="tooltip"]') !== null;
  const mine = (event: Event) => event.composedPath().includes(wrapper);

  wrapper.addEventListener(
    "pointerenter",
    (e) => {
      if (e.pointerType === "touch") return;
      within = true;
      show();
    },
    { signal },
  );
  wrapper.addEventListener(
    "pointerleave",
    (e) => {
      if (e.pointerType === "touch") return;
      within = false;
      hideSoon();
    },
    { signal },
  );
  wrapper.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType !== "touch") return;
      openAtTouch = isOpen;
      touched = true;
      within = true;
      show();
    },
    { signal },
  );
  wrapper.addEventListener(
    "click",
    (e) => {
      // The first tap shows the tip; a link waits for a second.
      if (touched && !openAtTouch && !inTip(e.target) && (e.target as Element).closest("a")) {
        e.preventDefault();
      }
      touched = false;
    },
    { capture: true, signal },
  );
  wrapper.addEventListener("focusin", show, { signal });
  wrapper.addEventListener(
    "focusout",
    (e) => {
      if (within) return;
      if (!wrapper.contains(e.relatedTarget as Node | null)) hideSoon();
    },
    { signal },
  );
  // Escape, wherever the focus is (a hover doesn't move it), closes this tip only, not what it's
  // in (a tooltip holding it, a dialog): caught first, and not passed on.
  wrapper.ownerDocument.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !isOpen) return;
      e.stopPropagation();
      cancel();
      set(false);
    },
    { capture: true, signal },
  );
  // A press or tap outside closes it (a touch browser may not move the focus off a tapped link).
  wrapper.ownerDocument.addEventListener(
    "pointerdown",
    (e) => {
      if (!isOpen || mine(e)) return;
      within = false;
      cancel();
      set(false);
    },
    { capture: true, signal },
  );

  return {
    isOpen: () => isOpen,
    open: show,
    close: () => {
      cancel();
      set(false);
    },
    destroy: () => {
      cancel();
      listening.abort();
      set(false);
    },
  };
}
