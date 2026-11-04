import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, budgetMessage, checkBudget } from "@/lib/budget";
import { MetaApiError, completeJson } from "@/lib/meta/client";
import { channelsForPart } from "@/lib/pack";
import { stripImageData } from "@/lib/story";
import {
  STORYBOARD_PLAN_FAILED_MESSAGE,
  STORYBOARD_PLAN_INSTRUCTIONS,
  STORYBOARD_PLAN_JSON_SCHEMA,
  STORYBOARD_PLAN_MIN_USABLE_FRAMES,
  STORYBOARD_PLAN_NO_KEY_MESSAGE,
  STORYBOARD_PLAN_SCHEMA_NAME,
  StoryboardPlanModelOutputSchema,
  StoryboardPlanRequestSchema,
  planToStoryboard,
  sanitizePlannedFrames,
  storyboardPlanInput,
  toPlannedFrames,
} from "@/lib/storyboard";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Plan a storyboard for one scene: 4 to 8 sketch shots with framing,
 * action, dialogue, camera note and the characters in frame. The
 * prompt holds only the secrets this channel may know, plus the
 * scene's script when there is one (otherwise this channel's beats
 * here). The client strips images before sending. A characterId the
 * world does not know is dropped from its frame; a frame that repeats
 * another channel's secret is dropped whole.
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
  const parsed = StoryboardPlanRequestSchema.safeParse(body);
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
    return errorResponse(503, "NO_API_KEY", STORYBOARD_PLAN_NO_KEY_MESSAGE);
  }

  const charge = await checkBudget("storyboard-plan", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  try {
    const model = await completeJson(
      {
        instructions: STORYBOARD_PLAN_INSTRUCTIONS,
        input: storyboardPlanInput(world, channelId, partId),
        schemaName: STORYBOARD_PLAN_SCHEMA_NAME,
        jsonSchema: STORYBOARD_PLAN_JSON_SCHEMA,
      },
      StoryboardPlanModelOutputSchema,
    );
    const usable = sanitizePlannedFrames(model.frames);
    if (usable.length < STORYBOARD_PLAN_MIN_USABLE_FRAMES) {
      throw new Error("The model returned no usable frames.");
    }
    const board = planToStoryboard({
      channelId,
      partId,
      title: model.title,
      frames: toPlannedFrames(usable, world, channelId),
    });
    if (board.frames.length === 0) {
      throw new Error("The model returned no usable frames.");
    }
    return NextResponse.json({ storyboard: board });
  } catch (error) {
    // Server log only: status, code and message. Never the key or content.
    if (error instanceof MetaApiError) {
      console.error(
        `[storyboard-plan] failed: ${error.status} ${error.code} ${error.message}`,
      );
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, STORYBOARD_PLAN_FAILED_MESSAGE);
    }
    console.error(
      `[storyboard-plan] failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return errorResponse(500, "PLAN_FAILED", STORYBOARD_PLAN_FAILED_MESSAGE);
  }
}
