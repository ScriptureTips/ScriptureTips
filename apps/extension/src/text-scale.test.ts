import { describe, expect, it } from "vitest";
import { DEFAULT_TEXT_SCALE, normalScale, percent, stepScale, TEXT_SCALES } from "./text-scale.ts";

describe("vision §3.6: the text size of the passage tooltips", () => {
  it("has the normal size among its steps, which are in order", () => {
    expect(TEXT_SCALES).toContain(DEFAULT_TEXT_SCALE);
    expect([...TEXT_SCALES]).toEqual([...TEXT_SCALES].sort((a, b) => a - b));
  });

  it("steps larger and smaller, and stops at each end", () => {
    expect(stepScale(1, 1)).toBe(1.15);
    expect(stepScale(1, -1)).toBe(0.85);
    expect(stepScale(0.85, -1)).toBe(0.85);
    expect(stepScale(2, 1)).toBe(2);
    // From the smallest to the largest and back, one step at a time.
    let scale = TEXT_SCALES[0] as number;
    for (let i = 1; i < TEXT_SCALES.length; i++) scale = stepScale(scale, 1);
    expect(scale).toBe(2);
    for (let i = 1; i < TEXT_SCALES.length; i++) scale = stepScale(scale, -1);
    expect(scale).toBe(0.85);
  });

  it("reads anything stored as a step, and what isn't a number as the normal size", () => {
    expect(normalScale(1.3)).toBe(1.3);
    expect(normalScale(1.42)).toBe(1.5);
    expect(normalScale(1.33)).toBe(1.3);
    expect(normalScale(99)).toBe(2);
    expect(normalScale(-3)).toBe(0.85);
    for (const bad of [undefined, null, "big", NaN, Infinity, {}, []])
      expect(normalScale(bad)).toBe(1);
  });

  it("shows a size as a percentage", () => {
    expect(percent(1)).toBe("100%");
    expect(percent(1.15)).toBe("115%");
    expect(percent(0.85)).toBe("85%");
  });
});
