import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, budgetMessage, checkBudget } from "@/lib/budget";
import { MetaApiError, completeJson } from "@/lib/meta/client";
import { stripImageData } from "@/lib/story";
import {
  LINES_INSTRUCTIONS,
  LINES_JSON_SCHEMA,
  LINES_SCHEMA_NAME,
  LinesModelOutputSchema,
  LinesRequestSchema,
  NO_VOICE_KEY_MESSAGE,
  buildVoiceLinesPrompt,
  logVoiceFailure,
} from "@/lib/voice";
import { requireOwnerCode } from "@/lib/voice-owner";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Muse Spark writes 8 to 12 short lines this character would say, taken
 * from or true to the material, about 90 seconds to read aloud with
 * varied emotion. Secrets never reach the prompt: the builder strips
 * images and redacts every secret string. Owner only.
 */
export async function POST(req: Request) {
  const owner = requireOwnerCode(req);
  if (!owner.ok) {
    return errorResponse(owner.status, owner.code, owner.message);
  }

  const raw = await req.text().catch(() => null);
  if (raw === null) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { world, characterId }.");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "That request is too large.");
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { world, characterId }.");
  }
  const parsed = LinesRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { world, characterId }.");
  }
  const world = stripImageData(parsed.data.world);
  const { characterId } = parsed.data;

  const character = world.characters.find((c) => c.id === characterId);
  if (!character) {
    return errorResponse(400, "VALIDATION_ERROR", "Unknown character.");
  }

  if (!process.env.MODEL_API_KEY) {
    return errorResponse(503, "NO_VOICE_KEY", NO_VOICE_KEY_MESSAGE);
  }

  const charge = await checkBudget("voice-suggest", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  try {
    const model = await completeJson(
      {
        instructions: LINES_INSTRUCTIONS,
        input: [{ role: "user", content: buildVoiceLinesPrompt(world, characterId) }],
        schemaName: LINES_SCHEMA_NAME,
        jsonSchema: LINES_JSON_SCHEMA,
      },
      LinesModelOutputSchema,
    );
    return NextResponse.json(model);
  } catch (error) {
    if (error instanceof MetaApiError) {
      logVoiceFailure("lines", error.status, error.message);
      const status = error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "Writing reading lines failed.");
    }
    logVoiceFailure("lines", 500, error instanceof Error ? error.message : String(error));
    return errorResponse(500, "VOICE_FAILED", "Writing reading lines failed.");
  }
}
