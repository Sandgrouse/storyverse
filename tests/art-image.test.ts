import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContentPolicyBlockedError,
  IMAGE_MODEL,
  META_RESPONSES_URL,
  MetaApiError,
  generateImage,
} from "@/lib/meta/client";
import {
  ART_REQUEST_LIMIT_BYTES,
  BLOCKED_MESSAGE,
  REWRITE_INSTRUCTIONS,
  SCENE_SUFFIX,
  SHEET_SUFFIX,
  SHEET_VIEWS,
  fitsRequestLimit,
  pickSceneReferences,
  scenePrompt,
  sheetPrompt,
  sheetViewLine,
} from "@/lib/art";

function imagePayload(result: string, id = "resp-1"): unknown {
  return {
    id,
    output: [{ type: "image_generation_call", result }],
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

function blockedPayload(): unknown {
  return {
    error: { code: "content_policy_violation", message: "Blocked." },
  };
}

beforeEach(() => {
  vi.stubEnv("MODEL_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("generateImage", () => {
  it("sends a reference image and the default portrait size", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(imagePayload("QUJD")), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage({
      prompt: "Front view.",
      referenceImages: ["data:image/webp;base64,REF"],
    });

    expect(result).toEqual({ imageBase64: "QUJD", responseId: "resp-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(META_RESPONSES_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer test-key",
    });
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(IMAGE_MODEL);
    expect(body.input).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "Front view." },
          { type: "input_image", image_url: "data:image/webp;base64,REF" },
        ],
      },
    ]);
    expect(body.tools).toEqual([
      { type: "image_generation", size: "1024x1536" },
    ]);
    expect("previous_response_id" in body).toBe(false);
  });

  it("sends no reference without one and honors the landscape size", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(imagePayload("WFla", "resp-9")), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage({
      prompt: "A stream.",
      size: "1536x1024",
    });

    expect(result).toEqual({ imageBase64: "WFla", responseId: "resp-9" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(init.body as string);
    expect(body.input[0].content).toEqual([
      { type: "input_text", text: "A stream." },
    ]);
    expect(body.tools).toEqual([
      { type: "image_generation", size: "1536x1024" },
    ]);
  });

  it("chains views with previous_response_id", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(imagePayload("QQ==")), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await generateImage({ prompt: "Left view.", previousResponseId: "resp-1" });

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string).previous_response_id).toBe("resp-1");
  });

  it("throws a distinct error for a blocked prompt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(blockedPayload()), { status: 400 }),
      ),
    );
    const error = await generateImage({ prompt: "A fight." }).catch((e) => e);
    expect(error).toBeInstanceOf(ContentPolicyBlockedError);
    expect(error).not.toBeInstanceOf(MetaApiError);
    expect(error.code).toBe("content_policy_violation");
  });

  it("throws MetaApiError for other failures without the key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "bad_model" } }), {
            status: 400,
          }),
      ),
    );
    const error = await generateImage({ prompt: "Hi." }).catch((e) => e);
    expect(error).toBeInstanceOf(MetaApiError);
    expect(JSON.stringify(error.message)).not.toContain("test-key");
  });

  it("fails when the output holds no image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ id: "resp-2", output: [] }), {
            status: 200,
          }),
      ),
    );
    await expect(generateImage({ prompt: "Hi." })).rejects.toThrow(
      "no image_generation_call result",
    );
  });
});

describe("sheet prompts", () => {
  it("covers the six views in order", () => {
    expect(SHEET_VIEWS.map((v) => v.id)).toEqual([
      "front",
      "left",
      "right",
      "back",
      "walking",
      "crouching",
    ]);
  });

  it("uses the exact view lines", () => {
    expect(sheetViewLine("front")).toBe(
      "Front view, standing, facing the viewer.",
    );
    expect(sheetViewLine("left")).toBe("Left side profile view, standing.");
    expect(sheetViewLine("right")).toBe("Right side profile view, standing.");
    expect(sheetViewLine("back")).toBe("Back view, standing, facing away.");
    expect(sheetViewLine("walking")).toBe(
      "In motion, walking quickly with purpose.",
    );
    expect(sheetViewLine("crouching")).toBe(
      "Crouching, examining something on the ground.",
    );
  });

  it("ends every view with the exact suffix", () => {
    expect(SHEET_SUFFIX).toBe(
      "Keep the exact same character from the reference: same face, build, skin, hair, clothing, beads and carried items, in the same art style. Full body, centered, on a plain dark background. Do not draw any text, letters, labels, captions, numbers, logos or watermarks anywhere in the image.",
    );
    for (const view of SHEET_VIEWS) {
      const prompt = sheetPrompt(view.id, {
        name: "Ada",
        canon: "Brave and tall.",
      });
      expect(prompt).toContain("Ada");
      expect(prompt).toContain("Brave and tall.");
      expect(prompt).toContain(view.line);
      expect(prompt.endsWith(SHEET_SUFFIX)).toBe(true);
    }
  });

  it("lets a rewritten description replace the character text", () => {
    const prompt = sheetPrompt(
      "front",
      { name: "Ada", canon: "Brave." },
      "A calm portrait.",
    );
    expect(prompt).not.toContain("Brave.");
    expect(prompt.startsWith("A calm portrait.")).toBe(true);
    expect(prompt.endsWith(SHEET_SUFFIX)).toBe(true);
  });
});

describe("scene prompts", () => {
  it("names which reference shows whom and ends with the suffix", () => {
    expect(SCENE_SUFFIX).toBe(
      "Keep each character exactly as in their reference. Do not draw any text, letters, logos or watermarks.",
    );
    const prompt = scenePrompt({
      part: { title: "The Stream", summary: "Still water at noon." },
      characters: [
        { id: "a", name: "Ada" },
        { id: "b", name: "Bel" },
      ],
      referenceCount: 2,
    });
    expect(prompt).toContain("The Stream");
    expect(prompt).toContain("Still water at noon.");
    expect(prompt).toContain("Reference 1 shows Ada.");
    expect(prompt).toContain("Reference 2 shows Bel.");
    expect(prompt.endsWith(SCENE_SUFFIX)).toBe(true);
  });

  it("appends a ripple proposal as a new story detail", () => {
    const prompt = scenePrompt({
      part: { title: "T", summary: "S." },
      characters: [],
      referenceCount: 0,
      change: "Leave the pouch on the bank.",
    });
    expect(prompt).toContain("New story detail: Leave the pouch on the bank.");
    expect(prompt.endsWith(SCENE_SUFFIX)).toBe(true);
  });

  it("caps references at three", () => {
    expect(
      pickSceneReferences(["a", "b", "c", "d", "e"]),
    ).toEqual(["a", "b", "c"]);
    expect(pickSceneReferences(["a"])).toEqual(["a"]);
  });

  it("uses the exact rewrite instructions", () => {
    expect(REWRITE_INSTRUCTIONS).toBe(
      "Rewrite this image description so it passes a content filter. Keep the same people, place and moment. Describe it through composition, distance, light and aftermath, with no violence, gore or distress shown directly.",
    );
  });

  it("flags bodies over the 4.5MB request limit", () => {
    expect(BLOCKED_MESSAGE).toBe(
      "Muse Image won't draw this. Try describing it differently.",
    );
    expect(fitsRequestLimit("x".repeat(100))).toBe(true);
    expect(fitsRequestLimit("x".repeat(ART_REQUEST_LIMIT_BYTES + 1))).toBe(
      false,
    );
  });
});
