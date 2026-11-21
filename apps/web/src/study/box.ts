/**
 * The study menu's window: where it is and how big. It floats over the page, is dragged by its
 * header and resized from its corner, and always stays on screen. A height of null is "as tall as
 * its content" (until the user resizes it).
 */

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number | null;
}

export interface View {
  readonly w: number;
  readonly h: number;
}

/** The smallest the window can be. */
export const MIN_W = 256;
export const MIN_H = 128;
/** The space kept around it. */
const GAP = 8;

/**
 * The four default sizes, by the viewport's width (breakpoints, not calculations): each is about a
 * quarter of its viewport's area, the largest being 1000 x 600. Listed widest first.
 */
export const DEFAULT_SIZES: readonly {
  readonly minView: number;
  readonly w: number;
  readonly h: number;
}[] = [
  { minView: 1920, w: 1000, h: 600 },
  { minView: 1280, w: 720, h: 440 },
  { minView: 768, w: 480, h: 360 },
  { minView: 0, w: 320, h: 280 },
];

/** The default size for a viewport width. */
export function defaultSize(viewWidth: number): { w: number; h: number } {
  const size = DEFAULT_SIZES.find((s) => viewWidth >= s.minView) ?? DEFAULT_SIZES[3];
  return { w: size?.w ?? 320, h: size?.h ?? 280 };
}
/** Keeps a window wholly on screen, and within its limits: its corner can always be reached. */
export function clampBox(box: Box, view: View): Box {
  const room = Math.max(1, view.w - 2 * GAP);
  const w = Math.min(Math.max(box.w, Math.min(MIN_W, room)), room);
  const x = Math.min(Math.max(box.x, GAP), Math.max(GAP, view.w - w - GAP));
  // Low enough that at least its smallest height fits below it.
  const y = Math.min(Math.max(box.y, GAP), Math.max(GAP, view.h - MIN_H - GAP));
  const h =
    box.h === null ? null : Math.min(Math.max(box.h, MIN_H), Math.max(MIN_H, view.h - y - GAP));
  return { x, y, w, h };
}

/** Where it first opens: its default size, centered in the viewport (whatever the button's place). */
export function startBox(view: View): Box {
  const size = defaultSize(view.w);
  const w = Math.min(size.w, view.w - 2 * GAP);
  const h = Math.min(size.h, Math.max(MIN_H, view.h - 2 * GAP));
  return clampBox({ x: (view.w - w) / 2, y: (view.h - h) / 2, w, h }, view);
}

/** Dragged so the point held (`grab`, from the window's corner) is at `to`. */
export function movedBox(
  box: Box,
  grab: { x: number; y: number },
  to: { x: number; y: number },
  view: View,
): Box {
  return clampBox({ ...box, x: to.x - grab.x, y: to.y - grab.y }, view);
}

/** Resized from its bottom right corner by `dx` and `dy` from how big it was when it was held. */
export function resizedBox(
  box: Box,
  from: { w: number; h: number },
  dx: number,
  dy: number,
  view: View,
): Box {
  const next = { ...box, w: from.w + dx, h: from.h + dy };
  // Never past the window's edge: the right and bottom limits depend on where it is.
  const w = Math.min(next.w, view.w - GAP - box.x);
  const h = Math.min(next.h, view.h - GAP - box.y);
  return clampBox({ ...box, w, h }, view);
}

/** A saved window, if what's stored is one. */
export function readBox(raw: string | null): Box | null {
  try {
    const v = JSON.parse(raw ?? "null") as Partial<Record<keyof Box, unknown>> | null;
    if (!v || ![v.x, v.y, v.w].every((n) => typeof n === "number" && Number.isFinite(n)))
      return null;
    const h = typeof v.h === "number" && Number.isFinite(v.h) ? v.h : null;
    return { x: v.x as number, y: v.y as number, w: v.w as number, h };
  } catch {
    return null;
  }
}
