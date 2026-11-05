import { describe, expect, it, vi } from "vitest";
import { inlinePublicArt, planAgentFiles, planGameFiles } from "@/lib/package";
import { WorldSchema, type World } from "@/lib/world/schemas";

/** A real 1x1 PNG, so the planners decode it into real files. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const SERIES_MARKER = "the baby lived because of SERIES_MARKER";
const GAME_MARKER = "the stream hides GAME_MARKER";
const SERIES_CHANNEL_SECRET = "SERIES_CHANNEL_SECRET why the baby lived";
const GAME_CHANNEL_SECRET = "GAME_CHANNEL_SECRET what the stream keeps";

function makeWorld(
  images: {
    sheet?: string;
    cutout?: string;
    part?: string;
    part2?: string;
    frame?: string;
    shot?: string;
  } = {},
): World {
  const {
    sheet = "/ada/front.webp",
    cutout = "/ada/front-cutout.png",
    part = "/scenes/part-1.webp",
    part2 = "/scenes/part-2.webp",
    frame = "/boards/frame-1.webp",
    shot = "/anukili/fire.webp",
  } = images;
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
        sheet: [
          { view: "front", imagePath: sheet, cutoutPath: cutout },
          { view: "left", imagePath: PNG },
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
        imagePath: part,
        characterIds: ["ada"],
      },
      {
        id: "part-2",
        order: 2,
        title: "Crossing",
        summary: "Ada crosses.",
        excerpt: "The water was cold.",
        imagePath: part2,
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
        content: "Guide Ada across the stream.",
        characterIds: ["ada"],
      },
      {
        id: "beat-game-2",
        order: 3,
        timeLabel: "Part 2",
        title: "Crossing",
        channelId: "game",
        partId: "part-2",
        unitLabel: "Level 2",
        content: "Guide Ada across the far bank.",
        characterIds: ["ada"],
      },
    ],
    secrets: [
      {
        id: "s-series",
        text: SERIES_MARKER,
        knownThrough: ["series"],
        note: "Shown, never said.",
      },
      {
        id: "s-game",
        text: GAME_MARKER,
        knownThrough: ["game"],
        note: "Found in the level.",
      },
    ],
    gaps: [],
    shorts: [
      {
        id: "short-1",
        channelId: "series",
        partId: "part-1",
        title: "Arrival short",
        aspect: "16:9",
        shots: [
          {
            id: "shot-1",
            imagePath: shot,
            caption: "Fire on the water.",
            durationSec: 2,
            motion: "still",
          },
        ],
      },
    ],
    storyboards: [
      {
        id: "series::part-1",
        channelId: "series",
        partId: "part-1",
        title: "Beginnings",
        frames: [
          {
            id: "frame-1",
            imagePath: frame,
            framing: "wide",
            action: "Ada at the bank.",
            characterIds: ["ada"],
          },
        ],
      },
    ],
  });
}

function loadAllPng(path: string): Promise<string | null> {
  void path;
  return Promise.resolve(PNG);
}

describe("inlinePublicArt", () => {
  it("replaces the sheet, cut-out, part, frame and shot images", async () => {
    const world = makeWorld();
    const load = vi.fn(loadAllPng);
    const next = await inlinePublicArt(world, load);
    expect(next.characters[0]?.sheet[0]?.imagePath).toBe(PNG);
    expect(next.characters[0]?.sheet[0]?.cutoutPath).toBe(PNG);
    expect(next.parts[0]?.imagePath).toBe(PNG);
    expect(next.storyboards[0]?.frames[0]?.imagePath).toBe(PNG);
    expect(next.shorts[0]?.shots[0]?.imagePath).toBe(PNG);
  });

  it("leaves data URLs, refs, http URLs, // paths and empties alone", async () => {
    const world = makeWorld({
      sheet: PNG,
      cutout: "idb:cutout-ada-front",
      part: "http://example.com/scene.webp",
      part2: PNG,
      frame: "//cdn.example.com/frame.webp",
      shot: "",
    });
    const load = vi.fn(loadAllPng);
    const next = await inlinePublicArt(world, load);
    expect(load).not.toHaveBeenCalled();
    expect(next).toBe(world);
    expect(next.characters[0]?.sheet[0]?.imagePath).toBe(PNG);
    expect(next.characters[0]?.sheet[0]?.cutoutPath).toBe(
      "idb:cutout-ada-front",
    );
    expect(next.parts[0]?.imagePath).toBe("http://example.com/scene.webp");
    expect(next.storyboards[0]?.frames[0]?.imagePath).toBe(
      "//cdn.example.com/frame.webp",
    );
    expect(next.shorts[0]?.shots[0]?.imagePath).toBe("");
  });

  it("calls load once for a path used in three fields", async () => {
    const world = makeWorld({
      sheet: "/shared.webp",
      cutout: PNG,
      part: "/shared.webp",
      part2: PNG,
      frame: PNG,
      shot: "/shared.webp",
    });
    const load = vi.fn(loadAllPng);
    const next = await inlinePublicArt(world, load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("/shared.webp");
    expect(next.characters[0]?.sheet[0]?.imagePath).toBe(PNG);
    expect(next.parts[0]?.imagePath).toBe(PNG);
    expect(next.shorts[0]?.shots[0]?.imagePath).toBe(PNG);
  });

  it("keeps the original when a file is bad and still replaces the rest", async () => {
    const world = makeWorld({
      sheet: "/good.webp",
      cutout: "/missing.webp",
      part: "/boom.webp",
      frame: "/page.webp",
      shot: "/good.webp",
    });
    const load = vi.fn(async (path: string): Promise<string | null> => {
      if (path === "/good.webp") return PNG;
      if (path === "/missing.webp") return null;
      if (path === "/boom.webp") throw new Error("gone");
      return "data:text/html;base64,PGI+";
    });
    const next = await inlinePublicArt(world, load);
    expect(next.characters[0]?.sheet[0]?.imagePath).toBe(PNG);
    expect(next.shorts[0]?.shots[0]?.imagePath).toBe(PNG);
    expect(next.characters[0]?.sheet[0]?.cutoutPath).toBe("/missing.webp");
    expect(next.parts[0]?.imagePath).toBe("/boom.webp");
    expect(next.storyboards[0]?.frames[0]?.imagePath).toBe("/page.webp");
  });

  it("does not change the input world", async () => {
    const world = makeWorld();
    const before = JSON.stringify(world);
    await inlinePublicArt(world, loadAllPng);
    expect(JSON.stringify(world)).toBe(before);
  });

  it("returns the same object when nothing needs replacing", async () => {
    const world = makeWorld({
      sheet: PNG,
      cutout: PNG,
      part: PNG,
      part2: PNG,
      frame: PNG,
      shot: PNG,
    });
    const load = vi.fn(loadAllPng);
    await expect(inlinePublicArt(world, load)).resolves.toBe(world);
    expect(load).not.toHaveBeenCalled();
  });
});

describe("public art in the agent package", () => {
  it("packs inlined sheets, scene art and short shots for a series channel", async () => {
    const inlined = await inlinePublicArt(makeWorld(), loadAllPng);
    const files = planAgentFiles(inlined, "series");
    const paths = files.map((file) => file.path);
    expect(paths).toContain("test-story-series/characters/ada/sheet/front.webp");
    expect(paths).toContain("test-story-series/scenes/part-1/art.webp");
    expect(paths).toContain(
      "test-story-series/scenes/part-1/storyboard/frame-1.webp",
    );
    expect(paths).toContain("test-story-series/raea/part-1/media/shot-01.png");
    const readme = files.find(
      (file) => file.path === "test-story-series/raea/part-1/README.md",
    );
    expect(typeof readme?.content).toBe("string");
    expect(readme?.content).not.toContain("Left out");
    // Only part-1 is told in the series channel: part-2 stays out, and
    // so does the game channel's secret, even though part-2 was inlined.
    expect(paths.some((path) => path.includes("part-2"))).toBe(false);
    const text = files
      .map((file) =>
        typeof file.content === "string"
          ? file.content
          : new TextDecoder().decode(file.content ?? new Uint8Array()),
      )
      .join("\n");
    expect(text).toContain("SERIES_MARKER");
    expect(text).not.toContain("GAME_MARKER");
  });

  it("gives a game channel a hero and scene art in raea/story.ts", async () => {
    const inlined = await inlinePublicArt(makeWorld(), loadAllPng);
    const files = planGameFiles(inlined, "game");
    const story = files.find((file) => file.path === "raea/story.ts");
    expect(typeof story?.content).toBe("string");
    expect(story?.content).toContain('HERO = "hero.png"');
    expect(story?.content).not.toContain("HERO = null");
    expect(story?.content).toContain("scene-01.png");
    expect(story?.content).toContain("scene-02.png");
    const paths = files.map((file) => file.path);
    expect(paths).toContain("raea/media/hero.png");
    expect(paths).toContain("raea/media/scene-01.png");
    expect(paths).toContain("raea/media/scene-02.png");
  });
});
