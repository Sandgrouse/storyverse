import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, budgetMessage, checkBudget } from "@/lib/budget";
import { MetaApiError, completeJson } from "@/lib/meta/client";
import { channelsForPart } from "@/lib/pack";
import { stripImageData } from "@/lib/story";
import {
  VIDEO_PLAN_FAILED_MESSAGE,
  VIDEO_PLAN_INSTRUCTIONS,
  VIDEO_PLAN_JSON_SCHEMA,
  VIDEO_PLAN_MIN_USABLE_SHOTS,
  VIDEO_PLAN_NO_KEY_MESSAGE,
  VIDEO_PLAN_SCHEMA_NAME,
  VideoPlanModelOutputSchema,
  VideoPlanRequestSchema,
  planToShort,
  sanitizePlannedShots,
  toPlannedShots,
  videoPlanInput,
} from "@/lib/video";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Cut a short video from one scene: at least 4 shots over the project's
 * art, with captions and optional spoken lines. When fewer come back the
 * cut keeps them; only a plan with nothing usable fails. The prompt holds
 * only the secrets this channel may know. The client strips images before
 * sending. Unknown images fall back to the part's own art.
 */
export async function POST(req: Request) {
  const raw = await req.text().catch(() => null);
  if (raw === null) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Expected { world, channelId, partId }.",
    );
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "That request is too large.");
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Expected { world, channelId, partId }.",
    );
  }
  const parsed = VideoPlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Expected { world, channelId, partId }.",
    );
  }
  const { channelId, partId } = parsed.data;
  const world = stripImageData(parsed.data.world);

  const part = world.parts.find((p) => p.id === partId);
  const channel = world.channels.find((c) => c.id === channelId);
  if (!part || !channel) {
    return errorResponse(400, "VALIDATION_ERROR", "Unknown part or channel.");
  }
  const covered = channelsForPart(world, partId).some(
    (c) => c.id === channelId,
  );
  if (!covered) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "That channel does not cover this part.",
    );
  }

  if (!process.env.MODEL_API_KEY) {
    return errorResponse(503, "NO_API_KEY", VIDEO_PLAN_NO_KEY_MESSAGE);
  }

  const charge = await checkBudget("video-plan", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  try {
    const model = await completeJson(
      {
        instructions: VIDEO_PLAN_INSTRUCTIONS,
        input: videoPlanInput(world, channelId, partId),
        schemaName: VIDEO_PLAN_SCHEMA_NAME,
        jsonSchema: VIDEO_PLAN_JSON_SCHEMA,
      },
      VideoPlanModelOutputSchema,
    );
    const usable = sanitizePlannedShots(model.shots);
    if (usable.length < VIDEO_PLAN_MIN_USABLE_SHOTS) {
      throw new Error("The model returned too few usable shots.");
    }
    const short = planToShort({
      channelId,
      partId,
      title: model.title,
      shots: toPlannedShots(usable, world, partId),
    });
    return NextResponse.json({ short });
  } catch (error) {
    // Server log only: status, code and message. Never the key or content.
    if (error instanceof MetaApiError) {
      console.error(
        `[video-plan] failed: ${error.status} ${error.code} ${error.message}`,
      );
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, VIDEO_PLAN_FAILED_MESSAGE);
    }
    console.error(
      `[video-plan] failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return errorResponse(500, "PLAN_FAILED", VIDEO_PLAN_FAILED_MESSAGE);
  }
}
