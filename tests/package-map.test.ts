import { describe, expect, it } from "vitest";
import { SHEET_VIEW_IDS } from "@/lib/art";
import { WorldSchema, type World } from "@/lib/world/schemas";
import {
  buildPackageGraph,
  columnOf,
  layoutPackageGraph,
  MAP_NODE_HEIGHT,
  MAP_NODE_WIDTH,
  placesForScene,
} from "@/components/package/graph";
import {
  characterRows,
  sceneRows,
  unfinishedCharacterRows,
  unfinishedSceneRows,
} from "@/components/package/groups";

const SERIES_CHANNEL_SECRET = "SERIES_CHANNEL_SECRET why the baby lived";
const GAME_CHANNEL_SECRET = "GAME_CHANNEL_SECRET what the stream keeps";
const SERIES_BEAT_SECRET = "the baby lived because of SERIES_MARKER";
const GAME_BEAT_SECRET = "the stream hides GAME_MARKER";

function makeWorld(): World {
  const fullSheet = SHEET_VIEW_IDS.map((view) => ({
    view,
    imagePath: "data:image/webp;base64,QUJD",
    ...(view === "front"
      ? { cutoutPath: "data:image/png;base64,QUJD" }
      : {}),
  }));
  return WorldSchema.parse({
    id: "test-story",
    title: "Test Story",
    premise: "A premise.",
    logline: "A logline.",
    facts: [
      { id: "f-genre", label: "Genre", value: "Mythic tale", source: "material" },
      { id: "f-tone", label: "Tone", value: "Dark", source: "material" },
    ],
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
    locations: [
      { id: "stream", name: "Stream", description: "Cold water." },
    ],
    channels: [
      {
        id: "series",
        name: "Series",
        kind: "series",
        title: "The Series",
        secret: SERIES_CHANNEL_SECRET,
      },
      {
        id: "game",
        name: "Game",
        kind: "game",
        title: "The Game",
        secret: GAME_CHANNEL_SECRET,
      },
    ],
    parts: [
      {
        id: "part-1",
        order: 1,
        title: "Beginnings",
        summary: "Ada arrives at the stream.",
        excerpt: "She came at dawn.",
        imagePath: "data:image/webp;base64,QUJD",
        characterIds: ["ada", "bob"],
      },
      {
        id: "part-2",
        order: 2,
        title: "Crossing",
        summary: "Ada crosses alone.",
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
      { id: "s-series", text: SERIES_BEAT_SECRET, knownThrough: ["series"], note: "Shown." },
      { id: "s-game", text: GAME_BEAT_SECRET, knownThrough: ["game"], note: "Found." },
    ],
    gaps: [],
    scripts: [
      { channelId: "series", partId: "part-1", text: "INT. DAWN.", updatedAt: 1 },
    ],
  });
}

describe("package map columns", () => {
  it("orders nodes left to right: story, cast, scenes, outputs, package", () => {
    const graph = buildPackageGraph(makeWorld(), "series", "test-story", 9);
    const columns = new Map(graph.nodes.map((node) => [node.id, node.column]));
    expect(columns.get("story")).toBe(0);
    expect(columns.get("character:ada")).toBe(1);
    expect(columns.get("place:stream")).toBe(1);
    expect(columns.get("scene:part-1")).toBe(2);
    expect(columns.get("script:part-1")).toBe(3);
    expect(columns.get("storyboard:part-1")).toBe(4);
    expect(columns.get("video:part-1")).toBe(5);
    expect(columns.get("secret")).toBe(5);
    expect(columns.get("package")).toBe(6);
    expect(columnOf("story")).toBeLessThan(columnOf("character"));
    expect(columnOf("place")).toBeLessThan(columnOf("scene"));
    expect(columnOf("scene")).toBeLessThan(columnOf("script"));
    expect(columnOf("script")).toBeLessThan(columnOf("storyboard"));
    expect(columnOf("storyboard")).toBeLessThan(columnOf("video"));
    expect(columnOf("video")).toBeLessThan(columnOf("package"));
    // Only the series scenes appear for the series channel.
    expect(graph.nodes.some((node) => node.id === "scene:part-2")).toBe(false);
  });

  it("lays out without overlaps and deterministically", () => {
    const graph = buildPackageGraph(makeWorld(), "series", "test-story", 9);
    const first = layoutPackageGraph(graph.nodes);
    const second = layoutPackageGraph(graph.nodes);
    expect(first.placed).toEqual(second.placed);
    const boxes = first.placed.map((node) => ({
      id: node.id,
      left: node.x,
      right: node.x + MAP_NODE_WIDTH,
      top: node.y,
      bottom: node.y + MAP_NODE_HEIGHT,
    }));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i] as (typeof boxes)[number];
        const b = boxes[j] as (typeof boxes)[number];
        const overlap =
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
    // Columns sit further right as the column index grows.
    for (const node of first.placed) {
      expect(node.x).toBe(node.column * (MAP_NODE_WIDTH + 96));
      expect(node.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("package map secret rule", () => {
  it("shows only this channel's secret, never another channel's", () => {
    const series = buildPackageGraph(makeWorld(), "series", "test-story", 9);
    const dump = JSON.stringify(series);
    expect(dump).toContain("SERIES_CHANNEL_SECRET");
    expect(dump).not.toContain("GAME_CHANNEL_SECRET");
    expect(dump).not.toContain("SERIES_MARKER");
    expect(dump).not.toContain("GAME_MARKER");
    const secret = series.nodes.find((node) => node.kind === "secret");
    expect(secret?.subtitle).toBe(SERIES_CHANNEL_SECRET);

    const game = buildPackageGraph(makeWorld(), "game", "test-story", 4);
    expect(JSON.stringify(game)).toContain("GAME_CHANNEL_SECRET");
    expect(JSON.stringify(game)).not.toContain("SERIES_CHANNEL_SECRET");
  });

  it("still shows the secret node when the channel reveals nothing yet", () => {
    const world = makeWorld();
    const bare = {
      ...world,
      channels: world.channels.map((channel) =>
        channel.id === "series" ? { ...channel, secret: "" } : channel,
      ),
    };
    const graph = buildPackageGraph(bare, "series", "test-story", 9);
    const secret = graph.nodes.find((node) => node.kind === "secret");
    expect(secret?.made).toBe(false);
    expect(secret?.subtitle).toContain("No secret");
  });
});

describe("package map nodes and edges", () => {
  it("marks made and not-made nodes with links to open or make them", () => {
    const graph = buildPackageGraph(makeWorld(), "series", "test-story", 9);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    // The series script and part-1 art are made; the board and video are not.
    expect(byId.get("script:part-1")?.made).toBe(true);
    expect(byId.get("script:part-1")?.href).toBe(
      "/projects/test-story/script?channel=series&part=part-1",
    );
    expect(byId.get("storyboard:part-1")?.made).toBe(false);
    expect(byId.get("storyboard:part-1")?.href).toBe(
      "/projects/test-story/storyboard?channel=series&part=part-1",
    );
    expect(byId.get("video:part-1")?.made).toBe(false);
    expect(byId.get("video:part-1")?.href).toBe(
      "/projects/test-story/video?channel=series&part=part-1",
    );
    expect(byId.get("scene:part-1")?.made).toBe(true);
    expect(byId.get("scene:part-1")?.thumb).toContain("data:image");
    // Ada's sheet is complete; Bob's is not.
    expect(byId.get("character:ada")?.made).toBe(true);
    expect(byId.get("character:bob")?.made).toBe(false);
    expect(byId.get("character:bob")?.href).toBe(
      "/projects/test-story/characters?c=bob",
    );
    expect(byId.get("package")?.subtitle).toBe("9 files");
    expect(byId.get("package")?.href).toBeUndefined();
  });

  it("connects story to cast, cast to scenes, scenes through outputs, all into Package", () => {
    const graph = buildPackageGraph(makeWorld(), "series", "test-story", 9);
    const has = (source: string, target: string) =>
      graph.edges.some((edge) => edge.source === source && edge.target === target);
    expect(has("story", "character:ada")).toBe(true);
    expect(has("story", "place:stream")).toBe(true);
    expect(has("character:ada", "scene:part-1")).toBe(true);
    expect(has("place:stream", "scene:part-1")).toBe(true);
    expect(has("scene:part-1", "script:part-1")).toBe(true);
    expect(has("script:part-1", "storyboard:part-1")).toBe(true);
    expect(has("storyboard:part-1", "video:part-1")).toBe(true);
    expect(has("secret", "package")).toBe(true);
    // Everything but the Story flows into the Package output.
    for (const node of graph.nodes) {
      if (node.id === "story" || node.id === "package") continue;
      expect(has(node.id, "package"), `${node.id} should flow into Package`).toBe(true);
    }
  });

  it("animates only edges that lead to made nodes", () => {
    const graph = buildPackageGraph(makeWorld(), "series", "test-story", 9);
    const animated = new Map(
      graph.edges.map((edge) => [`${edge.source}>>${edge.target}`, edge.animated]),
    );
    expect(animated.get("story>>character:ada")).toBe(true);
    expect(animated.get("story>>character:bob")).toBe(false);
    expect(animated.get("scene:part-1>>script:part-1")).toBe(true);
    expect(animated.get("script:part-1>>storyboard:part-1")).toBe(false);
    expect(animated.get("secret>>package")).toBe(true);
  });

  it("maps design, not boards or video, for a game channel", () => {
    const graph = buildPackageGraph(makeWorld(), "game", "test-story", 4);
    const kinds = graph.nodes.map((node) => node.kind);
    expect(kinds).not.toContain("storyboard");
    expect(kinds).not.toContain("video");
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    expect(byId.get("script:part-1")?.subtitle).toBe("Design");
    expect(byId.get("script:part-1")?.href).toBe(
      "/projects/test-story/script?channel=game&part=part-1",
    );
    const has = (source: string, target: string) =>
      graph.edges.some((edge) => edge.source === source && edge.target === target);
    expect(has("scene:part-1", "script:part-1")).toBe(true);
    expect(has("script:part-1", "package")).toBe(true);
    expect(JSON.stringify(graph)).not.toContain("SERIES_CHANNEL_SECRET");
  });

  it("links places by the part's own words", () => {
    const world = makeWorld();
    const part = world.parts.find((p) => p.id === "part-1") as NonNullable<
      (typeof world.parts)[number]
    >;
    expect(placesForScene(part, world.locations)).toEqual(["stream"]);
    const crossing = world.parts.find((p) => p.id === "part-2") as NonNullable<
      (typeof world.parts)[number]
    >;
    expect(placesForScene(crossing, world.locations)).toEqual([]);
  });
});

describe("grouped readiness rows", () => {
  it("makes one row per scene with script, storyboard, video and art chips", () => {
    const rows = sceneRows(makeWorld(), "test-story", "series");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ partId: "part-1", title: "Beginnings", channelName: "Series" });
    expect(rows[0]?.chips.map((chip) => chip.kind)).toEqual([
      "script",
      "storyboard",
      "video",
      "art",
    ]);
    const chip = Object.fromEntries(
      (rows[0]?.chips ?? []).map((entry) => [entry.kind, entry]),
    ) as Record<string, { made: boolean; href: string }>;
    expect(chip.script?.made).toBe(true);
    expect(chip.art?.made).toBe(true);
    expect(chip.storyboard?.made).toBe(false);
    expect(chip.video?.made).toBe(false);
    expect(chip.video?.href).toBe("/projects/test-story/video?channel=series&part=part-1");
    expect(chip.art?.href).toBe("/projects/test-story/story");
    // Only unfinished rows stay in the work list.
    expect(unfinishedSceneRows(rows)).toHaveLength(1);
    const done = (rows[0]?.chips ?? []).map((entry) => ({ ...entry, made: true }));
    expect(unfinishedSceneRows([{ ...(rows[0] as (typeof rows)[number]), chips: done }])).toHaveLength(0);
  });

  it("makes game rows with design and art only", () => {
    const rows = sceneRows(makeWorld(), "test-story", "game");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.chips.map((chip) => chip.kind)).toEqual(["design", "art"]);
    expect(rows[0]?.chips.map((chip) => chip.label)).toEqual(["Design", "Art"]);
    expect(rows[0]?.chips[0]?.href).toBe(
      "/projects/test-story/script?channel=game&part=part-1",
    );
  });

  it("makes one row per character with sheet, cutout and voice chips", () => {
    const rows = characterRows(makeWorld(), "test-story");
    expect(rows.map((row) => row.name)).toEqual(["Ada", "Bob"]);
    expect(rows[0]?.chips.map((chip) => chip.kind)).toEqual(["sheet", "cutouts", "voice"]);
    const ada = Object.fromEntries(
      (rows[0]?.chips ?? []).map((entry) => [entry.kind, entry]),
    ) as Record<string, { made: boolean; href: string }>;
    expect(ada.sheet?.made).toBe(true);
    expect(ada.cutouts?.made).toBe(true);
    expect(ada.voice?.made).toBe(false);
    const bob = Object.fromEntries(
      (rows[1]?.chips ?? []).map((entry) => [entry.kind, entry]),
    ) as Record<string, { made: boolean; href: string }>;
    expect(bob.sheet?.made).toBe(false);
    expect(bob.cutouts?.made).toBe(false);
    expect(bob.voice?.made).toBe(true);
    expect(bob.sheet?.href).toBe("/projects/test-story/characters?c=bob");
    // Ada still needs a voice and Bob still needs his sheet and cutouts.
    expect(unfinishedCharacterRows(rows).map((row) => row.name)).toEqual(["Ada", "Bob"]);
  });
});
