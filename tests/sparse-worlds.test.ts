import { describe, expect, it } from "vitest";
import { WorldSchema } from "@/lib/world/schemas";
import { planAgentFiles } from "@/lib/package";

describe("planAgentFiles on sparse worlds", () => {
  it("handles a valid world with empty lists", () => {
    const world = WorldSchema.parse({
      id: "empty-story",
      title: "Empty Story",
      premise: "Nothing yet.",
      logline: "Nothing yet.",
      characters: [],
      locations: [],
      channels: [],
      parts: [],
      beats: [],
      secrets: [],
      gaps: [],
    });
    expect(() => planAgentFiles(world, "")).not.toThrow();
    expect(planAgentFiles(world, "missing")).toEqual([]);
  });

  it("handles a channel with no beats or parts", () => {
    const world = WorldSchema.parse({
      id: "thin-story",
      title: "Thin Story",
      premise: "A premise.",
      logline: "A logline.",
      characters: [],
      locations: [],
      channels: [
        { id: "series", name: "Series", kind: "series", title: "The Series" },
      ],
      parts: [],
      beats: [],
      secrets: [],
      gaps: [],
    });
    const files = planAgentFiles(world, "series");
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.missing)).toBe(false);
  });
});
