import { describe, expect, it } from "vitest";
import { accountsOpenFrom, contactEmailFrom } from "./instance.ts";

describe("instance settings (vision §7.1, §10 extension release)", () => {
  it("has accounts open unless ACCOUNTS says closed", () => {
    expect(accountsOpenFrom(undefined)).toBe(true);
    expect(accountsOpenFrom("")).toBe(true);
    expect(accountsOpenFrom("open")).toBe(true);
    expect(accountsOpenFrom("closed")).toBe(false);
  });

  it("refuses any other ACCOUNTS, so a typo can't open accounts", () => {
    expect(() => accountsOpenFrom("Closed")).toThrow(/ACCOUNTS/);
  });

  it("takes one contact address, or none", () => {
    expect(contactEmailFrom(undefined)).toBeNull();
    expect(contactEmailFrom("  ")).toBeNull();
    expect(contactEmailFrom(" hello@example.org ")).toBe("hello@example.org");
    expect(() => contactEmailFrom("hello")).toThrow(/CONTACT_EMAIL/);
    expect(() => contactEmailFrom("a@b.org, c@d.org")).toThrow(/CONTACT_EMAIL/);
  });
});
