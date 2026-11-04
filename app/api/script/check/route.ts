import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, budgetMessage, checkBudget } from "@/lib/budget";
import { MetaApiError, completeJson } from "@/lib/meta/client";
import {
  CHECK_INSTRUCTIONS,
  CHECK_JSON_SCHEMA,
  CHECK_SCHEMA_NAME,
  SCRIPT_CHECK_NO_KEY_MESSAGE,
  ScriptCheckModelOutputSchema,
  ScriptCheckRequestSchema,
  scriptCheckInput,
  toScriptIssues,
} from "@/lib/script";
import { stripImageData } from "@/lib/story";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Check one script draft against the canon. The model sees every secret
 * and who may know it, so it can spot leaks; the route then drops any
 * issue whose quote is not in the draft, and any that repeats another
 * channel's secret. The client strips images before sending.
 */
export async function POST(req: Request) {
  const raw = await req.text().catch(() => null);
  if (raw === null) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Expected { world, channelId, partId, text }.",
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
      "Expected { world, channelId, partId, text }.",
    );
  }
  const parsed = ScriptCheckRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Expected { world, channelId, partId, text }.",
    );
  }
  const { channelId, partId, text } = parsed.data;
  const world = stripImageData(parsed.data.world);

  const part = world.parts.find((p) => p.id === partId);
  const channel = world.channels.find((c) => c.id === channelId);
  if (!part || !channel) {
    return errorResponse(400, "VALIDATION_ERROR", "Unknown part or channel.");
  }

  if (!process.env.MODEL_API_KEY) {
    return errorResponse(503, "NO_API_KEY", SCRIPT_CHECK_NO_KEY_MESSAGE);
  }

  const charge = await checkBudget("script-check", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  try {
    const model = await completeJson(
      {
        instructions: CHECK_INSTRUCTIONS,
        input: scriptCheckInput(world, channelId, partId, text),
        schemaName: CHECK_SCHEMA_NAME,
        jsonSchema: CHECK_JSON_SCHEMA,
      },
      ScriptCheckModelOutputSchema,
    );
    return NextResponse.json({
      issues: toScriptIssues(model.issues, text, world, channelId),
    });
  } catch (error) {
    // Server log only: status, code and message. Never the key or content.
    if (error instanceof MetaApiError) {
      console.error(
        `[script-check] failed: ${error.status} ${error.code} ${error.message}`,
      );
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "Checking the script failed.");
    }
    console.error(
      `[script-check] failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return errorResponse(500, "CHECK_FAILED", "Checking the script failed.");
  }
}
