import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("fonts", () => {
  it("globals.css does not name either font family directly", async () => {
    const css = await readFile(
      join(process.cwd(), "app", "globals.css"),
      "utf-8",
    );
    expect(css, "globals.css must not name Newsreader").not.toMatch(
      /Newsreader/,
    );
    expect(css, "globals.css must not name Instrument Sans").not.toMatch(
      /Instrument Sans/,
    );
    expect(css).toContain("var(--font-serif)");
    expect(css).toContain("var(--font-sans)");
  });

  it("app/layout.tsx applies font variables on the <html> element", async () => {
    const layout = await readFile(
      join(process.cwd(), "app", "layout.tsx"),
      "utf-8",
    );
    const htmlTag = layout.match(/<html[^>]*>/)?.[0] ?? "";
    expect(htmlTag, "<html> must apply serif.variable").toContain(
      "serif.variable",
    );
    expect(htmlTag, "<html> must apply sans.variable").toContain(
      "sans.variable",
    );
  });
});
