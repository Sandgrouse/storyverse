import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as planPOST } from "@/app/api/storyboard/plan/route";
import { POST as scenePOST } from "@/app/api/art/scene/route";
import { SKETCH_SUFFIX, SCENE_SUFFIX } from "@/lib/art";
import { __resetBudgetMemory, checkBudget } from "@/lib/budget";
import {
  dropStoredRefs,
  extractImageEntries,
  restoreImageRefs,
} from "@/lib/images";
import { storyboardJson, planAgentFiles, packageTree } from "@/lib/package";
import { mergeWorldAssets } from "@/lib/projects";
import { upsertScript } from "@/lib/script";
import { stripImageData } from "@/lib/story";
import {
  STORYBOARD_PLAN_FAILED_MESSAGE,
  STORYBOARD_PLAN_INSTRUCTIONS,
  STORYBOARD_PLAN_JSON_SCHEMA,
  moveFrame,
  planToStoryboard,
  sanitizePlannedFrames,
  storyboardForScene,
  storyboardPlanInput,
  toPlannedFrames,
  truncateToLimit,
  upsertStoryboard,
} from "@/lib/storyboard";
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
    ],
    gaps: [],
  });
}

function frame(
  action: string,
  extra?: Partial<{
    framing: "wide" | "medium" | "close" | "over-shoulder" | "overhead";
    dialogue: string | null;
    camera: string | null;
    characterIds: string[];
  }>,
) {
  return {
    framing: "wide" as const,
    action,
    dialogue: null,
    camera: null,
    characterIds: ["ada"],
    ...extra,
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

function imagePayload(result = "QUJD", id = "resp-img-1"): unknown {
  return {
    id,
    output: [{ type: "image_generation_call", result }],
    usage: { input_tokens: 10, output_tokens: 20 },
  };
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

describe("storyboard channel knowledge rule", () => {
  it("gives the plan prompt only the secrets this channel may know", () => {
    const world = makeWorld();
    const input = storyboardPlanInput(world, "series", "part-1");
    expect(input).toContain("SERIES_MARKER");
    expect(input).toContain("SERIES_CHANNEL_SECRET");
    expect(input).not.toContain("GAME_MARKER");
    expect(input).not.toContain("GAME_CHANNEL_SECRET");
  });

  it("uses real names and never renames anyone", () => {
    const world = makeWorld();
    const input = storyboardPlanInput(world, "series", "part-1");
    expect(input).toContain("Ada");
  });

  it("uses the scene's script when there is one, else the beats", () => {
    const world = makeWorld();
    expect(storyboardPlanInput(world, "series", "part-1")).toContain(
      "Ada arrives legs first.",
    );
    const withScript = upsertScript(
      world,
      "series",
      "part-1",
      "Ada speaks to the water.",
    );
    const input = storyboardPlanInput(withScript, "series", "part-1");
    expect(input).toContain("Ada speaks to the water.");
  });

  it("never sends another channel's secret text to the plan model", async () => {
    const world = makeWorld();
    const fetchMock = mockModel(
      JSON.stringify({
        title: "Arrival",
        frames: [
          frame("One"),
          frame("Two"),
          frame("Three"),
          frame("Four"),
        ],
      }),
    );
    const res = await planPOST(
      post("/api/storyboard/plan", {
        world,
        channelId: "series",
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

describe("storyboard plan validation", () => {
  it("rejects an unknown part or channel", async () => {
    const world = makeWorld();
    const missing = await planPOST(
      post("/api/storyboard/plan", {
        world,
        channelId: "series",
        partId: "nope",
      }),
    );
    expect(missing.status).toBe(400);
    const wrong = await planPOST(
      post("/api/storyboard/plan", {
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
      post("/api/storyboard/plan", {
        world,
        channelId: "game",
        partId: "part-1",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a malformed body", async () => {
    const res = await planPOST(
      post("/api/storyboard/plan", { world: makeWorld() }),
    );
    expect(res.status).toBe(400);
  });

  it("asks the model for 4 to 8 frames", () => {
    expect(STORYBOARD_PLAN_INSTRUCTIONS).toContain("4 to 8 frames");
  });

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
    walk(STORYBOARD_PLAN_JSON_SCHEMA, "$");
    expect(gaps).toEqual([]);
  });

  it("sends dialogue and camera as required and nullable", () => {
    const frames = STORYBOARD_PLAN_JSON_SCHEMA.properties.frames;
    expect(frames.items.required).toContain("dialogue");
    expect(frames.items.required).toContain("camera");
    expect(frames.items.properties.dialogue.anyOf[1]).toEqual({
      type: "null",
    });
    expect(frames.items.properties.camera.anyOf[1]).toEqual({ type: "null" });
  });

  it("charges two cents for a storyboard plan", async () => {
    vi.stubEnv("DAILY_BUDGET_CENTS", "3");
    vi.stubEnv("VISITOR_BUDGET_CENTS", "1000");
    const req = (ip: string) =>
      new Request("http://localhost/api/storyboard/plan", {
        method: "POST",
        headers: { "x-forwarded-for": ip },
      });
    expect(await checkBudget("storyboard-plan", req("9.9.9.9"))).toEqual({
      allowed: true,
    });
    expect(await checkBudget("storyboard-plan", req("9.9.9.9"))).toEqual({
      allowed: false,
      scope: "daily",
    });
  });

  it("fails with the friendly message when no usable frames remain", async () => {
    mockModel(JSON.stringify({ title: "Arrival", frames: [frame("")] }));
    const res = await planPOST(
      post("/api/storyboard/plan", {
        world: makeWorld(),
        channelId: "series",
        partId: "part-1",
      }),
    );
    expect(res.status).toBe(500);
    const json = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(json.error.message).toBe(STORYBOARD_PLAN_FAILED_MESSAGE);
  });

  it("needs a key to plan", async () => {
    vi.stubEnv("MODEL_API_KEY", "");
    const res = await planPOST(
      post("/api/storyboard/plan", {
        world: makeWorld(),
        channelId: "series",
        partId: "part-1",
      }),
    );
    expect(res.status).toBe(503);
  });
});

describe("storyboard plan sanitizing", () => {
  it("truncates long action, dialogue and camera lines", () => {
    const usable = sanitizePlannedFrames([
      {
        ...frame("x"),
        action: `Ada walks beside the cold water while the ${"light ".repeat(30)}`.trim(),
        dialogue: "y".repeat(200),
        camera: "z".repeat(200),
      },
    ]);
    expect(usable[0]?.action.length).toBeLessThanOrEqual(160);
    expect(usable[0]?.dialogue?.length).toBeLessThanOrEqual(120);
    expect(usable[0]?.camera?.length).toBeLessThanOrEqual(80);
  });

  it("maps null dialogue and camera to no line", () => {
    const usable = sanitizePlannedFrames([frame("Ada arrives.")]);
    expect(usable[0]?.dialogue).toBeUndefined();
    expect(usable[0]?.camera).toBeUndefined();
  });

  it("keeps at most 8 frames", () => {
    const usable = sanitizePlannedFrames(
      Array.from({ length: 10 }, (_, i) => frame(`Frame ${i + 1}`)),
    );
    expect(usable).toHaveLength(8);
  });

  it("drops a characterId the world does not know", () => {
    const world = makeWorld();
    const kept = toPlannedFrames(
      sanitizePlannedFrames([
        frame("Ada and a stranger.", { characterIds: ["ada", "nobody"] }),
      ]),
      world,
      "series",
    );
    expect(kept[0]?.characterIds).toEqual(["ada"]);
  });

  it("drops a frame that repeats another channel's secret", () => {
    const world = makeWorld();
    const kept = toPlannedFrames(
      sanitizePlannedFrames([
        frame("A quiet morning."),
        frame(`Ada learns that ${GAME_SECRET}.`),
      ]),
      world,
      "series",
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]?.action).toBe("A quiet morning.");
  });

  it("keeps the frames when fewer than 4 come back", async () => {
    mockModel(
      JSON.stringify({
        title: "Arrival",
        frames: [frame("One"), frame("Two"), frame("Three")],
      }),
    );
    const res = await planPOST(
      post("/api/storyboard/plan", {
        world: makeWorld(),
        channelId: "series",
        partId: "part-1",
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      storyboard: World["storyboards"][number];
    };
    expect(json.storyboard.frames).toHaveLength(3);
    expect(json.storyboard.channelId).toBe("series");
    expect(json.storyboard.partId).toBe("part-1");
  });
});

describe("storyboard storage", () => {
  function boardWithSketch(): World {
    const world = makeWorld();
    const board = planToStoryboard({
      channelId: "series",
      partId: "part-1",
      title: "Arrival",
      frames: toPlannedFrames(
        sanitizePlannedFrames([
          { ...frame("One"), dialogue: "Hello." },
          frame("Two"),
        ]),
        world,
        "series",
      ),
    });
    return upsertStoryboard(world, {
      ...board,
      frames: board.frames.map((entry, i) =>
        i === 0
          ? { ...entry, imagePath: "data:image/webp;base64,QUJD" }
          : entry,
      ),
    });
  }

  it("adds up one storyboard per channel and part", () => {
    const world = makeWorld();
    const board = planToStoryboard({
      channelId: "series",
      partId: "part-1",
      title: "Arrival",
      frames: toPlannedFrames(
        sanitizePlannedFrames([frame("One")]),
        world,
        "series",
      ),
    });
    expect(board.id).toBe("series::part-1");
    const next = upsertStoryboard(world, board);
    expect(storyboardForScene(next, "series", "part-1")?.title).toBe(
      "Arrival",
    );
    const again = upsertStoryboard(next, { ...board, title: "Retitled" });
    expect(again.storyboards).toHaveLength(1);
    expect(storyboardForScene(again, "series", "part-1")?.title).toBe(
      "Retitled",
    );
  });

  it("extracts sketch data URLs into named refs and restores them", () => {
    const { world: refs, entries } = extractImageEntries(boardWithSketch());
    expect(entries.length).toBe(1);
    expect(JSON.stringify(refs)).not.toContain("data:image");
    const images: Record<string, string> = {};
    for (const entry of entries) images[entry.name] = entry.dataUrl;
    const restored = restoreImageRefs(refs, images);
    expect(restored.storyboards[0].frames[0].imagePath).toBe(
      "data:image/webp;base64,QUJD",
    );
  });

  it("drops stored sketch refs so nothing renders broken", () => {
    const { world: refs } = extractImageEntries(boardWithSketch());
    expect(dropStoredRefs(refs).storyboards[0].frames[0].imagePath).toBe("");
  });

  it("strips sketch data URLs before a plan request", () => {
    const stripped = stripImageData(boardWithSketch());
    expect(stripped.storyboards[0].frames[0].imagePath).toBe("");
    expect(JSON.stringify(stripped)).not.toContain("data:image");
  });

  it("keeps stored storyboards when new material arrives", () => {
    const oldWorld = boardWithSketch();
    const nextWorld = { ...makeWorld(), storyboards: [] };
    const merged = mergeWorldAssets(oldWorld, nextWorld);
    expect(merged.storyboards).toHaveLength(1);
    expect(merged.storyboards[0].title).toBe("Arrival");
  });

  it("lets the next storyboard win on a conflict", () => {
    const oldWorld = boardWithSketch();
    const nextWorld = upsertStoryboard(makeWorld(), {
      ...oldWorld.storyboards[0]!,
      title: "Newer",
    });
    const merged = mergeWorldAssets(oldWorld, nextWorld);
    const kept = merged.storyboards.filter(
      (b) => b.channelId === "series" && b.partId === "part-1",
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]!.title).toBe("Newer");
  });
});

describe("storyboard frame ordering", () => {
  const frames = ["a", "b", "c", "d"].map((action, index) => ({
    ...frame(action),
    id: `frame-${index + 1}`,
  }));

  it("moves a frame to its new index", () => {
    expect(moveFrame(frames, 0, 2).map((f) => f.id)).toEqual([
      "frame-2",
      "frame-3",
      "frame-1",
      "frame-4",
    ]);
    expect(moveFrame(frames, 3, 0).map((f) => f.id)).toEqual([
      "frame-4",
      "frame-1",
      "frame-2",
      "frame-3",
    ]);
  });

  it("leaves the order alone for a no-op or bad index", () => {
    expect(moveFrame(frames, 1, 1)).toEqual(frames);
    expect(moveFrame(frames, -1, 2)).toEqual(frames);
    expect(moveFrame(frames, 0, 99).map((f) => f.id)[3]).toBe("frame-1");
  });

  it("truncates to the limit at a word boundary", () => {
    const text = `Ada walks beside the cold water while the ${"light ".repeat(30)}`.trim();
    const cut = truncateToLimit(text, 160);
    expect(cut.length).toBeLessThanOrEqual(160);
    expect(text.startsWith(cut)).toBe(true);
    expect(truncateToLimit("Ada arrives.", 160)).toBe("Ada arrives.");
  });
});

describe("storyboard sketch prompt", () => {
  const PART = { id: "p1", title: "The Stream", summary: "Still water." };

  it("uses a sketch suffix that names the framing, with no colour and no text", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(imagePayload("QUJD", "resp-sk-1")), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await scenePOST(
      post("http://localhost/api/art/scene", {
        part: PART,
        characters: [{ id: "a", name: "Ada" }],
        references: ["r1", "r2"],
        style: "sketch",
        framing: "wide",
        description: "Ada at the bank.",
      }),
    );
    expect(res.status).toBe(200);
    const calls = (
      fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    )
      .map(
        ([, init]) =>
          JSON.parse(init.body as string) as Record<string, unknown>,
      )
      .filter((body) => body.model === "muse-image-1.0");
    const [call] = calls;
    const input = call?.input as Array<{
      content: Array<{ text?: string }>;
    }>;
    const tools = call?.tools as unknown;
    const text = (input[0]?.content[0]?.text ?? "") as string;
    expect(text).toContain(SKETCH_SUFFIX);
    expect(text).not.toContain(SCENE_SUFFIX);
    expect(text).toContain("wide");
    expect(text).toContain("no colour");
    expect(text).toContain("any text");
    expect(text).toContain("Reference 1 shows Ada.");
    expect(input[0]?.content).toHaveLength(3);
    expect(tools).toEqual([{ type: "image_generation", size: "1536x1024" }]);
  });

  it("rejects an unknown style", async () => {
    const res = await scenePOST(
      post("http://localhost/api/art/scene", {
        part: PART,
        characters: [],
        references: [],
        style: "oil",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("agent package storyboards", () => {
  const SKETCH = "data:image/webp;base64,QUJD";

  function worldWithBoard(): World {
    const world = makeWorld();
    const board = planToStoryboard({
      channelId: "series",
      partId: "part-1",
      title: "Arrival",
      frames: toPlannedFrames(
        sanitizePlannedFrames([
          { ...frame("Ada at the bank.", { dialogue: "Look." }) },
          frame("The water rises."),
        ]),
        world,
        "series",
      ),
    });
    return upsertStoryboard(world, {
      ...board,
      frames: board.frames.map((entry, i) =>
        i === 0 ? { ...entry, imagePath: SKETCH } : entry,
      ),
    });
  }

  it("adds storyboard.json without image bytes and the sketches beside it", () => {
    const files = planAgentFiles(worldWithBoard(), "series");
    const json = files.find((f) => f.type === "storyboard");
    expect(json?.path).toBe(
      "test-story-series/scenes/part-1/storyboard.json",
    );
    expect(json?.missing).toBe(false);
    expect(json?.part).toBe("part-1");
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
    expect(JSON.stringify(json?.content)).not.toContain("imagePath");
    const sketch = files.find((f) => f.type === "storyboard-sketch");
    expect(sketch?.path).toBe(
      "test-story-series/scenes/part-1/storyboard/frame-1.webp",
    );
    expect(sketch?.missing).toBe(false);
    // The frame without art was never drawn: no file, no warning.
    const missing = files.find(
      (f) =>
        f.type === "storyboard-sketch" &&
        f.path.endsWith("storyboard/frame-2.webp"),
    );
    expect(missing).toBeUndefined();
    expect(files.some((f) => f.missing)).toBe(false);
  });

  it("respects the channel rule: no foreign storyboards", () => {
    const files = planAgentFiles(worldWithBoard(), "game");
    expect(
      files.some(
        (f) => f.type === "storyboard" || f.type === "storyboard-sketch",
      ),
    ).toBe(false);
    const contents = files
      .filter((f) => !f.missing && f.content !== undefined)
      .map((f) =>
        typeof f.content === "string"
          ? f.content
          : new TextDecoder().decode(f.content),
      )
      .join("\n");
    expect(contents).not.toContain("Ada at the bank.");
  });

  it("shows the storyboard files in the package tree", () => {
    const files = planAgentFiles(worldWithBoard(), "series");
    const tree = packageTree(files);
    expect(tree).toContain("scenes/part-1/storyboard.json");
    expect(tree).toContain("scenes/part-1/storyboard/frame-1.webp");
    expect(tree).not.toContain("frame-2.webp");
  });

  it("exposes the frames in order as text only", () => {
    const board = worldWithBoard().storyboards[0]!;
    const parsed = JSON.parse(storyboardJson(board)) as Array<{
      id: string;
    }>;
    expect(parsed.map((entry) => entry.id)).toEqual(
      board.frames.map((entry) => entry.id),
    );
  });
});
