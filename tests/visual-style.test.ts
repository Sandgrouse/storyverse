import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as draftPOST } from "@/app/api/script/draft/route";
import {
  SCENE_SUFFIX,
  SHEET_SUFFIX,
  SKETCH_SUFFIX,
  scenePrompt,
  sheetPrompt,
  sketchPrompt,
  withVisualStyle,
} from "@/lib/art";
import { __resetBudgetMemory } from "@/lib/budget";
import { removeChannel, updateChannel, CHANNEL_KIND_LABELS } from "@/lib/channels";
import { gameArtBibleMd } from "@/lib/package";
import { upgradeSampleWorld } from "@/lib/projects";
import {
  ReadModelOutputSchema,
  readModelJsonSchema,
} from "@/lib/read";
import {
  VISUAL_PRESETS,
  presetById,
  stylePromptText,
  visualStyleLine,
  visualStyleSourceLine,
} from "@/lib/style";
import { buildWorld } from "@/lib/story";
import {
  ChannelKindSchema,
  WorldSchema,
  type World,
} from "@/lib/world/schemas";

const STYLED = { preset: "Painterly 2D", notes: "Dark, mythic." };

function post(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function modelPayload(text: string): unknown {
  return {
    output: [{ content: [{ type: "output_text", text }] }],
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

function mockModel(text: string) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(modelPayload(text)), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function makeScriptWorld(): World {
  return WorldSchema.parse({
    id: "test-story",
    title: "Test Story",
    premise: "A premise.",
    logline: "A logline.",
    characters: [{ id: "ada", name: "Ada", canon: "Brave.", sheet: [] }],
    locations: [],
    channels: [
      { id: "series", name: "Series", kind: "series", title: "The Series" },
    ],
    parts: [
      {
        id: "part-1",
        order: 1,
        title: "Beginnings",
        summary: "Ada arrives.",
        excerpt: "She came at dawn.",
        characterIds: ["ada"],
      },
    ],
    beats: [
      {
        id: "beat-1",
        order: 1,
        timeLabel: "Part 1",
        title: "Arrival",
        channelId: "series",
        partId: "part-1",
        unitLabel: "Episode 1",
        content: "Ada arrives legs first.",
        characterIds: ["ada"],
      },
    ],
    secrets: [],
    gaps: [],
  });
}

async function loadSeed(): Promise<World> {
  const raw = await readFile(
    join(process.cwd(), "data", "seed", "anukili.json"),
    "utf-8",
  );
  return WorldSchema.parse(JSON.parse(raw));
}

describe("visual presets", () => {
  it("lists the nine presets in order", () => {
    expect(VISUAL_PRESETS.map((entry) => entry.preset)).toEqual([
      "Painterly 2D",
      "Anime",
      "Comic book",
      "Stop-motion",
      "Low-poly 3D",
      "Pixel art",
      "Photoreal",
      "Watercolour",
      "Custom",
    ]);
  });

  it("gives every preset a description and a prompt phrase", () => {
    for (const entry of VISUAL_PRESETS) {
      expect(entry.description.length).toBeGreaterThan(0);
    }
    expect(presetById("Painterly 2D")?.phrase.length).toBeGreaterThan(0);
    // Custom carries only the owner's notes.
    expect(presetById("Custom")?.phrase).toBe("");
    expect(presetById("No such style")).toBeUndefined();
  });
});

describe("style text helpers", () => {
  it("builds prompt text from phrase and notes", () => {
    expect(stylePromptText(STYLED)).toBe(
      "painterly 2D animation style with visible brushwork Dark, mythic.",
    );
    expect(stylePromptText({ preset: "Painterly 2D", notes: "" })).toContain(
      "painterly 2D",
    );
    expect(stylePromptText({ preset: "Custom", notes: "My look." })).toBe(
      "My look.",
    );
  });

  it("stays empty with no style, so prompts are exactly as before", () => {
    expect(stylePromptText(undefined)).toBe("");
    expect(stylePromptText({ preset: "", notes: "" })).toBe("");
    expect(stylePromptText({ preset: "", notes: "Notes alone." })).toBe("");
    expect(withVisualStyle("Base prompt.", undefined)).toBe("Base prompt.");
    expect(withVisualStyle("Base prompt.", { preset: "", notes: "" })).toBe(
      "Base prompt.",
    );
  });

  it("writes one style line for text prompts", () => {
    expect(visualStyleLine(STYLED)).toBe(
      "Visual style: Painterly 2D. Dark, mythic.",
    );
    expect(visualStyleLine({ preset: "Anime", notes: "" })).toBe(
      "Visual style: Anime.",
    );
    expect(visualStyleLine(undefined)).toBe("");
    expect(visualStyleLine({ preset: "", notes: "" })).toBe("");
  });

  it("names the style source the way the Understood page shows it", () => {
    expect(visualStyleSourceLine("art")).toBe("From your art");
    expect(visualStyleSourceLine("muse")).toBe("My reading");
    expect(visualStyleSourceLine("you")).toBe("You chose this");
    expect(visualStyleSourceLine("")).toBe("");
    expect(visualStyleSourceLine(undefined)).toBe("");
  });
});

describe("style-aware image prompts", () => {
  it("leaves sheet prompts exactly as before with no style", () => {
    const prompt = sheetPrompt("front", { name: "Ada", canon: "Brave." });
    expect(prompt.endsWith(SHEET_SUFFIX)).toBe(true);
    expect(prompt).not.toContain("painterly 2D");
  });

  it("appends the style phrase and notes to sheet prompts", () => {
    const prompt = sheetPrompt(
      "front",
      { name: "Ada", canon: "Brave." },
      undefined,
      STYLED,
    );
    expect(prompt.endsWith("Dark, mythic.")).toBe(true);
    expect(prompt).toContain("painterly 2D animation style");
    expect(prompt).toContain(SHEET_SUFFIX);
  });

  it("leaves scene prompts exactly as before with no style", () => {
    const prompt = scenePrompt({
      part: { title: "The Stream", summary: "Still water." },
      characters: [{ id: "a", name: "Ada" }],
      referenceCount: 1,
    });
    expect(prompt.endsWith(SCENE_SUFFIX)).toBe(true);
  });

  it("appends the style phrase and notes to scene prompts", () => {
    const prompt = scenePrompt({
      part: { title: "The Stream", summary: "Still water." },
      characters: [{ id: "a", name: "Ada" }],
      referenceCount: 1,
      style: STYLED,
    });
    expect(prompt).toContain("painterly 2D animation style");
    expect(prompt).toContain("Dark, mythic.");
    expect(prompt).toContain(SCENE_SUFFIX);
  });

  it("keeps storyboard sketches as pencil sketches, with no style", () => {
    const prompt = sketchPrompt({
      part: { title: "The Stream", summary: "Still water." },
      characters: [],
      referenceCount: 0,
      framing: "wide",
    });
    expect(prompt.endsWith(SKETCH_SUFFIX)).toBe(true);
    expect(prompt).not.toContain("painterly 2D");
  });
});

describe("seed visual style", () => {
  it("sets the sample's Painterly 2D style from its art", async () => {
    const seed = await loadSeed();
    expect(seed.visualStyle).toEqual({
      preset: "Painterly 2D",
      notes:
        "Dark, mythic, painterly digital art, as in the project's existing art.",
    });
    expect(seed.visualStyleSource).toBe("art");
  });
});

describe("sample style upgrade", () => {
  it("fills the visual style an old sample lacks", async () => {
    const seed = await loadSeed();
    const stored: World = {
      ...seed,
      visualStyle: { preset: "", notes: "" },
      visualStyleSource: "",
    };
    const { world, upgraded } = upgradeSampleWorld(stored, seed);
    expect(upgraded).toBe(true);
    expect(world.visualStyle).toEqual(seed.visualStyle);
    expect(world.visualStyleSource).toBe("art");
  });

  it("keeps a style the owner already chose", async () => {
    const seed = await loadSeed();
    const stored: World = {
      ...seed,
      visualStyle: { preset: "Anime", notes: "Bright skies." },
      visualStyleSource: "you",
    };
    const { world, upgraded } = upgradeSampleWorld(stored, seed);
    expect(upgraded).toBe(false);
    expect(world.visualStyle).toEqual({
      preset: "Anime",
      notes: "Bright skies.",
    });
    expect(world.visualStyleSource).toBe("you");
  });
});

describe("read visual style", () => {
  it("returns an empty style by default and requires it in the schema", () => {
    const canon = ReadModelOutputSchema.parse({ title: "T" });
    expect(canon.visualStyle).toEqual({ preset: "", notes: "" });
    const schema = readModelJsonSchema() as {
      required: string[];
      properties: { visualStyle: { required: string[] } };
    };
    expect(schema.required).toContain("visualStyle");
    expect(schema.properties.visualStyle.required).toEqual([
      "preset",
      "notes",
    ]);
  });

  it("sources the style from the art when images were provided", () => {
    const canon = ReadModelOutputSchema.parse({
      title: "T",
      characters: [
        { id: "a", name: "Ada", canon: "Brave.", artFile: "ada.webp" },
      ],
      parts: [{ id: "p1", order: 1, title: "One" }],
      visualStyle: { preset: "Anime", notes: "Bright." },
    });
    const world = buildWorld(
      canon,
      {
        channels: [
          { id: "s", name: "Series", kind: "series", title: "S", pitch: "" },
        ],
        beats: [],
        secrets: [],
      },
      () => "",
    );
    expect(world.visualStyle).toEqual({ preset: "Anime", notes: "Bright." });
    expect(world.visualStyleSource).toBe("art");
  });

  it("sources the style from the reading when no art was provided", () => {
    const canon = ReadModelOutputSchema.parse({
      title: "T",
      characters: [{ id: "a", name: "Ada" }],
      parts: [{ id: "p1", order: 1, title: "One" }],
      visualStyle: { preset: "Watercolour", notes: "Soft." },
    });
    const world = buildWorld(
      canon,
      { channels: [], beats: [], secrets: [] },
      () => "",
    );
    expect(world.visualStyleSource).toBe("muse");
  });

  it("leaves the source empty when no style was suggested", () => {
    const canon = ReadModelOutputSchema.parse({ title: "T" });
    const world = buildWorld(
      canon,
      { channels: [], beats: [], secrets: [] },
      () => "",
    );
    expect(world.visualStyle).toEqual({ preset: "", notes: "" });
    expect(world.visualStyleSource).toBe("");
  });
});

describe("art bible visual style", () => {
  it("opens with the project's visual style", () => {
    const world: World = {
      ...makeScriptWorld(),
      visualStyle: {
        preset: "Painterly 2D",
        notes: "Dark, mythic, painterly digital art.",
      },
      visualStyleSource: "art",
    };
    const bible = gameArtBibleMd(world, { sheets: [], scenes: [] });
    const lines = bible.split("\n");
    expect(lines[0]).toBe("# Art bible — Test Story");
    expect(lines[2]).toBe("## Visual style");
    expect(bible).toContain(
      "Visual style: Painterly 2D. Dark, mythic, painterly digital art.",
    );
    expect(bible.indexOf("## Visual style")).toBeLessThan(
      bible.indexOf("## Palette"),
    );
  });

  it("says so when no style is chosen yet", () => {
    const bible = gameArtBibleMd(makeScriptWorld(), { sheets: [], scenes: [] });
    expect(bible).toContain("No visual style chosen yet.");
  });
});

describe("script draft visual style", () => {
  beforeEach(() => {
    __resetBudgetMemory();
    vi.stubEnv("MODEL_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    __resetBudgetMemory();
  });

  it("mentions the visual style in one line when one is set", async () => {
    const world: World = {
      ...makeScriptWorld(),
      visualStyle: { preset: "Painterly 2D", notes: "Dark, mythic." },
      visualStyleSource: "art",
    };
    const fetchMock = mockModel(JSON.stringify({ text: "A new scene." }));
    const res = await draftPOST(
      post("/api/script/draft", {
        world,
        channelId: "series",
        partId: "part-1",
        mode: "draft",
      }),
    );
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(init.body as string) as { input: string };
    expect(body.input).toContain("Visual style: Painterly 2D. Dark, mythic.");
    expect(body.input.split("\n").filter((line) => line.startsWith("Visual style:")).length).toBe(1);
  });

  it("adds no style line when none is set", async () => {
    const fetchMock = mockModel(JSON.stringify({ text: "A new scene." }));
    const res = await draftPOST(
      post("/api/script/draft", {
        world: makeScriptWorld(),
        channelId: "series",
        partId: "part-1",
        mode: "draft",
      }),
    );
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(init.body as string) as { input: string };
    expect(body.input).not.toContain("Visual style:");
  });
});

describe("channel editing", () => {
  function channelWorld(): World {
    return WorldSchema.parse({
      id: "test-channels",
      title: "Test Channels",
      premise: "A premise.",
      logline: "A logline.",
      characters: [{ id: "ada", name: "Ada", canon: "Brave.", sheet: [] }],
      locations: [],
      channels: [
        {
          id: "series",
          name: "Series",
          kind: "series",
          title: "The Series",
          pitch: "Her whole life.",
          secret: "why the baby lived",
        },
        {
          id: "game",
          name: "Game",
          kind: "game",
          title: "The Hunt",
          pitch: "Face the water.",
          secret: "",
        },
      ],
      parts: [
        {
          id: "part-1",
          order: 1,
          title: "Beginnings",
          summary: "Ada arrives.",
          excerpt: "She came at dawn.",
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
          unitLabel: "The hunt",
          content: "Ada hunts.",
          characterIds: ["ada"],
        },
      ],
      secrets: [
        {
          id: "s-series",
          text: "Why the baby lived",
          knownThrough: ["series"],
          note: "Only the series reveals this.",
        },
        {
          id: "s-game",
          text: "What the stream hides",
          knownThrough: ["game"],
          note: "Only the game reveals this.",
        },
      ],
      gaps: [],
      packs: [
        {
          partId: "part-1",
          channelId: "game",
          script: "",
          shots: [],
          posts: [],
          reveals: [],
          additions: [],
        },
      ],
      scripts: [
        {
          channelId: "game",
          partId: "part-1",
          text: "Game draft.",
          updatedAt: 1,
        },
      ],
      shorts: [
        {
          id: "short-1",
          channelId: "game",
          partId: "part-1",
          title: "Short",
          aspect: "16:9",
          shots: [],
        },
      ],
      storyboards: [
        {
          id: "board-1",
          channelId: "game",
          partId: "part-1",
          title: "Board",
          frames: [],
        },
      ],
    });
  }

  it("labels every channel kind", () => {
    expect(Object.keys(CHANNEL_KIND_LABELS).sort()).toEqual(
      [...ChannelKindSchema.options].sort(),
    );
  });

  it("patches one screen and leaves the other alone", () => {
    const world = channelWorld();
    const next = updateChannel(world, "game", {
      title: "The Deep Hunt",
      pitch: "New pitch.",
      kind: "film",
      name: "Film",
      secret: "a new secret",
    });
    const game = next.channels.find((c) => c.id === "game");
    expect(game).toMatchObject({
      title: "The Deep Hunt",
      pitch: "New pitch.",
      kind: "film",
      name: "Film",
      secret: "a new secret",
    });
    expect(next.channels.find((c) => c.id === "series")).toEqual(
      world.channels.find((c) => c.id === "series"),
    );
    expect(next.beats).toEqual(world.beats);
  });

  it("removes the screen and everything told only through it", () => {
    const next = removeChannel(channelWorld(), "game");
    expect(next.channels.map((c) => c.id)).toEqual(["series"]);
    expect(next.beats.map((b) => b.id)).toEqual(["beat-series-1"]);
    expect(next.packs).toEqual([]);
    expect(next.scripts).toEqual([]);
    expect(next.shorts).toEqual([]);
    expect(next.storyboards).toEqual([]);
    // The game secret stays, but names no screen.
    const gameSecret = next.secrets.find((s) => s.id === "s-game");
    expect(gameSecret?.knownThrough).toEqual([]);
    expect(next.secrets.find((s) => s.id === "s-series")?.knownThrough).toEqual(
      ["series"],
    );
  });
});

describe("book chrome in canon.css", () => {
  it("pins the side columns and pads the open card", async () => {
    const css = await readFile(
      join(process.cwd(), "app", "canon.css"),
      "utf-8",
    );
    expect(css).toContain("position: sticky;");
    expect(css).toContain("max-height: 100vh;");
    expect(css).toContain(".viewswitch");
    expect(css).toContain(".chanedit");
    expect(css).toContain(".stylechips");
    // At least 16px below the "Open in Characters" button.
    expect(css).toContain("padding: 14px 16px 20px;");
  });
});
