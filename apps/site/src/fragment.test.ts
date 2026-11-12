import { describe, expect, it } from "vitest";
import { type FragmentContext, renderFragment } from "./fragment.ts";

const context: FragmentContext = {
  where: "test.html",
  values: { site: "https://reader.example", contactEmail: null, name: 'a "b" <c>' },
  topicUrl: (id) => (id === "pin" ? "../pin/" : null),
  image: (name) => (name === "a.png" ? { url: "/assets/a.1.png", width: 10, height: 5 } : null),
};

describe("content fragments", () => {
  it("fills in settings, escaped", () => {
    expect(renderFragment("<p>{{site}} {{name}}</p>", context).html).toBe(
      "<p>https://reader.example a &quot;b&quot; &lt;c&gt;</p>",
    );
  });

  it("keeps the part of an {{#if}} that applies", () => {
    const source = "{{#if contactEmail}}write to {{contactEmail}}{{else}}no address{{/if}}";
    expect(renderFragment(source, context).html).toBe("no address");
    expect(renderFragment("{{#if site}}yes{{/if}}", context).html).toBe("yes");
  });

  it("refuses a setting that doesn't exist, or one that isn't set outside an {{#if}}", () => {
    expect(() => renderFragment("{{nope}}", context)).toThrow("isn't a setting");
    expect(() => renderFragment("{{contactEmail}}", context)).toThrow("isn't set");
  });

  it("links topics by id, and refuses a topic that doesn't exist", () => {
    expect(renderFragment('<a href="topic:pin#unpinning">x</a>', context).html).toBe(
      '<a href="../pin/#unpinning">x</a>',
    );
    expect(() => renderFragment('<a href="topic:gone">x</a>', context)).toThrow("gone");
  });

  it("gives a screenshot its address, size and lazy loading, and needs its alt text", () => {
    expect(renderFragment('<img src="images/a.png" alt="A tooltip.">', context).html).toBe(
      '<img src="/assets/a.1.png" width="10" height="5" alt="A tooltip." loading="lazy" decoding="async">',
    );
    expect(() => renderFragment('<img src="images/a.png">', context)).toThrow("alt");
    expect(() => renderFragment('<img src="images/b.png" alt="x">', context)).toThrow("exist");
  });

  it("gives headings an id from their words, each its own", () => {
    const r = renderFragment(
      "<h2>Keep it <em>open</em></h2><h3>Keep it open</h3><p>Text</p>",
      context,
    );
    expect(r.headings).toEqual([
      ["keep-it-open", "Keep it open"],
      ["keep-it-open-2", "Keep it open"],
    ]);
    expect(r.html).toContain('<h2 id="keep-it-open">Keep it <em>open</em></h2>');
    expect(r.text).toBe("Keep it open Keep it open Text");
  });
});
