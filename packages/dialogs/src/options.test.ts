import { describe, expect, it } from "vitest";
import { messagePieces, resolveAlert, resolveConfirm, resolveModal } from "./options.ts";

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

describe("vision §3.6: a dialog's message is text, with bold the only markup", () => {
  it("shows **double asterisks** and <strong> tags bold", () => {
    expect(messagePieces("Use **HTML** or <strong>BBCode</strong> here.")).toEqual([
      { text: "Use ", bold: false },
      { text: "HTML", bold: true },
      { text: " or ", bold: false },
      { text: "BBCode", bold: true },
      { text: " here.", bold: false },
    ]);
  });

  it("keeps line breaks, and a message with no markup as one plain piece", () => {
    expect(messagePieces("One\n\n**Two**\nThree")).toEqual([
      { text: "One\n\n", bold: false },
      { text: "Two", bold: true },
      { text: "\nThree", bold: false },
    ]);
    expect(messagePieces("Plain")).toEqual([{ text: "Plain", bold: false }]);
    expect(messagePieces("")).toEqual([]);
  });

  it("leaves every other tag as the plain text it was written as", () => {
    expect(messagePieces("<img src=x onerror=alert(1)> and <b>b</b> and **<i>x</i>**")).toEqual([
      { text: "<img src=x onerror=alert(1)> and <b>b</b> and ", bold: false },
      { text: "<i>x</i>", bold: true },
    ]);
    expect(messagePieces("an unclosed **star")).toEqual([
      { text: "an unclosed **star", bold: false },
    ]);
  });
});
