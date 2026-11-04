import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as planPOST } from "@/app/api/video/plan/route";
import { __resetBudgetMemory } from "@/lib/budget";
import {
  dropStoredRefs,
  extractImageEntries,
  restoreImageRefs,
} from "@/lib/images";
import { mergeWorldAssets } from "@/lib/projects";
import { upsertScript } from "@/lib/script";
import { stripImageData } from "@/lib/story";
import {
  VIDEO_PLAN_FAILED_MESSAGE,
  VIDEO_PLAN_INSTRUCTIONS,
  VIDEO_PLAN_JSON_SCHEMA,
  availableArtPaths,
  clampShotDuration,
  fitPlayer,
  isPortraitArt,
  moveShot,
  planToShort,
  sanitizePlannedShots,
  scenesByChannel,
  shortForScene,
  shotFrames,
  shotObjectPosition,
  shotStartFrames,
  storyboardGuidance,
  storyboardShotDuration,
  shotsFromStoryboard,
  toPlannedShots,
  totalFrames,
  totalSeconds,
  truncateCaption,
  upsertShort,
  videoPlanInput,
} from "@/lib/video";
import { WorldSchema, type World } from "@/lib/world/schemas";

const SERIES_SECRET = "the baby lived because of SERIES_MARKER";
const GAME_SECRET = "the stream hides GAME_MARKER";
const SERIES_CHANNEL_SECRET = "SERIES_CHANNEL_SECRET why the baby lived";
const GAME_CHANNEL_SECRET = "GAME_CHANNEL_SECRET what the stream keeps";

function makeWorld(): World {
  return WorldSchema.parse({
    id: "test-story",
    title: "Test Story",
    premise: "A premise.",
    logline: "A logline.",
    characters: [
      { id: "ada", name: "Ada", canon: "Brave and tall.", sheet: [] },
      {
        id: "anukili-ugama",
        name: "Anukili Ugama",
        canon: "A child of wonder.",
        sheet: [],
      },
    ],
    locations: [
      { id: "stream", name: "The stream", description: "Cold water." },
    ],
    channels: [
      {
        id: "shorts",
        name: "Shorts",
        kind: "shorts",
        title: "The Shorts",
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
        imagePath: "scene/part-1.webp",
        characterIds: ["ada"],
      },
    ],
    beats: [
      {
        id: "beat-shorts-1",
        order: 1,
        timeLabel: "Part 1",
        title: "Arrival",
        channelId: "shorts",
        partId: "part-1",
        unitLabel: "Short 1",
        content: "Ada arrives legs first.",
        characterIds: ["ada"],
      },
    ],
    secrets: [
      {
        id: "s-series",
        text: SERIES_SECRET,
        knownThrough: ["shorts"],
        note: "Shown, never said.",
      },
      {
        id: "s-game",
        text: GAME_SECRET,
        knownThrough: ["game"],
        note: "Found in the level.",
      },
    ],
    gaps: [],
  });
}

function shot(caption: string, durationSec = 5) {
  return {
    imagePath: "scene/part-1.webp",
    caption,
    durationSec,
    motion: "push" as const,
    voice: null,
  };
}

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

