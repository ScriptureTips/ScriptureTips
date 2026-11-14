import { ext } from "./browser.ts";

/**
 * How large the text inside the passage tooltips on pages is: the steps the magnifying glasses in
 * the toolbar popup's footer move through, as multiples of its own size. Only the tooltip: the
 * page's own text and the extension's own screens (this popup, the settings) never change.
 */
export const TEXT_SCALES: readonly number[] = [0.85, 1, 1.15, 1.3, 1.5, 1.75, 2];
export const DEFAULT_TEXT_SCALE = 1;

/**
 * Kept in this browser's local storage, not synced: a size that reads well on a desktop is the
 * wrong one on a phone. It has a key of its own, so a click doesn't touch the settings (which make
 * every open page scan again).
 */
export const TEXT_SCALE_KEY = "textScale";

/** The step a stored value means: its nearest step, or the normal size if it isn't a number. */
export function normalScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_TEXT_SCALE;
  return TEXT_SCALES.reduce((best, step) =>
    Math.abs(step - value) < Math.abs(best - value) ? step : best,
  );
}

/** The next step larger (`1`) or smaller (`-1`); the largest and smallest stay where they are. */
export function stepScale(current: number, direction: 1 | -1): number {
  const at = TEXT_SCALES.indexOf(normalScale(current));
  return TEXT_SCALES[Math.min(TEXT_SCALES.length - 1, Math.max(0, at + direction))] as number;
}

/** A scale as the percentage shown to the reader. */
export const percent = (scale: number): string => `${Math.round(scale * 100)}%`;

export async function loadTextScale(): Promise<number> {
  return normalScale((await ext.storage.local.get(TEXT_SCALE_KEY))[TEXT_SCALE_KEY]);
}

export async function saveTextScale(scale: number): Promise<void> {
  await ext.storage.local.set({ [TEXT_SCALE_KEY]: normalScale(scale) });
}

/** Calls `fn` with the new size whenever it changes (from the popup, in any window). */
export function onTextScaleChange(fn: (scale: number) => void): void {
  ext.storage.onChanged.addListener((changes, area) => {
    const change = changes[TEXT_SCALE_KEY];
    if (area === "local" && change) fn(normalScale(change.newValue));
  });
}
