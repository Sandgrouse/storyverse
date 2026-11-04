import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, budgetMessage, checkBudget } from "@/lib/budget";
import { MetaApiError, completeJson } from "@/lib/meta/client";
import {
  FACTS_INSTRUCTIONS,
  FactsModelOutputSchema,
  FactsRequestSchema,
  factsModelInput,
  factsModelJsonSchema,
} from "@/lib/facts";
import { stripImageData } from "@/lib/story";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Story basics for a saved project that has none. The client sends the
 * world with images stripped; Muse Spark returns facts in the same shape
 * as the read step does, with their sources.
 */
export async function POST(req: Request) {
  const raw = await req.text().catch(() => null);
  if (raw === null) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { world }.");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "That request is too large.");
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { world }.");
  }
  const parsed = FactsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { world }.");
  }
  const world = stripImageData(parsed.data.world);

  if (!process.env.MODEL_API_KEY) {
    return errorResponse(503, "NO_API_KEY", "The story basics need an API key.");
  }

  const charge = await checkBudget("facts", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  try {
    const model = await completeJson(
      {
        instructions: FACTS_INSTRUCTIONS,
        input: factsModelInput(world),
        schemaName: "facts",
        jsonSchema: factsModelJsonSchema(),
      },
      FactsModelOutputSchema,
    );
    return NextResponse.json(FactsModelOutputSchema.parse(model));
  } catch (error) {
    if (error instanceof MetaApiError) {
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "The story basics failed.");
    }
    return errorResponse(500, "FACTS_FAILED", "The story basics failed.");
  }
}
