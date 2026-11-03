import { NextResponse } from "next/server";
import { MetaApiError, completeJson } from "@/lib/meta/client";
import {
  APPLY_INSTRUCTIONS,
  ApplyModelOutputSchema,
  ApplyRequestSchema,
  ApplyResponseSchema,
  applyModelInput,
} from "@/lib/ripple";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  const parsed = ApplyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Expected { change, fix, world }.",
    );
  }
  const { change, fix, world } = parsed.data;

  if (!process.env.MODEL_API_KEY) {
    const beat = world.beats.find((b) => b.id === fix.beatId);
    if (!beat) {
      return errorResponse(404, "BEAT_NOT_FOUND", "That scene is not in the world.");
    }
    return NextResponse.json(
      ApplyResponseSchema.parse({
        content: `${beat.content} [Sample: ${fix.proposal}]`,
        sample: true,
      }),
    );
  }

  try {
    const model = await completeJson(
      {
        instructions: APPLY_INSTRUCTIONS,
        input: applyModelInput(change, fix, world),
        schemaName: "ripple_apply",
        jsonSchema: {
          type: "object",
          properties: { content: { type: "string" } },
          required: ["content"],
          additionalProperties: false,
        },
      },
      ApplyModelOutputSchema,
    );
    return NextResponse.json(ApplyResponseSchema.parse({ content: model.content }));
  } catch (error) {
    if (error instanceof MetaApiError) {
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "Applying the fix failed.");
    }
    return errorResponse(500, "APPLY_FAILED", "Applying the fix failed.");
  }
}
