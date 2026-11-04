import { describe, expect, it } from "vitest";
import {
  composeControlsBlock,
  composeGameTypeBlock,
  composeMechanicsBlock,
} from "@/lib/script";
import {
  GAME_DESIGN_SECTIONS,
  gameDesignSections,
  packageChannelTiles,
} from "@/lib/package";
import { WorldSchema, type World } from "@/lib/world/schemas";

function makeWorld(): World {
  return WorldSchema.parse({
    id: "test-tiles",
    title: "Test Tiles",
    premise: "A premise.",
    logline: "A logline.",
    characters: [
      {
        id: "ada",
        name: "Ada",
        canon: "Brave and tall.",
        sheet: [
          { view: "front", imagePath: "data:image/webp;base64,QUJD" },
        ],
        voice: { id: "voice-1", name: "Voice One" },
      },
      { id: "bob", name: "Bob", canon: "Quiet and quick.", sheet: [] },
    ],
    locations: [{ id: "stream", name: "The Stream", description: "Cold." }],
    channels: [
      { id: "series", name: "Series", kind: "series", title: "The Series" },
      { id: "game", name: "Game", kind: "game", title: "The Game" },
      { id: "shorts", name: "Shorts", kind: "shorts", title: "The Shorts" },
      { id: "film", name: "Film", kind: "film", title: "The Film" },
      { id: "site", name: "Site", kind: "website", title: "The Site" },
      { id: "press", name: "Press", kind: "press", title: "The Press" },
      { id: "ad", name: "Ad", kind: "ad", title: "The Ad" },
      { id: "other", name: "Other", kind: "other", title: "The Other" },
    ],
    parts: [
      {
        id: "part-1",
        order: 1,
        title: "Beginnings",
        summary: "Ada arrives.",
        excerpt: "She came at dawn.",
        imagePath: "data:image/webp;base64,QUJD",
        characterIds: ["ada"],
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
        content: "Ada arrives.",
        characterIds: ["ada"],
      },
      {
        id: "beat-game-1",
        order: 2,
        timeLabel: "Part 1",
        title: "First ripple",
        channelId: "game",
        partId: "part-1",
        unitLabel: "Level 1",
        content: "Guide Ada.",
        characterIds: ["ada"],
      },
      {
        id: "beat-site-1",
        order: 3,
        timeLabel: "Part 1",
        title: "Landing",
        channelId: "site",
        partId: "part-1",
        unitLabel: "Page 1",
        content: "Read about Ada.",
        characterIds: ["ada"],
      },
    ],
    secrets: [
      { id: "s-1", text: "Hidden.", knownThrough: [], note: "Apart." },
    ],
    gaps: [],
    scripts: [
      { channelId: "series", partId: "part-1", text: "INT. DAWN.", updatedAt: 1 },
      {
        channelId: "game",
        partId: "part-1",
        text: [
          composeGameTypeBlock("Platformer", { locationNames: ["The Stream"] }),
          composeMechanicsBlock(["Jump", "Dash"]),
          composeControlsBlock(["Gamepad"]),
        ].join("\n"),
        updatedAt: 2,
        form: "design",
      },
      {
        channelId: "game",
        partId: "part-1",
        text: "Just a note, not a design block.",
        updatedAt: 3,
        form: "script",
      },
      {
        channelId: "site",
        partId: "part-1",
        text: "Welcome to the story.",
        updatedAt: 4,
        form: "copy",
      },
    ],
  });
}

describe("game design sections", () => {
  it("lists all six sections with saved text or null", () => {
    const sections = gameDesignSections(makeWorld(), "game");
    expect(sections.map((section) => section.label)).toEqual([
      ...GAME_DESIGN_SECTIONS,
    ]);
    const byLabel = Object.fromEntries(
      sections.map((section) => [section.label, section.text]),
    );
    expect(byLabel["Game type"]).toContain("Platformer");
    expect(byLabel["Core mechanics"]).toContain("Jump and Dash");
    expect(byLabel["Controls"]).toContain("Gamepad");
    expect(byLabel["Camera and view"]).toBeNull();
    expect(byLabel["Goal and ending"]).toBeNull();
    expect(byLabel["Progression"]).toBeNull();
  });

  it("ignores non-design scripts on the same channel", () => {
    const sections = gameDesignSections(makeWorld(), "game");
    const dump = JSON.stringify(sections);
    expect(dump).not.toContain("Just a note");
  });

  it("reports nothing decided when no design entry exists", () => {
    const sections = gameDesignSections(makeWorld(), "series");
    expect(sections).toHaveLength(6);
    expect(sections.every((section) => section.text === null)).toBe(true);
  });
});

describe("package channel tiles", () => {
  it("counts the series channel only", () => {
    const tiles = packageChannelTiles(makeWorld(), "series");
    expect(tiles.map((tile) => tile.label)).toEqual([
      "Characters",
      "Scenes told",
      "Scripts written",
      "Storyboards",
      "Videos",
      "Scene art",
      "Secrets kept apart",
    ]);
    const byLabel = Object.fromEntries(
      tiles.map((tile) => [tile.label, tile]),
    ) as Record<string, { value: string; made: number; total: number }>;
    // Only the series beat and script count: the game and site work is excluded.
    expect(byLabel["Scenes told"]).toMatchObject({ value: "1", made: 1, total: 2 });
    expect(byLabel["Scripts written"]).toMatchObject({ value: "1", made: 1, total: 1 });
    expect(byLabel["Videos"]).toMatchObject({ value: "0", made: 0, total: 1 });
    expect(byLabel["Scene art"]).toMatchObject({ value: "1", made: 1, total: 1 });
    expect(byLabel["Secrets kept apart"]).toMatchObject({ value: "1", total: 1 });
  });

  it("reads shorts and film like series", () => {
    for (const channelId of ["shorts", "film"]) {
      const labels = packageChannelTiles(makeWorld(), channelId).map(
        (tile) => tile.label,
      );
      expect(labels).toContain("Scripts written");
      expect(labels).toContain("Storyboards");
      expect(labels).toContain("Videos");
      expect(labels).not.toContain("Game design");
    }
  });

  it("counts places and filled design sections for the game, never boards or video", () => {
    const tiles = packageChannelTiles(makeWorld(), "game");
    expect(tiles.map((tile) => tile.label)).toEqual([
      "Characters",
      "Places",
      "Game design",
      "Character art ready",
      "Secrets kept apart",
    ]);
    const byLabel = Object.fromEntries(
      tiles.map((tile) => [tile.label, tile]),
    ) as Record<string, { value: string; made: number; total: number }>;
    expect(byLabel["Places"]).toMatchObject({ value: "1" });
    expect(byLabel["Game design"]).toMatchObject({ value: "3 of 6", made: 3, total: 6 });
    expect(byLabel["Character art ready"]).toMatchObject({ value: "0", made: 0, total: 2 });
  });

  it("counts copy, not boards or video, for website, press, ad and other", () => {
    for (const channelId of ["site", "press", "ad", "other"]) {
      const tiles = packageChannelTiles(makeWorld(), channelId);
      expect(tiles.map((tile) => tile.label)).toEqual([
        "Characters",
        "Scenes told",
        "Copy written",
        "Scene art",
        "Secrets kept apart",
      ]);
    }
    const site = packageChannelTiles(makeWorld(), "site");
    const copy = site.find((tile) => tile.label === "Copy written");
    expect(copy).toMatchObject({ value: "1", made: 1, total: 1 });
  });
});
