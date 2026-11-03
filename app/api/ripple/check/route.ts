import { NextResponse } from "next/server";
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
  const body: unknown = await req.json().catch(() => null);
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
