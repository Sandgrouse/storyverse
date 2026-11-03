import { afterEach, describe, expect, it } from "vitest";
import { WorldSchema, type World } from "@/lib/world/schemas";
import {
  hydrateWorld,
  loadPersistedWorld,
  persistWorld,
} from "@/lib/story";
import { planAgentFiles } from "@/lib/package";
import seed from "@/data/seed/anukili.json";

function stubSession() {
  const store = new Map<string, string>();
  (globalThis as unknown as Record<string, unknown>).window = {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  };
  return store;
}

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).window;
});

describe("loadPersistedWorld validation", () => {
  it("discards stored text that is not JSON", () => {
    const store = stubSession();
    store.set("storyverse-world-v1", "not json{{{");
    expect(loadPersistedWorld()).toBeNull();
    expect(store.get("storyverse-world-v1")).toBeUndefined();
  });

  it("discards a stored world that fails the schema", () => {
    const store = stubSession();
    store.set(
      "storyverse-world-v1",
      JSON.stringify({ world: { id: 1, title: [] }, sample: false }),
    );
    expect(loadPersistedWorld()).toBeNull();
    expect(store.get("storyverse-world-v1")).toBeUndefined();
  });

  it("loads a world saved before packs existed", () => {
    stubSession();
    const full = WorldSchema.parse(seed);
    const { packs: _dropped, ...withoutPacks } = full;
    void _dropped;
    persistWorld(withoutPacks as World, false);
    const loaded = loadPersistedWorld();
    expect(loaded?.world.packs).toEqual([]);
    expect(loaded?.world.title).toBe(full.title);
  });

  it("round-trips images through the image store", async () => {
    stubSession();
    const full = WorldSchema.parse(seed);
    const withArt: World = {
      ...full,
      characters: full.characters.map((c) => ({
        ...c,
        artPath: "data:image/webp;base64,QUJD",
      })),
    };
    persistWorld(withArt, true);
    const loaded = loadPersistedWorld();
    expect(loaded?.sample).toBe(true);
    expect(loaded?.world.characters[0]?.artPath?.startsWith("idb:")).toBe(true);
    const hydrated = await hydrateWorld(loaded?.world ?? withArt);
    expect(hydrated.characters[0]?.artPath).toBe(
      "data:image/webp;base64,QUJD",
    );
  });
});

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
