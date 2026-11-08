import { describe, expect, it } from "vitest";
import { CHOICES_KEY, createChoices } from "./choices.ts";

/** A minimal Storage that can be made to refuse. */
function memory(options: { refuse?: boolean } = {}): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => {
      if (options.refuse) throw new Error("full");
      data.set(k, v);
    },
  };
}

describe("vision §3.6: the reader's translation choices", () => {
  it("keeps each passage's choice in the browser's storage, and finds it again later", () => {
    const storage = memory();
    const first = createChoices(storage);
    expect(first.get("John.3.16")).toBeUndefined();
    first.set("John.3.16", "bsb");
    first.set("Rom.5.8", "leb");
    // A reload: a new store over the same storage.
    const later = createChoices(storage);
    expect(later.get("John.3.16")).toBe("bsb");
    expect(later.get("Rom.5.8")).toBe("leb");
    expect(JSON.parse(storage.getItem(CHOICES_KEY) ?? "{}")).toEqual({
      "John.3.16": "bsb",
      "Rom.5.8": "leb",
    });
  });

  it("changes a passage's choice without touching another's", () => {
    const choices = createChoices(memory());
    choices.set("John.3.16", "bsb");
    choices.set("Rom.5.8", "leb");
    choices.set("John.3.16", "eng-kjv");
    expect([choices.get("John.3.16"), choices.get("Rom.5.8")]).toEqual(["eng-kjv", "leb"]);
  });

  it("keeps the most recent 500 and lets the oldest go", () => {
    const storage = memory();
    const choices = createChoices(storage);
    for (let i = 0; i < 520; i++) choices.set(`Gen.1.${i}`, "bsb");
    const kept = JSON.parse(storage.getItem(CHOICES_KEY) ?? "{}") as Record<string, string>;
    expect(Object.keys(kept)).toHaveLength(500);
    expect(kept["Gen.1.0"]).toBeUndefined();
    expect(kept["Gen.1.519"]).toBe("bsb");
  });

  it("ignores damaged storage, and holds for the page where storage is missing or refuses", () => {
    const damaged = memory();
    damaged.setItem(CHOICES_KEY, "{not json");
    expect(createChoices(damaged).get("John.3.16")).toBeUndefined();
    const odd = memory();
    odd.setItem(CHOICES_KEY, JSON.stringify({ "John.3.16": 7, "Rom.5.8": "leb" }));
    expect([createChoices(odd).get("John.3.16"), createChoices(odd).get("Rom.5.8")]).toEqual([
      undefined,
      "leb",
    ]);
    for (const storage of [null, memory({ refuse: true })]) {
      const choices = createChoices(storage);
      choices.set("John.3.16", "bsb");
      expect(choices.get("John.3.16")).toBe("bsb");
    }
  });
});
