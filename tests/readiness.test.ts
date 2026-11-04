import { describe, expect, it } from "vitest";
import { SHEET_VIEW_IDS } from "@/lib/art";
import {
  filterCharacters,
  resolveCharacterId,
  scenesForCharacter,
} from "@/lib/cast";
import { planAgentFiles, packageTree } from "@/lib/package";
import {
  channelReadiness,
  hasFullSheet,
  notMadeYet,
  summaryCounts,
} from "@/lib/readiness";
import { WorldSchema, type World } from "@/lib/world/schemas";

function makeWorld(): World {
  const fullSheet = SHEET_VIEW_IDS.map((view) => ({
    view,
    imagePath: "data:image/webp;base64,QUJD",
  }));
  return WorldSchema.parse({
    id: "test-story",
    title: "Test Story",
    premise: "A premise.",
    logline: "A logline.",
    characters: [
      { id: "ada", name: "Ada", canon: "Brave and tall.", sheet: fullSheet },
      {
        id: "bob",
        name: "Bob",
        canon: "Quiet and quick.",
        sheet: [{ view: "front", imagePath: "data:image/webp;base64,QUJD" }],
        voice: { id: "voice-1", name: "Voice One" },
      },
    ],
    locations: [],
    channels: [
      { id: "series", name: "Series", kind: "series", title: "The Series" },
      { id: "game", name: "Game", kind: "game", title: "The Game" },
    ],
    parts: [
      {
        id: "part-1",
        order: 1,
        title: "Beginnings",
        summary: "Ada arrives.",
        excerpt: "She came at dawn.",
        imagePath: "data:image/webp;base64,QUJD",
        characterIds: ["ada", "bob"],
      },
      {
        id: "part-2",
        order: 2,
        title: "Crossing",
        summary: "Ada crosses.",
        excerpt: "The water was cold.",
        characterIds: ["ada"],
      },
    ],
    beats: [
      {
        id: "beat-series-1",
        order: 1,
        timeLabel: "Part 1",
        title: "Arrival",
        channelId: "series",
        partId: "part-1",
        unitLabel: "Episode 1",
        content: "Ada arrives legs first.",
        characterIds: ["ada", "bob"],
      },
      {
        id: "beat-game-1",
        order: 2,
        timeLabel: "Part 1",
        title: "First ripple",
        channelId: "game",
        partId: "part-1",
        unitLabel: "Level 1",
        content: "Guide Ada across the stream.",
        characterIds: ["ada"],
      },
    ],
    secrets: [
      { id: "s-1", text: "Ada hides a scar.", knownThrough: ["series"], note: "Shown." },
      { id: "s-2", text: "The stream keeps a secret.", knownThrough: [], note: "Placed nowhere." },
    ],
    gaps: [],
    scripts: [
      { channelId: "series", partId: "part-1", text: "INT. DAWN.", updatedAt: 1 },
    ],
  });
}

describe("character selection (?c=)", () => {
  it("defaults to the first character and follows a valid id", () => {
    const world = makeWorld();
    expect(resolveCharacterId(world, null)).toBe("ada");
    expect(resolveCharacterId(world, undefined)).toBe("ada");
    expect(resolveCharacterId(world, "bob")).toBe("bob");
    expect(resolveCharacterId(world, "nobody")).toBe("ada");
    expect(resolveCharacterId({ ...world, characters: [] }, "ada")).toBeUndefined();
  });
});

describe("character list search", () => {
  it("matches names case-insensitively and keeps everyone on empty", () => {
    const world = makeWorld();
    expect(filterCharacters(world.characters, "")).toHaveLength(2);
    expect(filterCharacters(world.characters, "  ")).toHaveLength(2);
    expect(filterCharacters(world.characters, "ada")).toEqual([world.characters[0]]);
    expect(filterCharacters(world.characters, "BO")).toEqual([world.characters[1]]);
    expect(filterCharacters(world.characters, "zzz")).toHaveLength(0);
  });
});

