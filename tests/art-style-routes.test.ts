import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as scenePOST } from "@/app/api/art/scene/route";
import { POST as sheetPOST } from "@/app/api/art/sheet-view/route";
import { SKETCH_SUFFIX } from "@/lib/art";

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockImages() {
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          id: "resp-1",
          output: [{ type: "image_generation_call", result: "QUJD" }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function imagePrompts(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map(([, init]) => JSON.parse((init as RequestInit).body as string))
    .filter((body) => body.model === "muse-image-1.0")
    .map(
      (body) =>
        (body.input[0]?.content[0]?.text ?? "") as string,
    );
}

const STYLE_LINE = "Visual style: Painterly 2D. Dark, mythic.";
const STYLE_PHRASE = "painterly 2D animation style with visible brushwork";

beforeEach(() => {
  vi.stubEnv("MODEL_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("art routes with a visual style", () => {
  it("sends the style phrase and notes on sheet prompts", async () => {
    const fetchMock = mockImages();
    const res = await sheetPOST(
      post("http://localhost/api/art/sheet-view", {
        view: "front",
        character: { id: "c1", name: "Ada", canon: "Brave." },
        stylePreset: "Painterly 2D",
        styleNotes: "Dark, mythic.",
      }),
    );
    expect(res.status).toBe(200);
    const [prompt] = imagePrompts(fetchMock);
    expect(prompt).toContain(STYLE_PHRASE);
    expect(prompt).toContain("Dark, mythic.");
  });

  it("sends the style on scene and video-shot prompts", async () => {
    const fetchMock = mockImages();
    const res = await scenePOST(
      post("http://localhost/api/art/scene", {
        part: { id: "p1", title: "The Stream", summary: "Still water." },
        characters: [{ id: "a", name: "Ada" }],
        references: [],
        description: "Ada at the bank.",
        stylePreset: "Painterly 2D",
        styleNotes: "Dark, mythic.",
      }),
    );
    expect(res.status).toBe(200);
    const [prompt] = imagePrompts(fetchMock);
    expect(prompt).toContain(STYLE_PHRASE);
    expect(prompt).toContain("Dark, mythic.");
    expect(prompt).not.toContain(STYLE_LINE);
  });

  it("keeps storyboard sketches pencil even with a style set", async () => {
    const fetchMock = mockImages();
    const res = await scenePOST(
      post("http://localhost/api/art/scene", {
        part: { id: "p1", title: "The Stream", summary: "Still water." },
        characters: [{ id: "a", name: "Ada" }],
        references: [],
        style: "sketch",
        framing: "wide",
        description: "Ada at the bank.",
        stylePreset: "Painterly 2D",
        styleNotes: "Dark, mythic.",
      }),
    );
    expect(res.status).toBe(200);
    const [prompt] = imagePrompts(fetchMock);
    expect(prompt).toContain(SKETCH_SUFFIX);
    expect(prompt).not.toContain("painterly 2D");
    expect(prompt).not.toContain("Visual style");
  });
});
