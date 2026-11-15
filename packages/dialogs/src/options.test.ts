import { describe, expect, it } from "vitest";
import { resolveAlert, resolveConfirm, resolveModal } from "./options.ts";

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

describe("vision §3.6: a modal with content of the caller's own", () => {
  const content = {} as Node;
  it("closes with Done, at a usual width", () => {
    expect(resolveModal({ title: "Sites", content })).toEqual({
      title: "Sites",
      closeLabel: "Done",
      stylesheets: [],
      width: 560,
    });
  });
  it("keeps its width within reason", () => {
    expect(resolveModal({ title: "x", content, width: 10 }).width).toBe(320);
    expect(resolveModal({ title: "x", content, width: 5000 }).width).toBe(900);
    expect(resolveModal({ title: "x", content, width: 640.4 }).width).toBe(640);
  });
});
