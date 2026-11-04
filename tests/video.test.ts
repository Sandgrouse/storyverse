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
  VIDEO_PLAN_JSON_SCHEMA,
  availableArtPaths,
  clampShotDuration,
  moveShot,
  planToShort,
  sanitizePlannedShots,
  shortForScene,
  shotFrames,
  shotStartFrames,
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

  it("fails with the friendly message when fewer than 2 shots are usable", async () => {
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
    expect(res.status).toBe(500);
    const json = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(json.error.message).toBe(VIDEO_PLAN_FAILED_MESSAGE);
  });

  it("fails when only one shot survives sanitizing", async () => {
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
