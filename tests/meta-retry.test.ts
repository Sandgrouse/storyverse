import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  RETRY_DELAY_MS,
  completeJson,
  generateImage,
} from "@/lib/meta/client";

function okImage(result = "QUJD"): Response {
  return new Response(
    JSON.stringify({
      id: "resp-img-1",
      output: [{ type: "image_generation_call", result }],
    }),
    { status: 200 },
  );
}

function statusResponse(status: number, code = "temporarily_unavailable") {
  return new Response(JSON.stringify({ error: { code } }), { status });
}

function okText(text: string): Response {
  return new Response(
    JSON.stringify({
      output: [{ content: [{ type: "output_text", text }] }],
    }),
    { status: 200 },
  );
}

/** The 2s wait resolves at once, while still asserting on its length. */
function instantSleep() {
  const spy = vi.spyOn(globalThis, "setTimeout");
  spy.mockImplementation(((callback: () => void) => {
    callback();
    return 0;
  }) as typeof setTimeout);
  return spy;
}

beforeEach(() => {
  vi.stubEnv("MODEL_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("meta client retry", () => {
  it("retries an image call once after 2s on a 503, then succeeds", async () => {
    const sleep = instantSleep();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(statusResponse(503))
      .mockResolvedValueOnce(okImage("RETRY"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage({ prompt: "A calm river." });

    expect(result).toEqual({ imageBase64: "RETRY", responseId: "resp-img-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(
      expect.any(Function),
      RETRY_DELAY_MS,
    );
    expect(RETRY_DELAY_MS).toBe(2000);
  });

  it("retries a text call once on a 502", async () => {
    instantSleep();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(statusResponse(502, "bad_gateway"))
      .mockResolvedValueOnce(okText(JSON.stringify({ detail: "new" })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await completeJson(
      {
        instructions: "Write.",
        input: "A scene.",
        schemaName: "pack",
        jsonSchema: { type: "object" },
      },
      z.object({ detail: z.string() }),
    );

    expect(result).toEqual({ detail: "new" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once when the network fails, then succeeds", async () => {
    instantSleep();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(okImage("AGAIN"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage({ prompt: "A calm river." });

    expect(result.imageBase64).toBe("AGAIN");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries a 4xx", async () => {
    const sleep = instantSleep();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "content_policy_violation", message: "Blocked." },
        }),
        { status: 400 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImage({ prompt: "A calm river." })).rejects.toThrow(
      "Image prompt blocked",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("never retries a 500", async () => {
    const sleep = instantSleep();
    const fetchMock = vi.fn().mockResolvedValueOnce(statusResponse(500, "boom"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImage({ prompt: "A calm river." })).rejects.toThrow(
      "Meta API error 500",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("skips the retry when more than 35 seconds have passed", async () => {
    const sleep = instantSleep();
    const fetchMock = vi.fn().mockResolvedValueOnce(statusResponse(503));
    vi.stubGlobal("fetch", fetchMock);
    const start = 1_000_000;
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(start)
      .mockReturnValue(start + 36_000);

    await expect(generateImage({ prompt: "A calm river." })).rejects.toThrow(
      "Meta API error 503",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
