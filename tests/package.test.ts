import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  agentBrief,
  buildAgentZip,
  channelWorld,
  packageTree,
  planAgentFiles,
} from "@/lib/package";
import {
  sanitizePlannedFrames,
  toPlannedFrames,
  upsertStoryboard,
} from "@/lib/storyboard";
import { WorldSchema, type World } from "@/lib/world/schemas";

const SERIES_SECRET = "the baby lived because of SERIES_MARKER";
const GAME_SECRET = "the stream hides GAME_MARKER";
const UNSCOPED_SECRET = "nobody may know UNSCOPED_MARKER";
const CHARACTER_SECRET = "a hidden CHAR_SECRET_MARKER scar";
const SERIES_CHANNEL_SECRET = "SERIES_CHANNEL_SECRET why the baby lived";
const GAME_CHANNEL_SECRET = "GAME_CHANNEL_SECRET what the stream keeps";

function makeWorld(): World {
  return WorldSchema.parse({
    id: "test-story",
    title: "Test Story",
    premise: "A premise.",
    logline: "A logline.",
    characters: [
      {
        id: "ada",
        name: "Ada",
        canon: "Brave and tall.",
        secret: CHARACTER_SECRET,
        artPath: "data:image/webp;base64,QUJD",
        sheet: [
          {
            view: "front",
            imagePath: "data:image/webp;base64,QUJD",
            cutoutPath: "data:image/png;base64,QUJD",
          },
          { view: "left", imagePath: "data:image/webp;base64,QUJD" },
        ],
      },
    ],
    locations: [],
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
        content: "Ada arrives legs first.",
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
        content: "Guide Ada across the stream.",
        characterIds: ["ada"],
      },
    ],
    secrets: [
      {
        id: "s-series",
        text: SERIES_SECRET,
        knownThrough: ["series"],
        note: "Shown, never said.",
      },
      {
        id: "s-game",
        text: GAME_SECRET,
        knownThrough: ["game"],
        note: "Found in the level.",
      },
      {
        id: "s-none",
        text: UNSCOPED_SECRET,
        knownThrough: [],
        note: "Not yet placed.",
      },
    ],
    gaps: [],
    packs: [
      {
        partId: "part-1",
        channelId: "game",
        script: "Level brief: cross the stream.",
        shots: ["Ada at the bank.", "The water rises.", "She steps in."],
        posts: ["The stream is waiting.", "One step in.", "Play level one."],
        reveals: [GAME_SECRET],
        additions: ["A heron watches."],
      },
    ],
  });
}

function contentsOf(world: World, channelId: string): string[] {
  return planAgentFiles(world, channelId)
    .filter((file) => !file.missing && file.content !== undefined)
    .map((file) =>
      typeof file.content === "string"
        ? file.content
        : new TextDecoder().decode(file.content),
    );
}

