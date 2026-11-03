import { NextResponse } from "next/server";
import {
  decodeMaskToRaster,
  parseImageStream,
  recordsOfKind,
} from "@meta-sam/parser";
import {
  META_RESPONSES_URL,
  MetaApiError,
  postWithRetry,
} from "@/lib/meta/client";
import { fitsRequestLimit } from "@/lib/art";
import {
  CUTOUT_NO_KEY_MESSAGE,
  CutoutRequestSchema,
  CutoutResponseSchema,
  cutoutRequestBody,
  normalizedCutoutEvents,
  rasterToBase64,
  selectLargestMask,
  ssePayloads,
} from "@/lib/cutout";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * One SAM 3.1 cutout. Streams the Responses API, normalizes the events
 * for the parser, and returns the largest mask for the client to
 * composite as alpha at the source image's own size. The body must fit
 * inside 4.5MB; the route runs within 60 seconds.
 */
export async function POST(req: Request) {
  const raw = await req.text().catch(() => null);
  if (raw === null) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected a JSON body.");
  }
  if (!fitsRequestLimit(raw)) {
    return errorResponse(
      413,
      "REQUEST_TOO_LARGE",
      "That image request is too large.",
    );
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Expected a JSON body.");
  }
  const parsed = CutoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Expected { imageDataUrl, concept }.",
    );
  }
  const { imageDataUrl, concept } = parsed.data;

  if (!process.env.MODEL_API_KEY) {
    return errorResponse(503, "NO_API_KEY", CUTOUT_NO_KEY_MESSAGE);
  }

  const apiKey = process.env.MODEL_API_KEY;
  const startedAt = Date.now();
  try {
    const res = await postWithRetry(
      META_RESPONSES_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(cutoutRequestBody(concept, imageDataUrl)),
      },
      startedAt,
    );
    if (!res.ok || !res.body) {
      const status =
        res.status >= 400 && res.status < 600 ? res.status : 502;
      if (res.status === 400 || res.status === 422) {
        return errorResponse(status, "CUTOUT_REJECTED", "The cutout failed.");
      }
      throw new MetaApiError(status, "cutout_failed");
    }

    const result = await parseImageStream(
      normalizedCutoutEvents(ssePayloads(res)),
    ).finalResult;
    const masks = recordsOfKind(result.records, "mask");
    const best = selectLargestMask(masks);
    if (!best) {
      return errorResponse(
        422,
        "NO_CUTOUT",
        "No figure was found to cut out.",
      );
    }
    const raster = decodeMaskToRaster(best.mask);
    return NextResponse.json(
      CutoutResponseSchema.parse({
        width: best.mask.width,
        height: best.mask.height,
        bounds: best.bounds,
        maskBase64: rasterToBase64(raster),
      }),
    );
  } catch (error) {
    // Server log only: status, code and message. Never the key or image.
    if (error instanceof MetaApiError) {
      console.error(
        `[cutout] failed: ${error.status} ${error.code} ${error.message}`,
      );
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "The cutout failed.");
    }
    console.error(
      `[cutout] failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return errorResponse(500, "CUTOUT_FAILED", "The cutout failed.");
  }
}