describe("video channel knowledge rule", () => {
  it("gives the plan prompt only the secrets this channel may know", () => {
    const world = makeWorld();
    const input = videoPlanInput(world, "shorts", "part-1");
    expect(input).toContain("SERIES_MARKER");
    expect(input).toContain("SERIES_CHANNEL_SECRET");
    expect(input).not.toContain("GAME_MARKER");
    expect(input).not.toContain("GAME_CHANNEL_SECRET");
  });

  it("uses real names and never renames anyone", () => {
    const world = makeWorld();
    const input = videoPlanInput(world, "shorts", "part-1");
    expect(input).toContain("Ada");
  });

  it("uses the scene's script when there is one, else the beats", () => {
    const world = makeWorld();
    expect(videoPlanInput(world, "shorts", "part-1")).toContain(
      "Ada arrives legs first.",
    );
    const withScript = upsertScript(
      world,
      "shorts",
      "part-1",
      "Ada speaks to the water.",
    );
    const input = videoPlanInput(withScript, "shorts", "part-1");
    expect(input).toContain("Ada speaks to the water.");
  });

  it("never sends another channel's secret text to the plan model", async () => {
    const world = makeWorld();
    const fetchMock = mockModel(
      JSON.stringify({
        title: "Arrival",
        shots: [shot("One", 4), shot("Two", 4), shot("Three", 4), shot("Four", 4)],
      }),
    );
    const res = await planPOST(
      post("/api/video/plan", {
        world,
        channelId: "shorts",
        partId: "part-1",
      }),
    );
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(init.body as string) as { input: string };
    expect(body.input).toContain("SERIES_MARKER");
    expect(body.input).not.toContain("GAME_MARKER");
    expect(body.input).not.toContain("GAME_CHANNEL_SECRET");
  });
});

