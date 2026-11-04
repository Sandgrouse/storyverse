import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, budgetMessage, checkBudget } from "@/lib/budget";
import { MetaApiError, completeJson } from "@/lib/meta/client";
import { stripImageData } from "@/lib/story";
import {
  NO_VOICE_KEY_MESSAGE,
  SUGGEST_INSTRUCTIONS,
  SUGGEST_JSON_SCHEMA,
  SUGGEST_SCHEMA_NAME,
  SuggestModelOutputSchema,
  SuggestRequestSchema,
  logVoiceFailure,
} from "@/lib/voice";
import { getVoiceProvider } from "@/lib/voice-provider";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Muse Spark reads the character's canon and the premade voice list,
 * then picks the best voice, says why in one line, and writes one short
 * line the character would say. Images and audio never travel along.
 */
export async function POST(req: Request) {
  const raw = await req.text().catch(() => null);
  if (raw === null) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { world, characterId, voices }.");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "That request is too large.");
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { world, characterId, voices }.");
  }
  const parsed = SuggestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { world, characterId, voices }.");
  }
  const world = stripImageData(parsed.data.world);
  const { characterId, voices } = parsed.data;

  const character = world.characters.find((c) => c.id === characterId);
  if (!character) {
    return errorResponse(400, "VALIDATION_ERROR", "Unknown character.");
  }

  if (!getVoiceProvider()) {
    return errorResponse(503, "NO_VOICE_KEY", NO_VOICE_KEY_MESSAGE);
  }

  const charge = await checkBudget("voice-suggest", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  const options = voices
    .map((voice) => {
      const labels = Object.entries(voice.labels)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");
      return `- ${voice.id}: ${voice.name}${labels ? ` (${labels})` : ""}`;
    })
    .join("\n");

  try {
    const model = await completeJson(
      {
        instructions: SUGGEST_INSTRUCTIONS,
        input: [
          {
            role: "user",
            content: `Character: ${character.name}. Canon: ${character.canon}\n\nVoices:\n${options}`,
          },
        ],
        schemaName: SUGGEST_SCHEMA_NAME,
        jsonSchema: SUGGEST_JSON_SCHEMA,
      },
      SuggestModelOutputSchema,
    );
    if (!voices.some((voice) => voice.id === model.voiceId)) {
      logVoiceFailure("suggest", 200, `unknown voice ${model.voiceId}`);
      return errorResponse(422, "UNKNOWN_VOICE", "That voice isn't in the list.");
    }
    return NextResponse.json(model);
  } catch (error) {
    if (error instanceof MetaApiError) {
      logVoiceFailure("suggest", error.status, error.message);
      const status = error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "Choosing a voice failed.");
    }
    logVoiceFailure("suggest", 500, error instanceof Error ? error.message : String(error));
    return errorResponse(500, "VOICE_FAILED", "Choosing a voice failed.");
  }
}
