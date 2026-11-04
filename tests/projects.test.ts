import { afterEach, describe, expect, it } from "vitest";
import { WorldSchema, type World } from "@/lib/world/schemas";
import {
  canonTextFor,
  createProjectId,
  deleteProject,
  ensureSample,
  getEntry,
  listEntries,
  loadStoredWorld,
  mergeWorldAssets,
  resetSample,
  saveProject,
  timeAgo,
  SAMPLE_ID,
} from "@/lib/projects";
import seed from "@/data/seed/anukili.json";

function stubLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as unknown as Record<string, unknown>).window = {
    localStorage: {
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

function seedWorld(): World {
  return WorldSchema.parse(seed);
}

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).window;
});

describe("projects store", () => {
  it("gives every new world a unique id even for the same title", () => {
    expect(createProjectId("My Story")).not.toBe(createProjectId("My Story"));
    expect(createProjectId("My Story")).toMatch(/^my-story-[a-z0-9]{6}$/);
  });

  it("keeps the sample under the seed id and lists it first", () => {
    stubLocalStorage();
    const entry = ensureSample(seedWorld());
    expect(entry.id).toBe(SAMPLE_ID);
    expect(entry.title).toBe("Anukili Ugama");
    expect(getEntry(SAMPLE_ID)?.sample).toBe(true);
    expect(loadStoredWorld(SAMPLE_ID)?.title).toBe(seedWorld().title);
  });

  it("saves separate worlds under their own keys", () => {
    stubLocalStorage();
    ensureSample(seedWorld());
    const first = { ...seedWorld(), id: "river-tales-aaaaaa", title: "River Tales" };
    const second = { ...seedWorld(), id: "river-tales-bbbbbb", title: "River Tales" };
    saveProject(first);
    saveProject(second);
    expect(listEntries().map((e) => e.id).sort()).toContain("river-tales-aaaaaa");
    expect(listEntries().map((e) => e.id).sort()).toContain("river-tales-bbbbbb");
    expect(loadStoredWorld("river-tales-aaaaaa")?.title).toBe("River Tales");
  });

  it("discards an entry that fails the schema without crashing", () => {
    const store = stubLocalStorage();
    store.set(
      "storyverse-project-broken-story",
      JSON.stringify({ id: 1, title: [] }),
    );
    store.set(
      "storyverse-projects-v1",
      JSON.stringify([
        {
          id: "broken-story",
          title: "Broken",
          updatedAt: Date.now(),
          sample: false,
          cover: "",
          channelsConfirmed: false,
        },
      ]),
    );
    expect(loadStoredWorld("broken-story")).toBeNull();
    expect(store.get("storyverse-project-broken-story")).toBeUndefined();
  });

  it("ignores a corrupt index without crashing", () => {
    const store = stubLocalStorage();
    store.set("storyverse-projects-v1", "not json{{{");
    expect(listEntries()).toEqual([]);
  });

  it("deletes a project and resets the sample to the seed", () => {
    stubLocalStorage();
    ensureSample(seedWorld());
    saveProject({ ...seedWorld(), id: "temp-story-123456", title: "Temp" });
    deleteProject("temp-story-123456");
    expect(getEntry("temp-story-123456")).toBeNull();
    expect(loadStoredWorld("temp-story-123456")).toBeNull();

    saveProject({ ...seedWorld(), id: SAMPLE_ID, title: "Changed MARKER" });
    resetSample(seedWorld());
    expect(getEntry(SAMPLE_ID)?.title).toBe("Anukili Ugama");
    expect(loadStoredWorld(SAMPLE_ID)?.title).toBe(seedWorld().title);
  });

  it("formats relative edit times", () => {
    const now = Date.now();
    expect(timeAgo(now - 10_000, now)).toBe("Edited just now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("Edited 5m ago");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("Edited 3h ago");
    expect(timeAgo(now - 4 * 86_400_000, now)).toBe("Edited 4d ago");
  });
});

describe("mergeWorldAssets", () => {
  it("keeps art and sheets for matching names, case-insensitively", () => {
    const oldWorld: World = {
      ...seedWorld(),
      characters: [
        {
          id: "c1",
          name: "Anukili Ugama",
          canon: "old canon",
          artPath: "/anukili/storm.webp",
          sheet: [{ view: "front", imagePath: "sheet-front", cutoutPath: "cut-front" }],
        },
      ],
      parts: [
        {
          id: "p1",
          order: 1,
          title: "The Birth",
          summary: "old",
          excerpt: "old",
          text: "old text",
          imagePath: "old-art",
          imagePosition: "center",
          tint: "#e9e0ce",
          characterIds: [],
        },
      ],
    };
    const nextWorld: World = {
      ...seedWorld(),
      characters: [
        { id: "c9", name: "anukili ugama", canon: "new canon", sheet: [] },
        { id: "c10", name: "Someone New", canon: "new", sheet: [] },
      ],
      parts: [
        {
          id: "p9",
          order: 1,
          title: "the birth",
          summary: "new",
          excerpt: "new",
          text: "",
          imagePath: "",
          imagePosition: "",
          tint: "#e9e0ce",
          characterIds: [],
        },
      ],
    };
    const merged = mergeWorldAssets(oldWorld, nextWorld);
    const kept = merged.characters.find((c) => c.name === "anukili ugama");
    expect(kept?.artPath).toBe("/anukili/storm.webp");
    expect(kept?.sheet).toEqual([
      { view: "front", imagePath: "sheet-front", cutoutPath: "cut-front" },
    ]);
    expect(
      merged.characters.find((c) => c.name === "Someone New")?.artPath,
    ).toBeUndefined();
    const part = merged.parts.find((p) => p.title === "the birth");
    expect(part?.imagePath).toBe("old-art");
    expect(part?.imagePosition).toBe("center");
  });
});

describe("canonTextFor", () => {
  it("holds parts, characters and locations for current-story.txt", () => {
    const text = canonTextFor(seedWorld());
    expect(text).toContain(seedWorld().title);
    expect(text).toContain("Parts:");
    expect(text).toContain("Characters:");
    expect(text).toContain("Locations:");
    expect(text).toContain(seedWorld().characters[0].name);
  });
});