describe("video plan validation and art fallback", () => {
  it("rejects an unknown part or channel", async () => {
    const world = makeWorld();
    const missing = await planPOST(
      post("/api/video/plan", {
        world,
        channelId: "shorts",
        partId: "nope",
      }),
    );
    expect(missing.status).toBe(400);
    const wrong = await planPOST(
      post("/api/video/plan", {
        world,
        channelId: "nope",
        partId: "part-1",
      }),
    );
    expect(wrong.status).toBe(400);
  });

  it("rejects a channel that does not cover the part", async () => {
    const world = makeWorld();
    const res = await planPOST(
      post("/api/video/plan", {
        world,
        channelId: "game",
        partId: "part-1",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("asks the model for at least 4 shots", () => {
    expect(VIDEO_PLAN_INSTRUCTIONS).toContain("Return at least 4 shots");
  });

  it("keeps the shots when fewer than 4 come back", async () => {
    mockModel(
      JSON.stringify({
        title: "Arrival",
        shots: [shot("One", 4), shot("Two", 4), shot("Three", 4)],
      }),
    );
    const res = await planPOST(
      post("/api/video/plan", {
        world: makeWorld(),
        channelId: "shorts",
        partId: "part-1",
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { short: World["shorts"][number] };
    expect(json.short.shots).toHaveLength(3);
  });

  it("keeps a single usable shot instead of failing", async () => {
    mockModel(
      JSON.stringify({ title: "Arrival", shots: [shot("One", 4)] }),
    );
    const res = await planPOST(
      post("/api/video/plan", {
        world: makeWorld(),
        channelId: "shorts",
        partId: "part-1",
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { short: World["shorts"][number] };
    expect(json.short.shots).toHaveLength(1);
  });

  it("keeps the one shot that survives sanitizing", async () => {
    mockModel(
      JSON.stringify({
        title: "Arrival",
        shots: [shot("", 4), shot("Only", 4)],
      }),
    );
    const res = await planPOST(
      post("/api/video/plan", {
        world: makeWorld(),
        channelId: "shorts",
        partId: "part-1",
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { short: World["shorts"][number] };
    expect(json.short.shots).toHaveLength(1);
    expect(json.short.shots[0].caption).toBe("Only");
  });

  it("fails with the friendly message only when no usable shots remain", async () => {
    mockModel(JSON.stringify({ title: "Arrival", shots: [shot("", 4)] }));
    const res = await planPOST(
      post("/api/video/plan", {
        world: makeWorld(),
        channelId: "shorts",
        partId: "part-1",
      }),
    );
    expect(res.status).toBe(500);
    const json = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(json.error.message).toBe(VIDEO_PLAN_FAILED_MESSAGE);
  });

  it("truncates a long caption and clamps a slow shot instead of failing", async () => {
    mockModel(
      JSON.stringify({
        title: "Arrival",
        shots: [
          shot(`Ada walks beside the cold water while the ${"light ".repeat(20)}`, 4),
          shot("Two", 30),
          {
            ...shot("Three", 2),
            voice: { characterId: "ada", text: "I am here." },
          },
          shot("Four", 4),
        ],
      }),
    );
    const res = await planPOST(
      post("/api/video/plan", {
        world: makeWorld(),
        channelId: "shorts",
        partId: "part-1",
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { short: World["shorts"][number] };
    expect(json.short.shots).toHaveLength(4);
    expect(json.short.shots[0].caption.length).toBeLessThanOrEqual(90);
    expect(json.short.shots[1].durationSec).toBe(7);
    expect(json.short.shots[2].durationSec).toBe(3);
    expect(json.short.shots[2].voice).toEqual({
      characterId: "ada",
      lineId: "",
      text: "I am here.",
    });
    expect(json.short.shots[3].voice).toBeUndefined();
  });

  it("keeps at most 6 shots", async () => {
    mockModel(
      JSON.stringify({
        title: "Arrival",
        shots: ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"].map(
          (caption) => shot(caption, 4),
        ),
      }),
    );
    const res = await planPOST(
      post("/api/video/plan", {
        world: makeWorld(),
        channelId: "shorts",
        partId: "part-1",
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { short: World["shorts"][number] };
    expect(json.short.shots).toHaveLength(6);
  });

  it("falls back to the part's own art for unknown images", () => {
    const world = makeWorld();
    const shots = toPlannedShots(
      [
        { ...shot("Known", 4), imagePath: "scene/part-1.webp" },
        { ...shot("Unknown", 4), imagePath: "nope/missing.webp" },
      ],
      world,
      "part-1",
    );
    expect(shots[0].imagePath).toBe("scene/part-1.webp");
    expect(shots[1].imagePath).toBe("scene/part-1.webp");
  });

  it("drops a voice line for an unknown character", () => {
    const world = makeWorld();
    const shots = toPlannedShots(
      [
        {
          ...shot("Ghost", 4),
          voice: { characterId: "nobody", text: "Boo." },
        },
        {
          ...shot("Ada speaks", 4),
          voice: { characterId: "ada", text: "I am here." },
        },
      ],
      world,
      "part-1",
    );
    expect(shots[0].voice).toBeUndefined();
    expect(shots[1].voice).toEqual({
      characterId: "ada",
      lineId: "",
      text: "I am here.",
    });
  });

  it("falls back at the route level too", async () => {
    mockModel(
      JSON.stringify({
        title: "Arrival",
        shots: [
          { ...shot("One", 4), imagePath: "nope/missing.webp" },
          shot("Two", 5),
          shot("Three", 5),
          shot("Four", 5),
        ],
      }),
    );
    const res = await planPOST(
      post("/api/video/plan", {
        world: makeWorld(),
        channelId: "shorts",
        partId: "part-1",
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { short: World["shorts"][number] };
    expect(json.short.shots).toHaveLength(4);
    expect(json.short.shots[0].imagePath).toBe("scene/part-1.webp");
    expect(json.short.channelId).toBe("shorts");
    expect(json.short.partId).toBe("part-1");
  });

  it("needs a key to plan", async () => {
    vi.stubEnv("MODEL_API_KEY", "");
    const res = await planPOST(
      post("/api/video/plan", {
        world: makeWorld(),
        channelId: "shorts",
        partId: "part-1",
      }),
    );
    expect(res.status).toBe(503);
  });
});

describe("video scene list", () => {
  it("lists every channel with beats under its own name, in story order", () => {
    const world = makeWorld();
    const groups = scenesByChannel(world);
    expect(groups.map((g) => g.channel.name)).toEqual(["Shorts"]);
    expect(groups[0]?.beats.map((b) => b.unitLabel)).toEqual(["Short 1"]);
  });

  it("leaves out channels with no beats", () => {
    const world = WorldSchema.parse({
      ...makeWorld(),
      channels: [
        ...makeWorld().channels,
        { id: "press", name: "Press", kind: "press", title: "The Press" },
      ],
    });
    expect(scenesByChannel(world).map((g) => g.channel.id)).toEqual(["shorts"]);
  });
});

function boardedWorld(): World {
  const world = makeWorld();
  return WorldSchema.parse({
    ...world,
    storyboards: [
      {
        id: "shorts::part-1",
        channelId: "shorts",
        partId: "part-1",
        title: "Beginnings",
        frames: [
          {
            id: "frame-1",
            framing: "wide",
            action: "Ada reaches the water",
            dialogue: "I am here.",
            characterIds: ["ada"],
          },
          {
            id: "frame-2",
            framing: "close",
            action: "The water rises",
            characterIds: ["ada"],
          },
        ],
      },
    ],
  });
}

describe("storyboard guidance", () => {
  it("turns each frame into guidance text", () => {
    const lines = storyboardGuidance(boardedWorld(), "shorts", "part-1");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("wide");
    expect(lines[0]).toContain("Ada reaches the water");
    expect(lines[0]).toContain("I am here.");
    expect(lines[1]).toContain("close");
  });

  it("stays empty when the scene has no board", () => {
    expect(storyboardGuidance(makeWorld(), "shorts", "part-1")).toEqual([]);
    expect(storyboardGuidance(boardedWorld(), "game", "part-1")).toEqual([]);
  });

  it("guides the plan prompt when a board exists", () => {
    const input = videoPlanInput(boardedWorld(), "shorts", "part-1");
    expect(input).toContain("Storyboard guidance");
    expect(input).toContain("Ada reaches the water");
  });

  it("keeps the knowledge rule with a board on the scene", async () => {
    const fetchMock = mockModel(
      JSON.stringify({
        title: "Arrival",
        shots: [shot("One", 4), shot("Two", 4), shot("Three", 4), shot("Four", 4)],
      }),
    );
    const res = await planPOST(
      post("/api/video/plan", {
        world: boardedWorld(),
        channelId: "shorts",
        partId: "part-1",
      }),
    );
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(init.body as string) as { input: string };
    expect(body.input).toContain("Ada reaches the water");
    expect(body.input).toContain("SERIES_MARKER");
    expect(body.input).not.toContain("GAME_MARKER");
    expect(body.input).not.toContain("GAME_CHANNEL_SECRET");
  });
});

describe("video plan schema contract", () => {
  it("lists every property in required, for every object", () => {
    const gaps: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (node === null || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      const properties = record.properties;
      if (
        record.type === "object" &&
        properties !== null &&
        typeof properties === "object"
      ) {
        const keys = Object.keys(properties);
        const required = record.required;
        if (
          !Array.isArray(required) ||
          keys.some((key) => !required.includes(key))
        ) {
          gaps.push(path);
        }
        for (const key of keys) {
          walk((properties as Record<string, unknown>)[key], `${path}.${key}`);
        }
      }
      const items = record.items;
      if (
        record.type === "array" &&
        items !== null &&
        typeof items === "object"
      ) {
        walk(items, `${path}[]`);
      }
      if (Array.isArray(record.anyOf)) {
        record.anyOf.forEach((branch, index) => {
          walk(branch, `${path}#${index}`);
        });
      }
    };
    walk(VIDEO_PLAN_JSON_SCHEMA, "$");
    expect(gaps).toEqual([]);
  });

  it("sends voice as required and nullable, with no shot-count limits", () => {
    const shots = VIDEO_PLAN_JSON_SCHEMA.properties.shots;
    expect("minItems" in shots).toBe(false);
    expect("maxItems" in shots).toBe(false);
    expect(shots.items.required).toContain("voice");
    expect(shots.items.properties.voice.anyOf[1]).toEqual({ type: "null" });
  });
});

describe("video plan sanitizing", () => {
  it("leaves a short caption alone", () => {
    expect(truncateCaption("Ada arrives.")).toBe("Ada arrives.");
  });

  it("cuts a long caption at a word boundary", () => {
    const caption =
      `Ada walks beside the cold water while the ${"light ".repeat(20)}`.trim();
    expect(caption.length).toBeGreaterThan(90);
    const cut = truncateCaption(caption);
    expect(cut.length).toBeLessThanOrEqual(90);
    expect(caption.startsWith(cut)).toBe(true);
    expect(cut).not.toMatch(/\s$/);
    expect(caption[cut.length]).toBe(" ");
  });

  it("hard-cuts a caption with no word boundary", () => {
    expect(truncateCaption("A".repeat(200))).toBe("A".repeat(90));
  });

  it("clamps durations to 3 to 7 seconds", () => {
    expect(clampShotDuration(30)).toBe(7);
    expect(clampShotDuration(1)).toBe(3);
    expect(clampShotDuration(5)).toBe(5);
    expect(clampShotDuration(Number.NaN)).toBeNull();
  });

  it("maps null voice to no voice and drops an empty voice", () => {
    const usable = sanitizePlannedShots([
      { ...shot("One", 4), voice: null },
      { ...shot("Two", 4), voice: { characterId: "", text: "" } },
    ]);
    expect(usable).toHaveLength(2);
    expect(usable[0]?.voice).toBeUndefined();
    expect(usable[1]?.voice).toBeUndefined();
  });

  it("keeps a real voice line", () => {
    const usable = sanitizePlannedShots([
      {
        ...shot("Ada speaks", 4),
        voice: { characterId: "ada", text: "I am here." },
      },
    ]);
    expect(usable[0]?.voice).toEqual({
      characterId: "ada",
      text: "I am here.",
    });
  });
});

describe("short storage", () => {
  it("adds up one short per channel and part", () => {
    const world = makeWorld();
    const short = planToShort({
      channelId: "shorts",
      partId: "part-1",
      title: "Arrival",
      shots: toPlannedShots([shot("One", 4), shot("Two", 5)], world, "part-1"),
    });
    expect(short.id).toBe("shorts::part-1");
    const next = upsertShort(world, short);
    expect(shortForScene(next, "shorts", "part-1")?.title).toBe("Arrival");
    const again = upsertShort(next, { ...short, title: "Retitled" });
    expect(again.shorts).toHaveLength(1);
    expect(shortForScene(again, "shorts", "part-1")?.title).toBe("Retitled");
  });
});

describe("shot frames", () => {
  const frames = [shot("One", 5), shot("Two", 5), shot("Three", 4)].map(
    (entry, index) => ({ ...entry, id: `shot-${index + 1}` }),
  );

  it("holds each shot for duration times 30 fps", () => {
    expect(shotFrames(5)).toBe(150);
    expect(shotFrames(4)).toBe(120);
  });

  it("overlaps shots by the 12-frame crossfade", () => {
    expect(shotStartFrames(frames)).toEqual([0, 138, 276]);
    expect(totalFrames(frames)).toBe(276 + 120);
    expect(totalSeconds(frames)).toBeCloseTo((276 + 120) / 30);
  });

  it("counts a single shot with no overlap", () => {
    expect(totalFrames(frames.slice(0, 1))).toBe(150);
    expect(totalFrames([])).toBe(0);
  });
});

describe("shot ordering", () => {
  const frames = ["a", "b", "c", "d"].map((caption, index) => ({
    ...shot(caption, 4),
    id: `shot-${index + 1}`,
  }));

  it("moves a shot to its new index", () => {
    expect(moveShot(frames, 0, 2).map((s) => s.id)).toEqual([
      "shot-2",
      "shot-3",
      "shot-1",
      "shot-4",
    ]);
    expect(moveShot(frames, 3, 0).map((s) => s.id)).toEqual([
      "shot-4",
      "shot-1",
      "shot-2",
      "shot-3",
    ]);
  });

  it("leaves the order alone for a no-op or bad index", () => {
    expect(moveShot(frames, 1, 1)).toEqual(frames);
    expect(moveShot(frames, -1, 2)).toEqual(frames);
    expect(moveShot(frames, 0, 99).map((s) => s.id)[3]).toBe("shot-1");
  });
});

describe("player fit", () => {
  // Stage boxes measured from the page grid at real viewports: 1440x900
  // leaves about 1080x574 for the frame, 1280x720 about 920x394, after
  // the top bar, the timeline row, the stage padding and the transport.
  it("fits the tall player inside the stage height at 1440x900", () => {
    const fitted = fitPlayer(1080, 574, true);
    expect(fitted.height).toBe(574);
    expect(fitted.width).toBe(Math.floor((574 * 9) / 16));
    expect(fitted.width).toBeLessThanOrEqual(1080);
  });

  it("fits the wide player inside the stage height at 1440x900", () => {
    const fitted = fitPlayer(1080, 574, false);
    expect(fitted.height).toBe(574);
    expect(fitted.width).toBe(Math.floor((574 * 16) / 9));
    expect(fitted.width).toBeLessThanOrEqual(1080);
  });

  it("fits both shapes inside the stage at 1280x720", () => {
    const tall = fitPlayer(920, 394, true);
    expect(tall).toEqual({
      width: Math.floor((394 * 9) / 16),
      height: 394,
    });
    const wide = fitPlayer(920, 394, false);
    expect(wide).toEqual({
      width: Math.floor((394 * 16) / 9),
      height: 394,
    });
  });

  it("shrinks to the stage width when height alone overflows", () => {
    expect(fitPlayer(200, 1000, false)).toEqual({
      width: 200,
      height: Math.floor((200 * 9) / 16),
    });
    expect(fitPlayer(200, 1000, true)).toEqual({ width: 200, height: 355 });
  });

  it("never goes negative on an unmeasured stage", () => {
    expect(fitPlayer(0, 0, true)).toEqual({ width: 0, height: 0 });
    expect(fitPlayer(0, 0, false)).toEqual({ width: 0, height: 0 });
  });
});

describe("shot framing", () => {
  it("spots portrait art by its natural size", () => {
    expect(isPortraitArt(720, 1280)).toBe(true);
    expect(isPortraitArt(1280, 720)).toBe(false);
    expect(isPortraitArt(720, 720)).toBe(false);
  });

  it("anchors portrait art near the top in a wide cut", () => {
    expect(shotObjectPosition(true, false)).toBe("50% 12%");
  });

  it("keeps landscape art and tall cuts centred", () => {
    expect(shotObjectPosition(false, false)).toBe("50% 50%");
    expect(shotObjectPosition(true, true)).toBe("50% 50%");
    expect(shotObjectPosition(false, true)).toBe("50% 50%");
  });
});

describe("shots from storyboard frames", () => {
  const SKETCH_A = "data:image/webp;base64,QUJD";
  const SKETCH_B = "data:image/webp;base64,REVG";

  function sketchedFrames() {
    return [
      {
        imagePath: SKETCH_A,
        action: "Ada reaches the water.",
        dialogue: "I am here.",
        characterIds: ["ada"],
      },
      {
        imagePath: "",
        action: "A frame with no picture yet.",
        characterIds: ["ada"],
      },
      {
        imagePath: SKETCH_B,
        action: "The water rises around her.",
        characterIds: ["ada"],
      },
    ];
  }

  it("keeps the frames in order and skips frames with no picture", () => {
    const shots = shotsFromStoryboard(sketchedFrames(), { voices: true });
    expect(shots).toHaveLength(2);
    expect(shots[0]?.imagePath).toBe(SKETCH_A);
    expect(shots[1]?.imagePath).toBe(SKETCH_B);
  });

  it("takes the caption from the frame's action", () => {
    const shots = shotsFromStoryboard(sketchedFrames(), { voices: true });
    expect(shots[0]?.caption).toBe("Ada reaches the water.");
    expect(shots[1]?.caption).toBe("The water rises around her.");
  });

  it("holds longer text longer, from 3 to 6 seconds", () => {
    const short = storyboardShotDuration("Ada looks up.");
    const medium = storyboardShotDuration(
      "Ada reaches the still water at dawn and kneels to drink.",
      "I am here.",
    );
    const long = storyboardShotDuration(
      `Ada walks beside the cold water while the ${"light ".repeat(30)}`.trim(),
      "I have come so far to find you at last, hear me now.",
    );
    expect(short).toBe(3);
    expect(long).toBe(6);
    expect(medium).toBeGreaterThan(short);
    expect(medium).toBeLessThan(long);
    for (const shots of [
      shotsFromStoryboard(sketchedFrames(), { voices: true }),
    ]) {
      for (const shot of shots) {
        expect(shot.durationSec).toBeGreaterThanOrEqual(3);
        expect(shot.durationSec).toBeLessThanOrEqual(6);
      }
    }
  });

  it("speaks the frame's dialogue as the voice line when voices are on", () => {
    const shots = shotsFromStoryboard(sketchedFrames(), { voices: true });
    expect(shots[0]?.voice).toEqual({
      characterId: "ada",
      text: "I am here.",
    });
    expect(shots[1]?.voice).toBeUndefined();
  });

  it("leaves every voice line off when voices are off", () => {
    const shots = shotsFromStoryboard(sketchedFrames(), { voices: false });
    expect(shots).toHaveLength(2);
    expect(shots.every((shot) => shot.voice === undefined)).toBe(true);
  });

  it("pushes slowly into every storyboard shot", () => {
    const shots = shotsFromStoryboard(sketchedFrames(), { voices: true });
    expect(shots.every((shot) => shot.motion === "push")).toBe(true);
  });
});

describe("shot image refs", () => {
  const DATA = "data:image/webp;base64,QUJD";

  function worldWithShotArt(): World {
    const world = makeWorld();
    const short = planToShort({
      channelId: "shorts",
      partId: "part-1",
      title: "Arrival",
      shots: toPlannedShots([shot("One", 4)], world, "part-1"),
    });
    return upsertShort(world, {
      ...short,
      shots: [{ ...short.shots[0]!, imagePath: DATA }],
    });
  }

  it("extracts shot data URLs into named refs and restores them", () => {
    const { world: refs, entries } = extractImageEntries(worldWithShotArt());
    expect(entries.length).toBe(1);
    expect(JSON.stringify(refs)).not.toContain("data:image");
    const images: Record<string, string> = {};
    for (const entry of entries) images[entry.name] = entry.dataUrl;
    const restored = restoreImageRefs(refs, images);
    expect(restored.shorts[0].shots[0].imagePath).toBe(DATA);
  });

  it("drops stored shot refs so nothing renders broken", () => {
    const { world: refs } = extractImageEntries(worldWithShotArt());
    expect(dropStoredRefs(refs).shorts[0].shots[0].imagePath).toBe("");
  });

  it("strips shot data URLs before a plan request", () => {
    const stripped = stripImageData(worldWithShotArt());
    expect(stripped.shorts[0].shots[0].imagePath).toBe("");
  });

  it("keeps stored shorts when new material arrives", () => {
    const oldWorld = worldWithShotArt();
    const nextWorld = { ...makeWorld(), shorts: [] };
    const merged = mergeWorldAssets(oldWorld, nextWorld);
    expect(merged.shorts).toHaveLength(1);
    expect(merged.shorts[0].title).toBe("Arrival");
  });

  it("lists shot art among the available art", () => {
    expect(availableArtPaths(makeWorld())).toContain("scene/part-1.webp");
  });
});
