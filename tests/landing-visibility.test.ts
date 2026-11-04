import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncVisibility } from "@/lib/landing";

describe("landing visibility sync", () => {
  it("writes the first tick whether the frame is shown or hidden", () => {
    // The cache starts unknown, so the first frame always takes effect.
    expect(syncVisibility(undefined, true)).toBe(true);
    expect(syncVisibility(undefined, false)).toBe(true);
  });

  it("writes later ticks only when the state flips", () => {
    expect(syncVisibility(true, true)).toBe(false);
    expect(syncVisibility(false, false)).toBe(false);
    expect(syncVisibility(true, false)).toBe(true);
    expect(syncVisibility(false, true)).toBe(true);
  });

  it("makes a shown first frame visible when the element starts hidden", () => {
    // Mirrors the engine: the server markup renders hidden and the cache
    // starts unknown, so a shown first frame must write `visible`.
    const el = { visibility: "hidden" };
    const cache = new Map<number, boolean>();
    const shown = true;
    if (syncVisibility(cache.get(0), shown)) {
      cache.set(0, shown);
      el.visibility = shown ? "visible" : "hidden";
    }
    expect(el.visibility).toBe("visible");
  });

  it("keeps a hidden first frame hidden", () => {
    const el = { visibility: "hidden" };
    const cache = new Map<number, boolean>();
    const shown = false;
    if (syncVisibility(cache.get(0), shown)) {
      cache.set(0, shown);
      el.visibility = shown ? "visible" : "hidden";
    }
    expect(el.visibility).toBe("hidden");
  });

  it("routes every visibility write through the helper", async () => {
    const src = await readFile(
      join(process.cwd(), "components", "landing", "LandingPage.tsx"),
      "utf-8",
    );
    expect(src).not.toContain("?? true");
    for (const site of [
      "v.card.get(card.id)",
      "v.flag.get(card.id)",
      "v.extra.get(100 + card.id)",
      "v.copy.get(ch)",
      "v.extra.get(ch)",
      "v.cap",
      "v.head",
      "v.hero",
      "v.hint",
      "v.close",
    ]) {
      expect(src).toContain(`syncVisibility(${site},`);
    }
  });
});
