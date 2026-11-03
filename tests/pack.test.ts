import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as packPOST } from "@/app/api/pack/route";
import {
  PACK_INSTRUCTIONS,
  PackModelOutputSchema,
  channelsForPart,
  packModelInput,
  packToMarkdown,
  scriptFormForKind,
  upsertPack,
} from "@/lib/pack";
import { WorldSchema, type World } from "@/lib/world/schemas";

function makeWorld(): World {
  return WorldSchema.parse({
    id: "test-story",
    title: "Test Story",
    premise: "A premise.",
    logline: "A logline.",
    characters: [
      { id: "ada", name: "Ada", canon: "Brave and tall.", sheet: [] },
    ],
    locations: [],
    channels: [
      {
        id: "series",
        name: "Series",
        kind: "series",
        title: "The Series",
      },
      { id: "game", name: "Game", kind: "game", title: "The Game" },
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
    secrets: [
      {
        id: "s1",
        text: "Ada hides a scar.",
        knownThrough: ["series"],
        note: "Shown, never said.",
      },
    ],
    gaps: [],
  });
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/pack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sparkResponse(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify(payload) }] }],
    }),
    { status: 200 },
  );
}

const MODEL_OUTPUT = {
  script: "INT. RIVER — DAWN. Ada arrives.",
  shots: ["Ada on the riverbank.", "The scar stays hidden.", "Dawn breaks."],
  posts: ["Something begins.", "Dawn is coming.", "Watch closely."],
  reveals: ["Ada hides a scar."],
  additions: ["A heron watches from the reeds."],
};

beforeEach(() => {
  vi.stubEnv("MODEL_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/pack", () => {
  it("sends the exact instructions and returns the pack", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(sparkResponse(MODEL_OUTPUT));
    vi.stubGlobal("fetch", fetchMock);

    const res = await packPOST(
      post({ world: makeWorld(), partId: "part-1", channelId: "series" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ...MODEL_OUTPUT,
      partId: "part-1",
      channelId: "series",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("muse-spark-1.3");
    expect(body.instructions).toBe(PACK_INSTRUCTIONS);
    expect(body.text.format.name).toBe("story_pack");
    expect(body.input).toContain("Beginnings");
    expect(body.input).toContain("Ada arrives legs first.");
  });

  it("rejects an unknown part, an unknown channel, and uncovered parts", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const world = makeWorld();

    expect(
      (await packPOST(post({ world, partId: "missing", channelId: "series" }))).status,
    ).toBe(400);
    expect(
      (await packPOST(post({ world, partId: "part-1", channelId: "missing" }))).status,
    ).toBe(400);
    // The game channel has no beat on part-1.
    expect(
      (await packPOST(post({ world, partId: "part-1", channelId: "game" }))).status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 with a plain message and no fetch without a key", async () => {
    vi.stubEnv("MODEL_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await packPOST(
      post({ world: makeWorld(), partId: "part-1", channelId: "series" }),
    );

    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("pack lib", () => {
  it("picks the script form by channel kind", () => {
    expect(scriptFormForKind("series")).toBe("a scene script");
    expect(scriptFormForKind("game")).toBe("a level brief");
    expect(scriptFormForKind("shorts")).toBe("a first-person monologue");
  });

  it("limits the picker to channels covering the part", () => {
    expect(channelsForPart(makeWorld(), "part-1").map((c) => c.id)).toEqual([
      "series",
    ]);
  });

  it("keeps image data out of the model input", () => {
    const world = makeWorld();
    world.parts[0].imagePath = "data:image/webp;base64,QUJD";
    const input = packModelInput(world, "part-1", "series");
    expect(input).not.toContain("data:image");
    expect(input).toContain("known through: Series");
  });

  it("upserts packs by part and channel", () => {
    const world = makeWorld();
    const pack = PackModelOutputSchema.parse(MODEL_OUTPUT);
    const next = upsertPack(world, { ...pack, partId: "part-1", channelId: "series" });
    expect(next.packs).toHaveLength(1);
    const again = upsertPack(next, {
      ...pack,
      script: "New script.",
      partId: "part-1",
      channelId: "series",
    });
    expect(again.packs).toHaveLength(1);
    expect(again.packs[0].script).toBe("New script.");
  });

  it("renders markdown with every section", () => {
    const md = packToMarkdown(makeWorld(), {
      ...PackModelOutputSchema.parse(MODEL_OUTPUT),
      partId: "part-1",
      channelId: "series",
    });
    for (const section of ["Script", "Shots", "Posts", "Reveals", "Additions"]) {
      expect(md).toContain(section);
    }
    expect(md).toContain("A heron watches from the reeds.");
  });
});
