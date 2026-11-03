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
});
