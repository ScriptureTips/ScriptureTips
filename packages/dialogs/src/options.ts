/** What an alert says. */
export interface AlertOptions {
  /** The heading. */
  readonly title: string;
  /** What it says, as text (never markup): only `**bold**` and `<strong>bold</strong>` are shown bold. */
  readonly message?: string;
  /** The button's words ("OK"). */
  readonly okLabel?: string;
}

/** What a confirm asks. */
export interface ConfirmOptions {
  readonly title: string;
  readonly message?: string;
  /** The button that goes ahead ("OK"). */
  readonly confirmLabel?: string;
  /** The button that doesn't ("Cancel"). */
  readonly cancelLabel?: string;
  /**
   * The thing asked is hard to undo (a delete): the button that goes ahead is red, and the focus
   * starts on the one that doesn't, so a stray Enter keeps things as they are.
   */
  readonly danger?: boolean;
}

/** The words and the focus a dialog starts with, from what it was given. */
export interface Resolved {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  /** Empty for an alert: it has no second button. */
  readonly cancelLabel: string;
  readonly danger: boolean;
  /** Which button has the focus when it opens. */
  readonly focus: "confirm" | "cancel";
}

export function resolveAlert(options: AlertOptions): Resolved {
  return {
    title: options.title,
    message: options.message ?? "",
    confirmLabel: options.okLabel ?? "OK",
    cancelLabel: "",
    danger: false,
    focus: "confirm",
  };
}

export function resolveConfirm(options: ConfirmOptions): Resolved {
  const danger = options.danger ?? false;
  return {
    title: options.title,
    message: options.message ?? "",
    confirmLabel: options.confirmLabel ?? "OK",
    cancelLabel: options.cancelLabel ?? "Cancel",
    danger,
    focus: danger ? "cancel" : "confirm",
  };
}

/** What a modal holding content of the caller's own asks for. */
export interface ModalOptions {
  readonly title: string;
  /** What it holds: nodes the caller builds and keeps in step while it is open. */
  readonly content: Node;
  /** The button that closes it ("Done"). */
  readonly closeLabel?: string;
  /** Style sheets (addresses) to bring into the dialog, so the caller's own classes work inside it. */
  readonly stylesheets?: readonly string[];
  /** Its width in CSS pixels, kept between 320 and 900 and within the window (560). */
  readonly width?: number;
}

export const MODAL_WIDTH = { least: 320, most: 900, usual: 560 } as const;

export function resolveModal(options: ModalOptions) {
  const width = options.width ?? MODAL_WIDTH.usual;
  return {
    title: options.title,
    closeLabel: options.closeLabel ?? "Done",
    stylesheets: options.stylesheets ?? [],
    width: Math.min(MODAL_WIDTH.most, Math.max(MODAL_WIDTH.least, Math.round(width))),
  };
}

/** A piece of a message, and whether it is shown bold. */
export interface Piece {
  readonly text: string;
  readonly bold: boolean;
}

/**
 * Splits a message into plain and bold pieces. The only markup is `**bold**` and
 * `<strong>bold</strong>`; anything else (any other tag included) stays as the plain text it was
 * written as, so a message is never markup.
 */
export function messagePieces(message: string): Piece[] {
  const pieces: Piece[] = [];
  let rest = message;
  for (;;) {
    const found = /\*\*(.+?)\*\*|<strong>(.+?)<\/strong>/s.exec(rest);
    if (!found) break;
    if (found.index > 0) pieces.push({ text: rest.slice(0, found.index), bold: false });
    pieces.push({ text: found[1] ?? found[2] ?? "", bold: true });
    rest = rest.slice(found.index + found[0].length);
  }
  if (rest) pieces.push({ text: rest, bold: false });
  return pieces;
}
