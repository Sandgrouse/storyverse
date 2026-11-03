import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as cutoutPOST } from "@/app/api/art/cutout/route";
import {
  CUTOUT_MODEL,
  CutoutResponseSchema,
  cutoutRequestBody,
  normalizedCutoutEvents,
  selectLargestMask,
  type CutoutResponse,
} from "@/lib/cutout";
import type { SegmentationMaskRecord } from "@meta-sam/parser";

const SMALL_MASK = "2,2,!!!!!&T:u9`";
// Wire order is height,width: a 3-wide, 2-tall raster.
const BIG_MASK = "2,3,!!!!!&w{Dcs";

const SAM_TEXT =
  "<0f>0<|box;x1=0;y1=0;x2=1;y2=1;w=8;h=8|><|mask;x=0;y=0;data=" +
  SMALL_MASK +
  "|>" +
  ",1<|box;x1=0;y1=0;x2=5;y2=3;w=8;h=8|><|mask;x=0;y=0;data=" +
  BIG_MASK +
  "|>\n";

function sseFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** A Responses SSE stream, split mid-payload across two chunks. */
function streamResponse(frames: string[]): Response {
  const text = frames.join("");
  const cut = Math.floor(text.length / 2);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder().encode(text);
      controller.enqueue(bytes.slice(0, cut));
      controller.enqueue(bytes.slice(cut));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function samStream(text = SAM_TEXT): Response {
  const frames = [
    sseFrame({
      type: "response.output_text.delta",
      item_id: "msg-1",
      output_index: 0,
      content_index: 0,
      delta: text.slice(0, 20),
    }),
    sseFrame({
      type: "response.output_text.delta",
      item_id: "msg-1",
      output_index: 0,
      content_index: 0,
      delta: text.slice(20),
    }),
    // The API streams content_part.done but not output_text.done.
    sseFrame({
      type: "response.content_part.done",
      item_id: "msg-1",
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text },
    }),
    sseFrame({ type: "response.completed" }),
  ];
  return streamResponse(frames);
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/art/cutout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const BODY = {
  imageDataUrl: "data:image/webp;base64,QUJD",
  concept: "person",
};

beforeEach(() => {
  vi.stubEnv("MODEL_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("cutout request", () => {
  it("builds a streaming SAM request with text and image content", () => {
    const body = cutoutRequestBody("person", "data:image/webp;base64,QUJD");
    expect(body.model).toBe(CUTOUT_MODEL);
    expect(CUTOUT_MODEL).toBe("sam-3.1");
    expect(body.stream).toBe(true);
    expect(body.input).toEqual([
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "person" },
          { type: "input_image", image_url: "data:image/webp;base64,QUJD" },
        ],
      },
    ]);
  });
});

describe("normalizedCutoutEvents", () => {
  async function collect(source: unknown[]) {
    const out: unknown[] = [];
    for await (const event of normalizedCutoutEvents(source)) out.push(event);
    return out as Record<string, unknown>[];
  }

  it("passes deltas through and synthesizes output_text.done per lane", async () => {
    const delta = {
      type: "response.output_text.delta",
      item_id: "msg-1",
      output_index: 0,
      content_index: 0,
      delta: "half",
    };
    const partDone = {
      type: "response.content_part.done",
      item_id: "msg-1",
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: "full text" },
    };
    const events = await collect([
      delta,
      partDone,
      { type: "response.completed" },
    ]);

    expect(events[0]).toEqual(delta);
    expect(events[1]).toEqual(partDone);
    expect(events[2]).toEqual({
      type: "response.output_text.done",
      item_id: "msg-1",
      output_index: 0,
      content_index: 0,
      text: "full text",
    });
    expect(events).toHaveLength(4);
  });

  it("emits one done when both output_text.done and content_part.done arrive", async () => {
    const realDone = {
      type: "response.output_text.done",
      item_id: "msg-1",
      output_index: 0,
      content_index: 0,
      text: "full text",
    };
    const partDone = {
      type: "response.content_part.done",
      item_id: "msg-1",
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: "full text" },
    };
    const events = await collect([realDone, partDone]);

    expect(events[0]).toEqual(realDone);
    expect(events[1]).toEqual(partDone);
    expect(events).toHaveLength(2);
    expect(
      events.filter((e) => e.type === "response.output_text.done"),
    ).toHaveLength(1);
  });

  it("drops a real done that repeats a synthesized lane", async () => {
    const partDone = {
      type: "response.content_part.done",
      item_id: "msg-1",
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: "full text" },
    };
    const realDone = {
      type: "response.output_text.done",
      item_id: "msg-1",
      output_index: 0,
      content_index: 0,
      text: "full text",
    };
    const events = await collect([partDone, realDone]);

    expect(events[0]).toEqual(partDone);
    expect(events[1]).toEqual({
      type: "response.output_text.done",
      item_id: "msg-1",
      output_index: 0,
      content_index: 0,
      text: "full text",
    });
    expect(events).toHaveLength(2);
  });

  it("synthesizes a done when only content_part.done arrives", async () => {
    const partDone = {
      type: "response.content_part.done",
      item_id: "msg-1",
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: "only part" },
    };
    const events = await collect([partDone]);

    expect(events[0]).toEqual(partDone);
    expect(events[1]).toEqual({
      type: "response.output_text.done",
      item_id: "msg-1",
      output_index: 0,
      content_index: 0,
      text: "only part",
    });
    expect(events).toHaveLength(2);
  });

  it("leaves non-text content parts alone", async () => {
    const part = {
      type: "response.content_part.done",
      item_id: "msg-1",
      output_index: 0,
      content_index: 0,
      part: { type: "reasoning_text", text: "hmm" },
    };
    expect(await collect([part])).toEqual([part]);
  });
});