describe("agent package secret rule", () => {
  it("lets no foreign secret into any generated file", () => {
    for (const content of contentsOf(makeWorld(), "game")) {
      expect(content).not.toContain("SERIES_MARKER");
      expect(content).not.toContain("UNSCOPED_MARKER");
      expect(content).not.toContain("CHAR_SECRET_MARKER");
      expect(content).not.toContain("SERIES_CHANNEL_SECRET");
    }
  });

  it("states what may be learned and that the rest is absent", () => {
    const brief = agentBrief(channelWorld(makeWorld(), "game"), "game");
    expect(brief).toContain("GAME_MARKER");
    expect(brief).toContain("GAME_CHANNEL_SECRET");
    expect(brief).not.toContain("SERIES_MARKER");
    expect(brief).toContain("deliberately absent");
  });

  it("excludes other channels' beats from the timeline and scenes", () => {
    const files = planAgentFiles(makeWorld(), "game");
    const timeline = files.find((f) => f.type === "timeline");
    expect(JSON.stringify(timeline?.content)).toContain("First ripple");
    expect(JSON.stringify(timeline?.content)).not.toContain("Arrival");
    // Only part-1 is covered by the game channel.
    const briefs = files
      .filter((f) => f.type === "scene-brief")
      .map((f) => f.path);
    expect(briefs).toHaveLength(1);
    expect(briefs[0]).toContain("part-1");
  });

  it("marks packs suggested and marks their additions in the file", () => {
    const files = planAgentFiles(makeWorld(), "game");
    const pack = files.find((f) => f.type === "pack");
    expect(pack?.missing).toBe(false);
    expect(pack?.suggested).toBe(true);
    expect(pack?.content).toContain("suggested addition");
  });

  it("leaves missing files out and says so in the manifest", () => {
    const files = planAgentFiles(makeWorld(), "game");
    // part-2 art, the left cutout, and no pack for part-2... part-2 is
    // uncovered so only these are missing here.
    const missing = files.filter((f) => f.missing);
    expect(missing.length).toBeGreaterThan(0);
    const manifest = files.find((f) => f.type === "manifest");
    const parsed = JSON.parse(manifest?.content as string) as {
      story: string;
      channel: string;
      files: Array<{
        path: string;
        type: string;
        character?: string;
        part?: string;
        suggested: boolean;
        missing: boolean;
      }>;
    };
    expect(parsed.story).toBe("test-story");
    expect(parsed.channel).toBe("game");
    expect(parsed.files).toHaveLength(files.length - 1);
    for (const entry of parsed.files) {
      expect(typeof entry.path).toBe("string");
      expect(typeof entry.type).toBe("string");
      expect(typeof entry.suggested).toBe("boolean");
      expect(typeof entry.missing).toBe("boolean");
    }
    const leftCutout = parsed.files.find((f) =>
      f.path.endsWith("cutouts/left.png"),
    );
    expect(leftCutout?.missing).toBe(true);
    const sheet = parsed.files.find((f) =>
      f.path.endsWith("sheet/front.webp"),
    );
    expect(sheet?.character).toBe("ada");
    expect(sheet?.missing).toBe(false);
  });

  it("builds a real ZIP whose tree matches its contents", async () => {
    const world = makeWorld();
    const { blob, files } = await buildAgentZip(world, "series");
    const zip = await JSZip.loadAsync(blob);
    const names = Object.keys(zip.files).filter(
      (name) => !zip.files[name]?.dir,
    );
    const included = files.filter((f) => !f.missing).map((f) => f.path);
    expect(names.sort()).toEqual(included.sort());

    const tree = packageTree(files);
    for (const path of included) {
      expect(tree).toContain(path.replace(/^[^/]+\//, ""));
    }
    for (const file of files.filter((f) => f.missing)) {
      expect(tree).not.toContain(file.path);
    }

    const brief = await zip
      .file("test-story-series/AGENT_BRIEF.md")
      ?.async("string");
    expect(brief).toContain("SERIES_MARKER");
    expect(brief).not.toContain("GAME_MARKER");
    expect(brief).not.toContain("UNSCOPED_MARKER");
  });

  it("returns no files for an unknown channel", () => {
    expect(planAgentFiles(makeWorld(), "missing")).toEqual([]);
  });
});

describe("agent package storyboards", () => {
  function worldWithStoryboard(): World {
    const world = makeWorld();
    const frames = toPlannedFrames(
      sanitizePlannedFrames([
        {
          framing: "wide",
          action: "Ada at the bank.",
          dialogue: "Look.",
          camera: null,
          characterIds: ["ada"],
        },
        {
          framing: "close",
          action: "The water rises.",
          dialogue: null,
          camera: null,
          characterIds: ["ada"],
        },
      ]),
      world,
      "series",
    );
    return upsertStoryboard(world, {
      id: "series::part-1",
      channelId: "series",
      partId: "part-1",
      title: "Beginnings",
      frames: frames.map((frame, i) =>
        i === 0
          ? { ...frame, imagePath: "data:image/webp;base64,QUJD" }
          : frame,
      ),
    });
  }

  it("adds storyboard.json without image bytes and the sketches beside it", () => {
    const files = planAgentFiles(worldWithStoryboard(), "series");
    const json = files.find((f) => f.type === "storyboard");
    expect(json?.path).toBe(
      "test-story-series/scenes/part-1/storyboard.json",
    );
    expect(json?.missing).toBe(false);
    const parsed = JSON.parse(json?.content as string) as Array<
      Record<string, unknown>
    >;
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      id: "frame-1",
      framing: "wide",
      action: "Ada at the bank.",
      dialogue: "Look.",
      characterIds: ["ada"],
    });
    expect(JSON.stringify(json?.content)).not.toContain("data:image");
    const sketch = files.find(
      (f) =>
        f.type === "storyboard-sketch" &&
        f.path.endsWith("storyboard/frame-1.webp"),
    );
    expect(sketch?.missing).toBe(false);
    const missing = files.find((f) =>
      f.path.endsWith("storyboard/frame-2.webp"),
    );
    expect(missing?.missing).toBe(true);
  });

  it("keeps storyboards to their own channel", () => {
    const game = planAgentFiles(worldWithStoryboard(), "game");
    expect(
      game.some(
        (f) => f.type === "storyboard" || f.type === "storyboard-sketch",
      ),
    ).toBe(false);
    expect(
      game.filter((f) => !f.missing && f.content !== undefined).map((f) =>
        typeof f.content === "string"
          ? f.content
          : new TextDecoder().decode(f.content),
      ),
    ).not.toContain("Ada at the bank.");
  });

  it("shows the storyboard files in the package tree", () => {
    const files = planAgentFiles(worldWithStoryboard(), "series");
    const tree = packageTree(files);
    expect(tree).toContain("scenes/part-1/storyboard.json");
    expect(tree).toContain("scenes/part-1/storyboard/frame-1.webp");
    expect(tree).not.toContain("frame-2.webp");
  });
});
