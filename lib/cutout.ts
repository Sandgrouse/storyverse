import { z } from "zod";
import type { SegmentationMaskRecord } from "@meta-sam/parser";

/**
 * SAM 3.1 cutout contract. The route streams the Responses API and
 * returns the largest mask; the client composites it as alpha in a
 * canvas. Pure helpers here stay importable from client components.
 */

export const CUTOUT_MODEL = "sam-3.1";

/** A short noun phrase naming what to segment, such as "person". */
export const CutoutRequestSchema = z.object({
  imageDataUrl: z.string().min(1).startsWith("data:image/"),
  concept: z.string().min(1).max(120),
});

export type CutoutRequest = z.infer<typeof CutoutRequestSchema>;

export const CutoutBoundsSchema = z.object({
  left: z.number(),
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
});

export type CutoutBounds = z.infer<typeof CutoutBoundsSchema>;

/** The largest mask, ready for the client to composite as alpha. */
export const CutoutResponseSchema = z.object({
  /** Raster width and height in pixels. */
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Half-open source-pixel box the raster covers. */
  bounds: CutoutBoundsSchema,
  /** Base64 of the row-major 0/1 raster, width * height bytes. */
  maskBase64: z.string().min(1),
});

export type CutoutResponse = z.infer<typeof CutoutResponseSchema>;

/** Plain message when the server has no key to cut with. */
export const CUTOUT_NO_KEY_MESSAGE =
  "Cutouts are not available on this server.";

/** The concept sent for a sheet view: one centered figure on plain dark. */
export const SHEET_CUTOUT_CONCEPT = "figure";

/** One Responses request body for a SAM cutout. */
export function cutoutRequestBody(concept: string, dataUrl: string) {
  return {
    model: CUTOUT_MODEL,
    stream: true,
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: concept },
          { type: "input_image", image_url: dataUrl },
        ],
      },
    ],
  };
}

/**
 * Yield each `data:` payload of a Responses SSE stream as an object.
 * Skips the terminal `[DONE]` marker and unparseable lines.
 */
export async function* ssePayloads(
  res: Response,
): AsyncGenerator<unknown, void, void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut = buffer.indexOf("\n\n");
    while (cut >= 0) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of frame.split("\n")) {
        const text = line.trim();
        if (!text.startsWith("data:")) continue;
        const data = text.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          yield JSON.parse(data) as unknown;
        } catch {
          // A split multi-byte line resumes in the next chunk.
        }
      }
      cut = buffer.indexOf("\n\n");
    }
  }
}

/**
 * Normalize a raw Responses event stream for the SAM parser. The API
 * streams `response.content_part.done` but not `response.output_text.done`,
 * which the parser needs, so each output-text content part is replaced by
 * a synthesized output-text done event for its lane.
 */
export type CutoutEvent = { readonly type: string } & Record<
  string,
  unknown
>;

export async function* normalizedCutoutEvents(
  source: AsyncIterable<unknown> | Iterable<unknown>,
): AsyncGenerator<CutoutEvent, void, void> {
  for await (const raw of source) {
    if (raw === null || typeof raw !== "object") continue;
    const event = raw as Record<string, unknown>;
    if (typeof event.type !== "string") continue;
    if (event.type === "response.content_part.done") {
      const part = (event as { part?: unknown }).part;
      if (part !== null && typeof part === "object") {
        const record = part as Record<string, unknown>;
        if (
          record.type === "output_text" &&
          typeof record.text === "string"
        ) {
          yield {
            type: "response.output_text.done",
            item_id: event.item_id,
            output_index: event.output_index,
            content_index: event.content_index,
            text: record.text,
          };
          continue;
        }
      }
    }
    yield event as CutoutEvent;
  }
}

/** Area of a mask record on the source image, in square pixels. */
export function maskArea(record: SegmentationMaskRecord): number {
  const width = Math.max(0, record.bounds.right - record.bounds.left);
  const height = Math.max(0, record.bounds.bottom - record.bounds.top);
  return width * height;
}

/** The largest mask record, or null when the stream found nothing. */
export function selectLargestMask(
  records: readonly SegmentationMaskRecord[],
): SegmentationMaskRecord | null {
  let best: SegmentationMaskRecord | null = null;
  let bestArea = 0;
  for (const record of records) {
    const area = maskArea(record);
    if (best === null || area > bestArea) {
      best = record;
      bestArea = area;
    }
  }
  return best;
}

export function rasterToBase64(raster: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < raster.length; i += 1) {
    binary += String.fromCharCode(raster[i] ?? 0);
  }
  return btoa(binary);
}

export function base64ToRaster(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i) & 1;
  }
  return out;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = source;
  });
}

/**
 * Composite a cutout mask as alpha over the source image at its own size
 * and return a transparent PNG data URL. Browser only.
 */
export async function compositeCutout(
  sourceDataUrl: string,
  cutout: CutoutResponse,
): Promise<string> {
  const img = await loadImage(sourceDataUrl);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.drawImage(img, 0, 0);
  const image = ctx.getImageData(0, 0, width, height);
  const raster = base64ToRaster(cutout.maskBase64);
  const { left, top, right, bottom } = cutout.bounds;
  const span = Math.max(1, right - left);
  for (let y = 0; y < height; y += 1) {
    if (y < top || y >= bottom) {
      for (let x = 0; x < width; x += 1) {
        image.data[(y * width + x) * 4 + 3] = 0;
      }
      continue;
    }
    const row = y - top;
    for (let x = 0; x < width; x += 1) {
      const alpha =
        x >= left && x < right
          ? (raster[row * span + (x - left)] ?? 0)
          : 0;
      image.data[(y * width + x) * 4 + 3] = alpha ? 255 : 0;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}
