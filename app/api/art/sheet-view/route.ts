import { NextResponse } from "next/server";
import { budgetMessage, checkBudget } from "@/lib/budget";
import {
  ContentPolicyBlockedError,
  MetaApiError,
  completeJson,
  generateImage,
} from "@/lib/meta/client";
import {
  ART_REQUEST_LIMIT_BYTES,
  BLOCKED_MESSAGE,
  NO_KEY_MESSAGE,
  REWRITE_INSTRUCTIONS,
  REWRITE_JSON_SCHEMA,
  REWRITE_SCHEMA_NAME,
  RewriteModelOutputSchema,
  SHEET_VIEW_IDS,
  SheetViewRequestSchema,
  fitsRequestLimit,
  sheetPrompt,
} from "@/lib/art";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * One sheet view. The client drives the six views in order and chains
 * them with previousResponseId, so no request outlives a serverless
 * timeout. A blocked prompt is rewritten once; a second block returns
 * 422 with the rewritten description for the creator to edit and retry.
 */
export async function POST(req: Request) {
  const raw = await req.text().catch(() => null);
  if (raw === null) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected a JSON body.");
  }
  if (!fitsRequestLimit(raw)) {
    return errorResponse(
      413,
      "REQUEST_TOO_LARGE",
      "That image request is too large.",
    );
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Expected a JSON body.");
  }
  const parsed = SheetViewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Expected { view, character }.",
    );
  }
  const { view, character, referenceImage, previousResponseId, styleImage } =
    parsed.data;
  let { description } = parsed.data;
  if (!SHEET_VIEW_IDS.includes(view as (typeof SHEET_VIEW_IDS)[number])) {
    return errorResponse(400, "VALIDATION_ERROR", "Unknown sheet view.");
  }

  if (!process.env.MODEL_API_KEY) {
    return errorResponse(503, "NO_API_KEY", NO_KEY_MESSAGE);
  }

  const charge = await checkBudget("sheet-view", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  const references: string[] = [];
  if (referenceImage) references.push(referenceImage);
  else if (styleImage) references.push(styleImage);

  const style = {
    preset: parsed.data.stylePreset,
    notes: parsed.data.styleNotes,
  };

  const attempt = (text: string | undefined) =>
    generateImage({
      prompt: sheetPrompt(view, character, text, style),
      referenceImages: references,
      size: "1024x1536",
      previousResponseId,
    });

  try {
    const first = await attempt(description);
    if (!fitsRequestLimit(first.imageBase64)) {
      return errorResponse(
        502,
        "IMAGE_TOO_LARGE",
        "The generated image is too large.",
      );
    }
    return NextResponse.json(first);
  } catch (error) {
    if (!(error instanceof ContentPolicyBlockedError)) {
      if (error instanceof MetaApiError) {
        const status =
          error.status >= 400 && error.status < 600 ? error.status : 502;
        return errorResponse(status, error.code, "The sheet view failed.");
      }
      return errorResponse(500, "SHEET_VIEW_FAILED", "The sheet view failed.");
    }
  }

  try {
    const rewrite = await completeJson(
      {
        instructions: REWRITE_INSTRUCTIONS,
        input: sheetPrompt(view, character, description, style),
        schemaName: REWRITE_SCHEMA_NAME,
        jsonSchema: REWRITE_JSON_SCHEMA,
      },
      RewriteModelOutputSchema,
    );
    description = rewrite.description;
    const second = await attempt(description);
    if (!fitsRequestLimit(second.imageBase64)) {
      return errorResponse(
        502,
        "IMAGE_TOO_LARGE",
        "The generated image is too large.",
      );
    }
    return NextResponse.json(second);
  } catch (error) {
    if (error instanceof ContentPolicyBlockedError) {
      return NextResponse.json(
        {
          error: {
            code: "content_policy_blocked",
            message: BLOCKED_MESSAGE,
            details: { description },
          },
        },
        { status: 422 },
      );
    }
    if (error instanceof MetaApiError) {
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "The sheet view failed.");
    }
    return errorResponse(500, "SHEET_VIEW_FAILED", "The sheet view failed.");
  }
}

