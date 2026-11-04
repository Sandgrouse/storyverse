import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, budgetMessage, checkBudget } from "@/lib/budget";
import { MetaApiError, completeJson } from "@/lib/meta/client";
import { stripImageData } from "@/lib/story";
import {
  DESIGN_INSTRUCTIONS,
  DESIGN_JSON_SCHEMA,
  DESIGN_SCHEMA_NAME,
  DesignModelOutputSchema,
  DesignRequestSchema,
  NO_VOICE_KEY_MESSAGE,
  buildVoiceDesignPrompt,
  logVoiceFailure,
} from "@/lib/voice";
import {
  designFishVoice,
  resolveVoiceProvider,
} from "@/lib/voice-provider";
import { requireOwnerCode } from "@/lib/voice-owner";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Owner, Fish Audio only: Muse Spark invents a voice for the character
 * from the canon (never from secrets), then Fish Audio renders three
 * candidate voices speaking the test line. No real speaker is
 * involved, so no consent is needed.
 */
export async function POST(req: Request) {
  const owner = requireOwnerCode(req);
  if (!owner.ok) {
    return errorResponse(owner.status, owner.code, owner.message);
  }

  if (resolveVoiceProvider() !== "fish") {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Designed voices need Fish Audio.",
    );
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
  const parsed = DesignRequestSchema.safeParse(body);
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

  const charge = await checkBudget("voice-design", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  let description: string;
  let testLine: string;
  try {
    const model = await completeJson(
      {
        instructions: DESIGN_INSTRUCTIONS,
        input: [
          {
            role: "user",
            content: buildVoiceDesignPrompt(world, characterId),
          },
        ],
        schemaName: DESIGN_SCHEMA_NAME,
        jsonSchema: DESIGN_JSON_SCHEMA,
      },
      DesignModelOutputSchema,
    );
    description = model.description;
    testLine = model.testLine;
  } catch (error) {
    if (error instanceof MetaApiError) {
      logVoiceFailure("design", error.status, error.message);
      const status = error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "Imagining that voice failed.");
    }
    logVoiceFailure("design", 500, error instanceof Error ? error.message : String(error));
    return errorResponse(500, "VOICE_FAILED", "Imagining that voice failed.");
  }

  const designed = await designFishVoice({
    instruction: description,
    referenceText: testLine,
  });
  if (!designed.ok) {
    return errorResponse(designed.status, "VOICE_FAILED", designed.message);
  }
  return NextResponse.json({
    description,
    testLine,
    candidates: designed.candidates,
  });
}
