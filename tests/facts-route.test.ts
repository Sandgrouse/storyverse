import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/facts/route";
import { READ_INSTRUCTIONS, ReadFactSchema } from "@/lib/read";
import { WorldSchema } from "@/lib/world/schemas";
import { z } from "zod";
import seed from "@/data/seed/anukili.json";

function post(body: unknown): Request {
  return new Request("http://localhost/api/facts", {
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

function seedWorld() {
  return WorldSchema.parse(seed);
}

beforeEach(() => {
  vi.stubEnv("MODEL_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/facts", () => {
  it("returns facts in the read step's shape with their sources", async () => {
    const facts = [
      { id: "fact-genre", label: "Genre", value: "Mythic tragedy", source: "muse" },
      { id: "fact-where", label: "Where", value: "Aguleri", source: "material" },
    ];
    const fetchMock = mockModel(JSON.stringify({ facts }));
    const res = await POST(post({ world: seedWorld() }));
    expect(res.status).toBe(200);
    const json = z.object({ facts: z.array(ReadFactSchema) }).parse(await res.json());
    expect(json.facts).toEqual(facts);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.instructions).toBe(READ_INSTRUCTIONS);
    expect(body.text.format.name).toBe("facts");
  });

  it("strips image data before sending the world", async () => {
    const world = seedWorld();
    world.parts[0].imagePath = "data:image/webp;base64,UklGRg==";
    world.characters[0].artPath = "data:image/webp;base64,UklGRg==";
    const fetchMock = mockModel(JSON.stringify({ facts: [] }));
    const res = await POST(post({ world }));
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.stringify(bodyOf(init));
    expect(sent).not.toContain("data:image");
  });

  it("rejects a body without a world", async () => {
    const res = await POST(post({ world: null }));
    expect(res.status).toBe(400);
  });

  it("reports failure instead of failing silently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { code: "bad" } }), { status: 500 })),
    );
    const res = await POST(post({ world: seedWorld() }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.code).toBeDefined();
  });

  it("needs an API key", async () => {
    vi.stubEnv("MODEL_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(post({ world: seedWorld() }));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function bodyOf(init: RequestInit): unknown {
  return JSON.parse(init.body as string);
}