describe("appears-in scenes", () => {
  it("lists one chip per scene, linked to the Script page", () => {
    const scenes = scenesForCharacter(makeWorld(), "test-story", "ada");
    expect(scenes).toHaveLength(2);
    expect(scenes[0]).toMatchObject({
      channelId: "series",
      partId: "part-1",
      href: "/projects/test-story/script?channel=series&part=part-1",
    });
    expect(scenes[0]?.label).toContain("Series");
    const bob = scenesForCharacter(makeWorld(), "test-story", "bob");
    expect(bob).toHaveLength(1);
    expect(
      scenesForCharacter(makeWorld(), "test-story", "nobody"),
    ).toHaveLength(0);
  });

  it("dedupes two beats in the same scene", () => {
    const world = makeWorld();
    const extra = {
      id: "beat-series-2",
      order: 3,
      timeLabel: "Part 1",
      title: "Arrival again",
      channelId: "series",
      partId: "part-1",
      unitLabel: "Episode 1",
      content: "Ada arrives again.",
      characterIds: ["ada"],
    };
    const doubled = { ...world, beats: [...world.beats, extra] };
    expect(scenesForCharacter(doubled, "test-story", "ada")).toHaveLength(2);
  });
});

describe("dashboard counts", () => {
  it("counts characters, sheets, voices, scenes, scripts, boards, art, videos, secrets", () => {
    const counts = summaryCounts(makeWorld());
    expect(counts).toMatchObject({
      characters: 2,
      fullSheets: 1,
      voices: 1,
      scenes: 2,
      coveredScenes: 2,
      scriptsWritten: 1,
      storyboards: 0,
      sceneArt: 1,
      videos: 0,
      secretsKeptApart: 1,
      secretsTotal: 2,
      plannedPairs: 2,
    });
  });

  it("calls a sheet full only when every view has an image", () => {
    const world = makeWorld();
    expect(hasFullSheet(world.characters[0])).toBe(true);
    expect(hasFullSheet(world.characters[1])).toBe(false);
    expect(hasFullSheet({ ...world.characters[1], sheet: [] })).toBe(false);
  });
});

describe("channel readiness", () => {
  it("bars what is made and lists the rest with maker links", () => {
    const card = channelReadiness(makeWorld(), "test-story", "series");
    expect(card.total).toBe(5);
    // The series script and part-1 art are made; the rest is not.
    expect(card.made).toBe(2);
    const undone = card.items.filter((item) => !item.done);
    expect(undone.map((item) => item.kind).sort()).toEqual([
      "sheets",
      "storyboard",
      "video",
    ]);
    const sheets = card.items.find((item) => item.kind === "sheets");
    expect(sheets?.href).toBe("/projects/test-story/characters?c=bob");
    const script = undone.find((item) => item.kind === "script");
    expect(script).toBeUndefined();
    const board = card.items.find((item) => item.kind === "storyboard");
    expect(board?.href).toBe(
      "/projects/test-story/storyboard?channel=series&part=part-1",
    );
    const video = card.items.find((item) => item.kind === "video");
    expect(video?.href).toBe(
      "/projects/test-story/video?channel=series&part=part-1",
    );
    const art = card.items.find((item) => item.kind === "art");
    expect(art?.done).toBe(true);
    expect(art?.href).toBe("/projects/test-story/story");
  });

  it("aggregates unfinished work across channels", () => {
    const todo = notMadeYet(makeWorld(), "test-story");
    expect(todo.length).toBeGreaterThan(0);
    expect(todo.every((item) => !item.done)).toBe(true);
    expect(todo.some((item) => item.href.includes("/script?"))).toBe(true);
  });
});

describe("missing-file fix", () => {
  it("never warns about work the owner has not made yet", () => {
    const files = planAgentFiles(makeWorld(), "series");
    expect(files.some((f) => f.missing)).toBe(false);
    expect(packageTree(files)).not.toContain("missing");
    // The unmade storyboard and video are reported as not made yet.
    const labels = notMadeYet(makeWorld(), "test-story").map((i) => i.label);
    expect(labels).toContain("Storyboard: Beginnings");
    expect(labels).toContain("Video: Beginnings");
  });
});
