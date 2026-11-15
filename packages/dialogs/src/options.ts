/** What an alert says. */
export interface AlertOptions {
  /** The heading. */
  readonly title: string;
  /** What it says, as text (never markup). */
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
