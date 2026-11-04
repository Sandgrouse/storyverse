import { afterEach, describe, expect, it } from "vitest";
import { WorldSchema, type World } from "@/lib/world/schemas";
import {
  SAMPLE_ID,
  loadProject,
  loadStoredWorld,
  saveProject,
  upgradeSampleWorld,
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

/** A stored copy from before facts and part text existed. */
function oldSampleWorld(): World {
  const world = seedWorld();
  return WorldSchema.parse({
    ...JSON.parse(JSON.stringify(world)),
    facts: [],
    parts: world.parts.map((part) => ({ ...part, text: "" })),
  });
}

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).window;
});

describe("upgradeSampleWorld", () => {
  it("fills facts and part text that an old sample lacks", () => {
    const { world, upgraded } = upgradeSampleWorld(oldSampleWorld(), seedWorld());
    expect(upgraded).toBe(true);
    expect(world.facts).toEqual(seedWorld().facts);
    expect(world.facts.length).toBeGreaterThan(0);
    for (const part of world.parts) {
      const expected = seedWorld().parts.find((p) => p.id === part.id)?.text ?? "";
      expect(expected.length).toBeGreaterThan(0);
      expect(part.text).toBe(expected);
    }
  });

  it("leaves a sample whose facts are already there alone", () => {
    const edited: World = WorldSchema.parse({
      ...JSON.parse(JSON.stringify(oldSampleWorld())),
      facts: [{ id: "fact-genre", label: "Genre", value: "Edited by the owner", source: "you" }],
    });
    const { world, upgraded } = upgradeSampleWorld(edited, seedWorld());
    expect(upgraded).toBe(true);
    expect(world.facts).toEqual(edited.facts);
    for (const part of world.parts) {
      const expected = seedWorld().parts.find((p) => p.id === part.id)?.text ?? "";
      expect(part.text).toBe(expected);
    }
  });

  it("keeps art, scripts, storyboards, shorts, voices, lines, secrets and canon changes", () => {
    const stored = oldSampleWorld();
    stored.parts[0].imagePath = "/owner/part-art.webp";
    stored.characters[0].artPath = "/owner/hero.webp";
    stored.characters[0].voice = { id: "v1", name: "Hero voice" };
    stored.characters[0].lines = [{ id: "l1", text: "I am here.", audioPath: "/owner/line.mp3" }];
    stored.scripts = [{ channelId: "c1", partId: stored.parts[0].id, text: "Owner script", updatedAt: 1, form: "script" }];
    stored.storyboards = [
      { id: "b1", channelId: "c1", partId: stored.parts[0].id, title: "Board", frames: [] },
    ];
    stored.shorts = [
      { id: "s1", channelId: "c1", partId: stored.parts[0].id, title: "Short", aspect: "16:9", shots: [] },
    ];
    stored.secrets = [{ id: "x1", text: "Owner secret", knownThrough: [], note: "Kept", suggested: false }];
    stored.canonChanges = ["Owner changed the ending"];
    const { world } = upgradeSampleWorld(stored, seedWorld());
    expect(world.parts[0].imagePath).toBe("/owner/part-art.webp");
    expect(world.characters[0].artPath).toBe("/owner/hero.webp");
    expect(world.characters[0].voice).toEqual({ id: "v1", name: "Hero voice" });
    expect(world.characters[0].lines).toEqual([
      { id: "l1", text: "I am here.", audioPath: "/owner/line.mp3" },
    ]);
    expect(world.scripts).toEqual(stored.scripts);
    expect(world.storyboards).toEqual(stored.storyboards);
    expect(world.shorts).toEqual(stored.shorts);
    expect(world.secrets).toEqual(stored.secrets);
    expect(world.canonChanges).toEqual(["Owner changed the ending"]);
  });

  it("reports no upgrade when nothing is missing", () => {
    const { upgraded } = upgradeSampleWorld(seedWorld(), seedWorld());
    expect(upgraded).toBe(false);
  });

  it("never touches a project that is not the sample", () => {
    const other: World = { ...oldSampleWorld(), id: "river-tales-aaaaaa" };
    const { world, upgraded } = upgradeSampleWorld(other, seedWorld());
    expect(upgraded).toBe(false);
    expect(world).toEqual(other);
  });
});

describe("loadProject upgrades the stored sample", () => {
  it("saves the upgraded world back", async () => {
    stubLocalStorage();
    saveProject(oldSampleWorld(), { sample: true });
    expect(loadStoredWorld(SAMPLE_ID)?.facts).toEqual([]);
    const loaded = await loadProject(SAMPLE_ID, seedWorld());
    expect(loaded?.world.facts).toEqual(seedWorld().facts);
    expect(loadStoredWorld(SAMPLE_ID)?.facts).toEqual(seedWorld().facts);
    expect(loadStoredWorld(SAMPLE_ID)?.parts[0].text).toBe(seedWorld().parts[0].text);
  });
});
