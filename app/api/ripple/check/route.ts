import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, budgetMessage, checkBudget } from "@/lib/budget";
import { MetaApiError, completeJson } from "@/lib/meta/client";
import {
  CHECK_INSTRUCTIONS,
  CheckModelOutputSchema,
  CheckRequestSchema,
  CheckResponseSchema,
  checkModelInput,
} from "@/lib/ripple";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: Request) {
  const raw = await req.text().catch(() => null);
  if (raw === null) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { change, world }.");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "That request is too large.");
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { change, world }.");
  }
  const parsed = CheckRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { change, world }.");
  }
  const { change, world } = parsed.data;

  if (!process.env.MODEL_API_KEY) {
    return NextResponse.json(
      CheckResponseSchema.parse({
        consistent: true,
        note: "Sample check: the canon holds with this change.",
        sample: true,
      }),
    );
  }

  const charge = await checkBudget("check", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  try {
    const model = await completeJson(
      {
        instructions: CHECK_INSTRUCTIONS,
        input: checkModelInput(change, world),
        schemaName: "ripple_check",
        jsonSchema: {
          type: "object",
          properties: {
            consistent: { type: "boolean" },
            note: { type: "string" },
          },
          required: ["consistent", "note"],
          additionalProperties: false,
        },
      },
      CheckModelOutputSchema,
    );
    return NextResponse.json(
      CheckResponseSchema.parse({
        consistent: model.consistent,
        note: model.note,
      }),
    );
  } catch (error) {
    if (error instanceof MetaApiError) {
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "Checking the canon failed.");
    }
    return errorResponse(500, "CHECK_FAILED", "Checking the canon failed.");
  }
}
