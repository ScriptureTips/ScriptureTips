import { ext } from "./browser.ts";
import { GENERATOR_HTML, mountGenerator } from "./generator.ts";
import type { Settings } from "./settings.ts";

/**
 * The link generator as a window on the web page (vision §3.6): opened from the toolbar popup, the
 * reader drags it by its title bar and resizes it by its corner, and writes in it beside the page
 * they're reading. Like the tooltip it is the extension's, not the page's: its host element is
 * reset inline with `!important`, it lives in a shadow root, and every size is in pixels, in its
 * own font, so no page style reaches it.
 */
const FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
const KEY = "generatorWindow";
const MIN = { width: 340, height: 380 };
const MARGIN = 8;
/** Under the passage tooltips (2147483000 + ...), over nearly everything else. */
const LAYER = 2147482900;

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A frame kept inside the window, no smaller than the least that works, its title bar reachable. */
export function fit(frame: Frame, view: { width: number; height: number }): Frame {
  const width = Math.max(MIN.width, Math.min(frame.width, view.width - 2 * MARGIN));
  const height = Math.max(MIN.height, Math.min(frame.height, view.height - 2 * MARGIN));
  return {
    width,
    height,
    x: Math.max(MARGIN, Math.min(frame.x, view.width - width - MARGIN)),
    y: Math.max(MARGIN, Math.min(frame.y, view.height - height - MARGIN)),
  };
}

const STYLES = `
  :host { all: initial; }
  .win {
    position: fixed; z-index: ${LAYER}; box-sizing: border-box; display: flex; flex-direction: column;
    min-width: ${MIN.width}px; min-height: ${MIN.height}px;
    font: 400 14px/1.45 ${FONT}; color: #1d232a; background: #fff;
    border: 1px solid #c9d0d6; border-radius: 8px; box-shadow: 0 10px 30px rgb(0 30 60 / 0.3);
    overflow: hidden; direction: ltr; text-align: start; letter-spacing: normal; text-transform: none;
  }
  .bar {
    flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 6px 8px 6px 12px; cursor: move; user-select: none; touch-action: none;
    background: #eef3f8; border-bottom: 1px solid #dfe3e6;
  }
  .bar h2 { margin: 0; font-size: 14px; font-weight: 600; }
  .close {
    width: 26px; height: 26px; padding: 0; cursor: pointer; font: inherit; font-size: 18px; line-height: 1;
    color: #5b6672; background: transparent; border: 1px solid transparent; border-radius: 4px;
  }
  .close:hover { border-color: #c9d0d6; color: #1d232a; }
  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; padding: 10px 12px 14px; overflow: auto; }
  .hint, .status { margin: 0; color: #5b6672; font-size: 13px; }
  label { font-weight: 600; font-size: 13px; }
  textarea {
    flex: 1; min-height: 80px; box-sizing: border-box; width: 100%; resize: none; padding: 6px 8px;
    font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: inherit; background: #fff;
    border: 1px solid #c9d0d6; border-radius: 4px;
  }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
  select {
    font: inherit; color: inherit; background: #fff; border: 1px solid #c9d0d6; border-radius: 4px; padding: 3px 4px; max-width: 100%;
  }
  button { font: inherit; padding: 4px 10px; cursor: pointer; color: #fff; background: #0054a5; border: 1px solid #0054a5; border-radius: 4px; }
  button.quiet { color: #0054a5; background: transparent; border-color: #c9d0d6; }
  button:disabled { opacity: 0.5; cursor: default; }
  button.close { padding: 0; }
  button.icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; }
  button.icon svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linejoin: round; }
  a:focus-visible, button:focus-visible, select:focus-visible, textarea:focus-visible, .grip:focus-visible {
    outline: 2px solid #0054a5; outline-offset: 1px;
  }
  .grip {
    position: absolute; right: 0; bottom: 0; width: 18px; height: 18px; cursor: nwse-resize; touch-action: none;
    background: linear-gradient(135deg, transparent 0 50%, #8a97a3 50% 58%, transparent 58% 70%, #8a97a3 70% 78%, transparent 78%);
  }
  @media (prefers-color-scheme: dark) {
    .win { color: #e8edf2; background: #161b21; border-color: #3a434c; }
    .bar { background: #1f2630; border-color: #3a434c; }
    .close { color: #a8b3be; } .close:hover { color: #e8edf2; border-color: #3a434c; }
    .hint, .status { color: #a8b3be; }
    textarea, select { background: #0f1317; border-color: #3a434c; }
    button { color: #0f1317; background: #7cc4ff; border-color: #7cc4ff; }
    button.quiet { color: #7cc4ff; background: transparent; border-color: #3a434c; }
  }
  @media print { .win { display: none; } }
`;

