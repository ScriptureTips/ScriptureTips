import { describe, expect, it } from "vitest";
import { fit } from "./generator-window.ts";

const view = { width: 1000, height: 700 };

describe("vision §3.6: the link generator's window stays where it can be used", () => {
  it("leaves a frame that fits as it is", () => {
    const frame = { x: 100, y: 80, width: 420, height: 400 };
    expect(fit(frame, view)).toEqual(frame);
  });

  it("keeps the window inside the page, whichever way it was dragged", () => {
    expect(fit({ x: -500, y: -90, width: 420, height: 400 }, view)).toMatchObject({ x: 8, y: 8 });
    expect(fit({ x: 5000, y: 5000, width: 420, height: 400 }, view)).toMatchObject({
      x: 1000 - 420 - 8,
      y: 700 - 400 - 8,
    });
  });

  it("is never smaller than the least that works, or larger than the page", () => {
    expect(fit({ x: 0, y: 0, width: 50, height: 20 }, view)).toMatchObject({
      width: 340,
      height: 380,
    });
    expect(fit({ x: 0, y: 0, width: 5000, height: 5000 }, view)).toMatchObject({
      width: 984,
      height: 684,
    });
  });
});
