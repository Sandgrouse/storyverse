import { NextResponse } from "next/server";
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
  const body: unknown = await req.json().catch(() => null);
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
    if (error instanceof MetaApiError) {
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "The story pack failed.");
    }
    return errorResponse(500, "PACK_FAILED", "The story pack failed.");
  }
}