let open: { host: HTMLElement; focus(): void } | null = null;

const view = () => ({ width: window.innerWidth, height: window.innerHeight });

async function loadFrame(): Promise<Frame> {
  const initial = { width: 420, height: 400, x: window.innerWidth - 420 - 24, y: 24 };
  try {
    const got = (await ext.storage.local.get(KEY))[KEY] as Partial<Frame> | undefined;
    if (got && [got.x, got.y, got.width, got.height].every((n) => Number.isFinite(n))) {
      return fit(got as Frame, view());
    }
  } catch {
    // Nothing kept: the first place.
  }
  return fit(initial, view());
}

/** Opens the generator on this page, or brings the one that's open forward. */
export async function openGeneratorWindow(settings: Settings): Promise<void> {
  if (open?.host.isConnected) {
    open.focus();
    return;
  }
  let frame = await loadFrame();

  const host = document.createElement("div");
  host.className = "st-generator-host";
  const reset = (property: string, value: string) =>
    host.style.setProperty(property, value, "important");
  reset("all", "initial");
  reset("direction", "ltr");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${STYLES}</style>
    <div class="win" role="dialog" aria-label="Link generator">
      <div class="bar"><h2>Link generator</h2>
        <button type="button" class="close" aria-label="Close the link generator" title="Close">×</button></div>
      <div class="body">${GENERATOR_HTML}</div>
      <div class="grip" role="separator" tabindex="0" aria-label="Resize the window: drag, or use the arrow keys" title="Drag to resize"></div>
    </div>`;
  const win = root.querySelector<HTMLElement>(".win") as HTMLElement;
  const bar = root.querySelector<HTMLElement>(".bar") as HTMLElement;
  const grip = root.querySelector<HTMLElement>(".grip") as HTMLElement;
  const close = root.querySelector<HTMLButtonElement>(".close") as HTMLButtonElement;
  const text = mountGenerator(root, settings, () => {
    // A page's script can't open the settings; the background does.
    void ext.runtime.sendMessage({ type: "open-options" }).catch(() => undefined);
  });

  const place = () => {
    win.style.left = `${frame.x}px`;
    win.style.top = `${frame.y}px`;
    win.style.width = `${frame.width}px`;
    win.style.height = `${frame.height}px`;
  };
  const remember = () => void ext.storage.local.set({ [KEY]: frame }).catch(() => undefined);
  const set = (next: Frame) => {
    frame = fit(next, view());
    place();
  };
  place();

  // Dragging by the title bar; resizing by the corner. Pointer capture keeps the gesture even when
  // the pointer leaves the window or goes over a page's own elements.
  const gesture = (
    handle: HTMLElement,
    move: (dx: number, dy: number, from: Frame) => Frame,
    skip?: (target: EventTarget | null) => boolean,
  ) => {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || skip?.(event.target)) return;
      event.preventDefault();
      const from = frame;
      const [startX, startY] = [event.clientX, event.clientY];
      handle.setPointerCapture(event.pointerId);
      const onMove = (e: PointerEvent) => set(move(e.clientX - startX, e.clientY - startY, from));
      const end = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        remember();
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
  };
  gesture(
    bar,
    (dx, dy, from) => ({ ...from, x: from.x + dx, y: from.y + dy }),
    (target) => target instanceof Element && target.closest("button") !== null,
  );
  gesture(grip, (dx, dy, from) => ({ ...from, width: from.width + dx, height: from.height + dy }));
  // The same by keyboard: arrows on the grip resize (Shift for larger steps).
  grip.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 50 : 10;
    const by: Record<string, [number, number]> = {
      ArrowRight: [step, 0],
      ArrowLeft: [-step, 0],
      ArrowDown: [0, step],
      ArrowUp: [0, -step],
    };
    const delta = by[event.key];
    if (!delta) return;
    event.preventDefault();
    set({ ...frame, width: frame.width + delta[0], height: frame.height + delta[1] });
    remember();
  });

  const onResize = () => set(frame);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && root.activeElement) shut();
  };
  const shut = () => {
    window.removeEventListener("resize", onResize);
    host.remove();
    open = null;
  };
  close.addEventListener("click", shut);
  win.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);

  document.documentElement.append(host);
  open = { host, focus: () => text.focus() };
  text.focus();
}
