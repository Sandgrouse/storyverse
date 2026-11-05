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

/** The concept sent for a sheet view: one centered person on plain dark. */
export const SHEET_CUTOUT_CONCEPT = "person";

/**
 * Second try when "person" finds no mask. The route reports NO_CUTOUT,
 * so the client retries once with this before showing the failure.
 */
export const SHEET_CUTOUT_FALLBACK_CONCEPT = "figure";

/** The route's error message, or the generic cutout failure. Pure. */
export function readCutoutError(json: unknown): { code?: string; message: string } {
  const record =
    json !== null && typeof json === "object"
      ? (json as Record<string, unknown>)
      : null;
  const error =
    record?.error !== null && typeof record?.error === "object"
      ? (record.error as Record<string, unknown>)
      : null;
  const message =
    typeof error?.message === "string" && error.message.length > 0
      ? error.message
      : "The cutout failed.";
  const code = typeof error?.code === "string" ? error.code : undefined;
  return code === undefined ? { message } : { code, message };
}

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
 * Normalize a raw Responses event stream for the SAM parser. The API may
 * send both `response.output_text.done` and `response.content_part.done`
 * for the same lane, while the parser finalizes a lane only once, so a
 * second done for one lane fails. Follows Meta's cookbook logic: track
 * finished lanes and synthesize at most one done per lane.
 */
export type CutoutEvent = { readonly type: string } & Record<
  string,
  unknown
>;

function cutoutLaneKey(event: Record<string, unknown>): string {
  return `${String(event.item_id ?? "")}:${String(event.output_index ?? "")}:${String(event.content_index ?? "")}`;
}

export async function* normalizedCutoutEvents(
  source: AsyncIterable<unknown> | Iterable<unknown>,
): AsyncGenerator<CutoutEvent, void, void> {
  const finished = new Set<string>();
  for await (const raw of source) {
    if (raw === null || typeof raw !== "object") continue;
    const event = raw as Record<string, unknown>;
    if (typeof event.type !== "string") continue;
    if (event.type === "response.output_text.done") {
      const key = cutoutLaneKey(event);
      if (finished.has(key)) continue;
      finished.add(key);
      yield event as CutoutEvent;
      continue;
    }
    if (event.type === "response.content_part.done") {
      yield event as CutoutEvent;
      const part = (event as { part?: unknown }).part;
      if (part !== null && typeof part === "object") {
        const record = part as Record<string, unknown>;
        if (
          record.type === "output_text" &&
          typeof record.text === "string"
        ) {
          const key = cutoutLaneKey(event);
          if (finished.has(key)) continue;
          finished.add(key);
          yield {
            type: "response.output_text.done",
            item_id: event.item_id,
            output_index: event.output_index,
            content_index: event.content_index,
            text: record.text,
          };
        }
      }
      continue;
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

/** Share of the mask area below which an enclosed hole is filled. */
export const CUTOUT_MAX_HOLE_SHARE = 0.003;

/**
 * Fill small 4-connected holes of zero pixels that do not touch the
 * raster edge. Holes larger than maxHoleArea stay as they may be real
 * background. Returns a new array; the input is unchanged. Iterative,
 * so large rasters cannot overflow the call stack.
 */
export function fillSmallMaskHoles(
  raster: Uint8Array,
  width: number,
  height: number,
  maxHoleArea: number,
): Uint8Array {
  const out = new Uint8Array(raster);
  if (width <= 0 || height <= 0 || maxHoleArea < 0) return out;
  if (raster.length < width * height) return out;
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const region: number[] = [];
  for (let start = 0; start < width * height; start += 1) {
    if (raster[start] !== 0 || visited[start] !== 0) continue;
    region.length = 0;
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;
    let touchesEdge = false;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      region.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        touchesEdge = true;
      }
      if (x > 0) {
        const next = index - 1;
        if (raster[next] === 0 && visited[next] === 0) {
          visited[next] = 1;
          stack.push(next);
        }
      }
      if (x < width - 1) {
        const next = index + 1;
        if (raster[next] === 0 && visited[next] === 0) {
          visited[next] = 1;
          stack.push(next);
        }
      }
      if (y > 0) {
        const next = index - width;
        if (raster[next] === 0 && visited[next] === 0) {
          visited[next] = 1;
          stack.push(next);
        }
      }
      if (y < height - 1) {
        const next = index + width;
        if (raster[next] === 0 && visited[next] === 0) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }
    if (!touchesEdge && region.length <= maxHoleArea) {
      for (const index of region) out[index] = 255;
    }
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
 * Read one source pixel of a cutout mask. The raster is row-major over
 * its own width and height, which are usually smaller than the
 * source-pixel box it covers, so the box pixel scales down into the
 * raster. Zero outside the box. Pure and canvas-free, so tests cover it.
 */
export function sampleCutoutMask(
  raster: Uint8Array,
  maskWidth: number,
  maskHeight: number,
  bounds: CutoutBounds,
  x: number,
  y: number,
): number {
  const boxWidth = bounds.right - bounds.left;
  const boxHeight = bounds.bottom - bounds.top;
  if (boxWidth <= 0 || boxHeight <= 0 || maskWidth <= 0 || maskHeight <= 0) {
    return 0;
  }
  if (x < bounds.left || x >= bounds.right || y < bounds.top || y >= bounds.bottom) {
    return 0;
  }
  const mx = Math.min(
    maskWidth - 1,
    Math.floor(((x - bounds.left) * maskWidth) / boxWidth),
  );
  const my = Math.min(
    maskHeight - 1,
    Math.floor(((y - bounds.top) * maskHeight) / boxHeight),
  );
  return raster[my * maskWidth + mx] ?? 0;
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
  const raster = fillSmallMaskHoles(
    base64ToRaster(cutout.maskBase64),
    cutout.width,
    cutout.height,
    Math.floor(cutout.width * cutout.height * CUTOUT_MAX_HOLE_SHARE),
  );
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = sampleCutoutMask(
        raster,
        cutout.width,
        cutout.height,
        cutout.bounds,
        x,
        y,
      );
      image.data[(y * width + x) * 4 + 3] = alpha ? 255 : 0;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}
