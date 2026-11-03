import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, budgetMessage, checkBudget } from "@/lib/budget";
import { MetaApiError, completeJson } from "@/lib/meta/client";
import {
  PACK_INSTRUCTIONS,
  PACK_JSON_SCHEMA,
  PACK_NO_KEY_MESSAGE,
  PACK_SCHEMA_NAME,
  PackModelOutputSchema,
  PackRequestSchema,
  channelsForPart,
  packModelInput,
} from "@/lib/pack";
import { stripImageData } from "@/lib/story";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * One channel's take on one part: a script in the channel's form, three
 * to five visual beats, three teasing posts, the secrets it reveals and
 * anything invented. The client strips images before sending.
 */
export async function POST(req: Request) {
  const raw = await req.text().catch(() => null);
  if (raw === null) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Expected { world, partId, channelId }.",
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
      "Expected { world, partId, channelId }.",
    );
  }
  const parsed = PackRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Expected { world, partId, channelId }.",
    );
  }
  const { partId, channelId } = parsed.data;
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
    return errorResponse(503, "NO_API_KEY", PACK_NO_KEY_MESSAGE);
  }

  const charge = await checkBudget("pack", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  try {
    const model = await completeJson(
      {
        instructions: PACK_INSTRUCTIONS,
        input: packModelInput(world, partId, channelId),
        schemaName: PACK_SCHEMA_NAME,
        jsonSchema: PACK_JSON_SCHEMA,
      },
      PackModelOutputSchema,
    );
    return NextResponse.json({ ...model, partId, channelId });
  } catch (error) {
    // Server log only: status, code and message. Never the key or images.
    if (error instanceof MetaApiError) {
      console.error(
        `[pack] failed: ${error.status} ${error.code} ${error.message}`,
      );
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "The story pack failed.");
    }
    console.error(
      `[pack] failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return errorResponse(500, "PACK_FAILED", "The story pack failed.");
  }
}
