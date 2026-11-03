import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as ripplePOST } from "@/app/api/ripple/route";
import { POST as applyPOST } from "@/app/api/ripple/apply/route";
import { POST as checkPOST } from "@/app/api/ripple/check/route";
import {
  RIPPLE_INSTRUCTIONS,
  buildRippleModelFixSchema,
  toRippleFixes,
} from "@/lib/ripple";
import {
  RippleResultSchema,
  WorldSchema,
  type World,
} from "@/lib/world/schemas";

async function loadWorld(): Promise<World> {
  const raw = await readFile(
    join(process.cwd(), "data", "seed", "anukili.json"),
    "utf-8",
  );
  return WorldSchema.parse(JSON.parse(raw));
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/ripple", {
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
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(modelPayload(text)), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const CHANGE = "Enyinyi told them how to kill him.";

const validModelFix = {
  beatId: "beat-series-5",
  kind: "meaning",
  title: "The cure now means something else",
  problem: "The cure scene still plays, but reads differently now.",
  proposal: "Keep the line. Hold on Enyinyi's face a beat too long.",
  quote:
    "Owl's droppings blind Anukili, and Enyinyi's herbs restore his sight.",
  regeneratesImage: false,
};

beforeEach(() => {
  vi.stubEnv("MODEL_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/ripple", () => {
  it("calls the Responses API with structured output and a bearer key", async () => {
    const world = await loadWorld();
    const fetchMock = mockModel(JSON.stringify({ summary: "ok", fixes: [] }));

    const res = await ripplePOST(post({ change: CHANGE, world }));
    expect(res.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.meta.ai/v1/responses");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer test-key",
    });

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("muse-spark-1.3");
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.instructions).toBe(RIPPLE_INSTRUCTIONS);
    expect(typeof body.input).toBe("string");
    expect(body.input).toContain(CHANGE);
    expect(body.text.format.type).toBe("json_schema");
    expect(typeof body.text.format.name).toBe("string");
    expect(body.text.format.strict).toBe(true);
    expect(typeof body.text.format.schema).toBe("object");

    const ripple = RippleResultSchema.parse(await res.json());
    expect(ripple.change).toBe(CHANGE);
    expect(ripple.fixes).toEqual([]);
  });

  it("constrains beatId to an enum of the world's beat ids", async () => {
    const world = await loadWorld();
    const schema = buildRippleModelFixSchema(world);
    expect(schema.shape.beatId.options).toEqual(
      world.beats.map((b) => b.id),
    );
    expect(schema.safeParse(validModelFix).success).toBe(true);
    expect(
      schema.safeParse({ ...validModelFix, beatId: "beat-made-up" }).success,
    ).toBe(false);
  });

  it("drops fixes whose beatId does not resolve", async () => {
    const world = await loadWorld();
    const fixes = toRippleFixes(
      [validModelFix, { ...validModelFix, beatId: "beat-made-up" }],
      world,
    );
    expect(fixes).toHaveLength(1);
    expect(fixes[0].beatId).toBe("beat-series-5");
    expect(fixes[0].channelId).toBe("series");
    expect(fixes[0].partId).toBe("part-5");
  });

  it("drops unknown beats at the route level", async () => {
    const world = await loadWorld();
    mockModel(
      JSON.stringify({
        summary: "two scenes",
        fixes: [validModelFix, { ...validModelFix, beatId: "beat-made-up" }],
      }),
    );
    const res = await ripplePOST(post({ change: CHANGE, world }));
    expect(res.status).toBe(200);
    const ripple = RippleResultSchema.parse(await res.json());
    expect(ripple.fixes).toHaveLength(1);
    expect(ripple.fixes[0].beatId).toBe("beat-series-5");
  });

  it("keeps the API status and error code without leaking the key", async () => {
    const world = await loadWorld();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { code: "invalid_model" } }), { status: 400 })),
    );
    const res = await ripplePOST(post({ change: CHANGE, world }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid_model");
    expect(JSON.stringify(json)).not.toContain("test-key");
  });

  it("returns the seed ripple with sample:true when no key is set", async () => {
    const world = await loadWorld();
    vi.stubEnv("MODEL_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await ripplePOST(post({ change: CHANGE, world }));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const ripple = RippleResultSchema.parse(await res.json());
    expect(ripple.sample).toBe(true);
    expect(ripple.fixes.length).toBeGreaterThan(0);
    const beatIds = new Set(world.beats.map((b) => b.id));
    for (const fix of ripple.fixes) {
      expect(beatIds.has(fix.beatId)).toBe(true);
    }
  });

  it("returns no fixes for a harmless change", async () => {
    const world = await loadWorld();
    mockModel(
      JSON.stringify({
        summary: "Nothing breaks. This fits your story.",
        fixes: [],
      }),
    );
    const res = await ripplePOST(
      post({ change: "A mango falls at noon.", world }),
    );
    expect(res.status).toBe(200);
    const ripple = RippleResultSchema.parse(await res.json());
    expect(ripple.fixes).toEqual([]);
    expect(ripple.summary).toContain("Nothing breaks");
  });

  it("rejects a missing change and world", async () => {
    const res = await ripplePOST(post({}));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/ripple/apply", () => {
  it("returns the original content with the proposal noted in sample mode", async () => {
    const world = await loadWorld();
    vi.stubEnv("MODEL_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    const fix = RippleResultSchema.parse(
      JSON.parse(
        await readFile(
          join(process.cwd(), "data", "seed", "anukili-ripple.json"),
          "utf-8",
        ),
      ),
    ).fixes[0];
    const res = await applyPOST(post({ change: CHANGE, fix, world }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sample).toBe(true);
    const beat = world.beats.find((b) => b.id === fix.beatId);
    expect(json.content).toContain(beat?.content);
    expect(json.content).toContain(fix.proposal);
  });

  it("returns rewritten content from the model", async () => {
    const world = await loadWorld();
    mockModel(JSON.stringify({ content: "Rewritten scene." }));
    const fix = RippleResultSchema.parse(
      JSON.parse(
        await readFile(
          join(process.cwd(), "data", "seed", "anukili-ripple.json"),
          "utf-8",
        ),
      ),
    ).fixes[0];
    const res = await applyPOST(post({ change: CHANGE, fix, world }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ content: "Rewritten scene." });
  });
});

describe("POST /api/ripple/check", () => {
  it("returns a consistent sample check without a key", async () => {
    const world = await loadWorld();
    vi.stubEnv("MODEL_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    const res = await checkPOST(post({ change: CHANGE, world }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.consistent).toBe(true);
    expect(json.sample).toBe(true);
    expect(typeof json.note).toBe("string");
  });

  it("returns the model's verdict", async () => {
    const world = await loadWorld();
    mockModel(JSON.stringify({ consistent: false, note: "The game still hides it." }));
    const res = await checkPOST(post({ change: CHANGE, world }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      consistent: false,
      note: "The game still hides it.",
    });
  });
});
