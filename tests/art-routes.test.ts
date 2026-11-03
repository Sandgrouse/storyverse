import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as sheetPOST } from "@/app/api/art/sheet-view/route";
import { POST as scenePOST } from "@/app/api/art/scene/route";
import { ART_REQUEST_LIMIT_BYTES, BLOCKED_MESSAGE } from "@/lib/art";

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function imagePayload(result: string, id = "resp-img-1"): unknown {
  return {
    id,
    output: [{ type: "image_generation_call", result }],
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

function textPayload(text: string): unknown {
  return {
    output: [{ content: [{ type: "output_text", text }] }],
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

function blockedResponse(): Response {
  return new Response(
    JSON.stringify({
      error: { code: "content_policy_violation", message: "Blocked." },
    }),
    { status: 400 },
  );
}

/**
 * One fetch mock for every model call. Image calls pop their scripted
 * response in order; text calls always return the rewrite.
 */
function mockModels(imageResponses: Response[], rewrite: string) {
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string) as { model: string };
    if (body.model === "muse-image-1.0") {
      const next = imageResponses.shift();
      if (!next) throw new Error("no more scripted image responses");
      return next;
    }
    return new Response(
      JSON.stringify(textPayload(JSON.stringify({ description: rewrite }))),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function okImage(result = "QUJD", id?: string): Response {
  return new Response(JSON.stringify(imagePayload(result, id)), {
    status: 200,
  });
}

function imageCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .map(([, init]) => JSON.parse((init as RequestInit).body as string))
    .filter((body) => body.model === "muse-image-1.0");
}

beforeEach(() => {
  vi.stubEnv("MODEL_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const CHARACTER = { id: "c1", name: "Ada", canon: "Brave and tall." };

describe("POST /api/art/sheet-view", () => {
  it("sends the reference and chains the previous response", async () => {
    const fetchMock = mockModels([okImage("QUJD", "resp-2")], "unused");
    const res = await sheetPOST(
      post("http://localhost/api/art/sheet-view", {
        view: "left",
        character: CHARACTER,
        referenceImage: "data:image/webp;base64,REF",
        previousResponseId: "resp-1",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      imageBase64: "QUJD",
      responseId: "resp-2",
    });
    const [call] = imageCalls(fetchMock);
    expect(call.input[0].content).toEqual([
      { type: "input_text", text: expect.stringContaining("Left side profile") },
      { type: "input_image", image_url: "data:image/webp;base64,REF" },
    ]);
    expect(call.tools).toEqual([
      { type: "image_generation", size: "1024x1536" },
    ]);
    expect(call.previous_response_id).toBe("resp-1");
  });

  it("sends no reference without one and rejects unknown views", async () => {
    const fetchMock = mockModels([okImage()], "unused");
    const res = await sheetPOST(
      post("http://localhost/api/art/sheet-view", {
        view: "front",
        character: CHARACTER,
      }),
    );
    expect(res.status).toBe(200);
    const [call] = imageCalls(fetchMock);
    expect(call.input[0].content).toHaveLength(1);

    const bad = await sheetPOST(
      post("http://localhost/api/art/sheet-view", {
        view: "upside-down",
        character: CHARACTER,
      }),
    );
    expect(bad.status).toBe(400);
  });

  it("rewrites a blocked prompt and tries once more", async () => {
    const fetchMock = mockModels(
      [blockedResponse(), okImage("RETRY", "resp-3")],
      "A calm portrait from far away.",
    );
    const res = await sheetPOST(
      post("http://localhost/api/art/sheet-view", {
        view: "front",
        character: CHARACTER,
        referenceImage: "data:image/webp;base64,REF",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      imageBase64: "RETRY",
      responseId: "resp-3",
    });
    const calls = imageCalls(fetchMock);
    expect(calls).toHaveLength(2);
    expect(calls[1].input[0].content[0].text).toContain(
      "A calm portrait from far away.",
    );
    // The rewrite went to Muse Spark, not Muse Image.
    const spark = fetchMock.mock.calls
      .map(([, init]) => JSON.parse((init as RequestInit).body as string))
      .find((body) => body.model === "muse-spark-1.3");
    expect(spark.instructions).toContain("content filter");
    expect(spark.input).toContain("Front view");
  });

  it("reports a block that persists with the rewritten description", async () => {
    mockModels([blockedResponse(), blockedResponse()], "Gentle aftermath.");
    const res = await sheetPOST(
      post("http://localhost/api/art/sheet-view", {
        view: "front",
        character: CHARACTER,
      }),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("content_policy_blocked");
    expect(json.error.message).toBe(BLOCKED_MESSAGE);
    expect(json.error.details.description).toBe("Gentle aftermath.");
  });

  it("rejects bodies over the request limit", async () => {
    const fetchMock = mockModels([okImage()], "unused");
    const res = await sheetPOST(
      post(
        "http://localhost/api/art/sheet-view",
        JSON.stringify({
          view: "front",
          character: CHARACTER,
          referenceImage: `data:image/webp;base64,${"x".repeat(ART_REQUEST_LIMIT_BYTES)}`,
        }),
      ),
    );
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 with a plain message and no fetch without a key", async () => {
    vi.stubEnv("MODEL_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await sheetPOST(
      post("http://localhost/api/art/sheet-view", {
        view: "front",
        character: CHARACTER,
      }),
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(typeof json.error.message).toBe("string");
    expect(json.error.message.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/art/scene", () => {
  const PART = { id: "p1", title: "The Stream", summary: "Still water." };

  it("uses the landscape size and at most three references", async () => {
    const fetchMock = mockModels([okImage()], "unused");
    const res = await scenePOST(
      post("http://localhost/api/art/scene", {
        part: PART,
        characters: [
          { id: "a", name: "Ada" },
          { id: "b", name: "Bel" },
          { id: "c", name: "Cid" },
          { id: "d", name: "Dan" },
        ],
        references: ["r1", "r2", "r3", "r4", "r5"],
        change: "Leave the pouch on the bank.",
      }),
    );
    expect(res.status).toBe(200);
    const [call] = imageCalls(fetchMock);
    expect(call.tools).toEqual([
      { type: "image_generation", size: "1536x1024" },
    ]);
    expect(call.input[0].content).toHaveLength(4);
    const text = call.input[0].content[0].text as string;
    expect(text).toContain("Reference 1 shows Ada.");
    expect(text).toContain("Reference 3 shows Cid.");
    expect(text).not.toContain("Dan");
    expect(text).toContain("New story detail: Leave the pouch on the bank.");
    expect(text.endsWith("Do not draw any text, letters, logos or watermarks."));
  });

  it("rewrites a blocked scene and reports a block that persists", async () => {
    const fetchMock = mockModels(
      [blockedResponse(), okImage("SCENE")],
      "Quiet water after.",
    );
    const res = await scenePOST(
      post("http://localhost/api/art/scene", {
        part: PART,
        characters: [],
        references: [],
      }),
    );
    expect(res.status).toBe(200);
    expect(imageCalls(fetchMock)).toHaveLength(2);

    mockModels([blockedResponse(), blockedResponse()], "Quiet water after.");
    const stuck = await scenePOST(
      post("http://localhost/api/art/scene", {
        part: PART,
        characters: [],
        references: [],
      }),
    );
    expect(stuck.status).toBe(422);
    const json = await stuck.json();
    expect(json.error.message).toBe(BLOCKED_MESSAGE);
    expect(json.error.details.description).toBe("Quiet water after.");
  });

  it("rejects oversized bodies and images without a key it 503s", async () => {
    const fetchMock = mockModels([okImage()], "unused");
    const big = await scenePOST(
      post(
        "http://localhost/api/art/scene",
        JSON.stringify({
          part: PART,
          characters: [],
          references: [`data:image/webp;base64,${"y".repeat(ART_REQUEST_LIMIT_BYTES)}`],
        }),
      ),
    );
    expect(big.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("MODEL_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    const noKey = await scenePOST(
      post("http://localhost/api/art/scene", {
        part: PART,
        characters: [],
        references: [],
      }),
    );
    expect(noKey.status).toBe(503);
  });
});
