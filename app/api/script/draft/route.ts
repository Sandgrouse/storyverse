import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, budgetMessage, checkBudget } from "@/lib/budget";
import { MetaApiError, completeJson } from "@/lib/meta/client";
import { channelsForPart } from "@/lib/pack";
import {
  DRAFT_INSTRUCTIONS,
  DRAFT_JSON_SCHEMA,
  DRAFT_SCHEMA_NAME,
  SCRIPT_DRAFT_NO_KEY_MESSAGE,
  ScriptDraftModelOutputSchema,
  ScriptDraftRequestSchema,
  scriptDraftInput,
} from "@/lib/script";
import { stripImageData } from "@/lib/story";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Write one scene in the channel's form, or a replacement for the
 * selected lines. The prompt holds only the secrets this channel may
 * know. The client strips images before sending.
 */
export async function POST(req: Request) {
  const raw = await req.text().catch(() => null);
  if (raw === null) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Expected { world, channelId, partId, mode }.",
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
      "Expected { world, channelId, partId, mode }.",
    );
  }
  const parsed = ScriptDraftRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Expected { world, channelId, partId, mode }.",
    );
  }
  const { channelId, partId, mode, text, selection, instruction } = parsed.data;
  const world = stripImageData(parsed.data.world);

  if (mode === "rewrite" && !selection) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Select the lines to rewrite first.",
    );
  }
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
    return errorResponse(503, "NO_API_KEY", SCRIPT_DRAFT_NO_KEY_MESSAGE);
  }

  const charge = await checkBudget("script-draft", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  try {
    const model = await completeJson(
      {
        instructions:
          mode === "rewrite"
            ? `${DRAFT_INSTRUCTIONS} Return only the replacement for the selection, in the same form.`
            : DRAFT_INSTRUCTIONS,
        input: scriptDraftInput(world, channelId, partId, {
          text,
          selection,
          instruction,
        }),
        schemaName: DRAFT_SCHEMA_NAME,
        jsonSchema: DRAFT_JSON_SCHEMA,
      },
      ScriptDraftModelOutputSchema,
    );
    return NextResponse.json({ text: model.text });
  } catch (error) {
    // Server log only: status, code and message. Never the key or content.
    if (error instanceof MetaApiError) {
      console.error(
        `[script-draft] failed: ${error.status} ${error.code} ${error.message}`,
      );
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "The draft failed.");
    }
    console.error(
      `[script-draft] failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return errorResponse(500, "DRAFT_FAILED", "The draft failed.");
  }
}
