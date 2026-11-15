import { describe, expect, it } from "vitest";
import { resolveAlert, resolveConfirm } from "./options.ts";

describe("vision §3.6: the shared dialogs' words and focus", () => {
  it("an alert has one button, with its focus", () => {
    expect(resolveAlert({ title: "Saved" })).toEqual({
      title: "Saved",
      message: "",
      confirmLabel: "OK",
      cancelLabel: "",
      danger: false,
      focus: "confirm",
    });
    expect(resolveAlert({ title: "x", okLabel: "Got it" }).confirmLabel).toBe("Got it");
  });

  it("a confirm has two, and starts on the one that goes ahead", () => {
    const r = resolveConfirm({ title: "Go on?", message: "Really.", confirmLabel: "Go" });
    expect(r).toMatchObject({ confirmLabel: "Go", cancelLabel: "Cancel", focus: "confirm" });
  });

  it("a confirm about something hard to undo starts on Cancel", () => {
    expect(resolveConfirm({ title: "Delete?", danger: true })).toMatchObject({
      danger: true,
      focus: "cancel",
    });
  });
});