describe("selectLargestMask", () => {
  function maskRecord(id: string, left: number, top: number, right: number, bottom: number) {
    return {
      kind: "mask",
      order: 0,
      objectId: id,
      identity: `image:*:"${id}`,
      revision: 1,
      mask: { encoding: "one_bit", payload: "!x", width: 1, height: 1 },
      bounds: { left, top, right, bottom },
    } as unknown as SegmentationMaskRecord;
  }

  it("picks the record covering the most source pixels", () => {
    const small = maskRecord("0", 0, 0, 2, 2);
    const big = maskRecord("1", 0, 0, 6, 4);
    expect(selectLargestMask([small, big])?.objectId).toBe("1");
    expect(selectLargestMask([big, small])?.objectId).toBe("1");
    expect(selectLargestMask([])).toBeNull();
  });
});

describe("POST /api/art/cutout", () => {
  it("returns the largest mask from a streaming response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(samStream());
    vi.stubGlobal("fetch", fetchMock);

    const res = await cutoutPOST(post(BODY));

    expect(res.status).toBe(200);
    const json = CutoutResponseSchema.parse(await res.json());
    expect(json.width).toBe(3);
    expect(json.height).toBe(2);
    expect(json.bounds).toEqual({ left: 0, top: 0, right: 6, bottom: 4 });
    const bytes = Uint8Array.from(atob(json.maskBase64), (c) => c.charCodeAt(0));
    expect(Array.from(bytes)).toEqual([1, 1, 1, 1, 1, 1]);

    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe("sam-3.1");
    expect(sent.stream).toBe(true);
    expect(sent.input[0].content[1]).toEqual({
      type: "input_image",
      image_url: BODY.imageDataUrl,
    });
  });

  it("keeps compositing inputs: bounds inside an 8x8 source", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(samStream());
    vi.stubGlobal("fetch", fetchMock);

    const res = await cutoutPOST(post(BODY));
    const json = (await res.json()) as CutoutResponse;
    // The client composites this onto the source image at its own size:
    // 3x2 raster tiles the 6x4 box exactly, no resampling needed.
    expect(json.bounds.right - json.bounds.left).toBe(json.width * 2);
    expect(json.bounds.bottom - json.bounds.top).toBe(json.height * 2);
  });

  it("returns 422 when the stream holds no mask", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(samStream("a quiet field\n"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await cutoutPOST(post(BODY));

    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("NO_CUTOUT");
  });

  it("rejects bad bodies, oversized bodies, and a missing key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect((await cutoutPOST(post({}))).status).toBe(400);
    expect(
      (await cutoutPOST(post({ imageDataUrl: "nope", concept: "person" })))
        .status,
    ).toBe(400);
    const huge = post(
      JSON.stringify({
        ...BODY,
        imageDataUrl: `data:image/webp;base64,${"x".repeat(4_500_000)}`,
      }),
    );
    expect((await cutoutPOST(huge)).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("MODEL_API_KEY", "");
    expect((await cutoutPOST(post(BODY))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
