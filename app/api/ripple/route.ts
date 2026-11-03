import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, budgetMessage, checkBudget } from "@/lib/budget";
import { MetaApiError, completeJson } from "@/lib/meta/client";
import {
  RIPPLE_INSTRUCTIONS,
  RippleModelOutputSchema,
  RippleRequestSchema,
  rippleModelInput,
  rippleModelJsonSchema,
  toRippleFixes,
  toSecretUpdates,
} from "@/lib/ripple";
import { RippleResultSchema } from "@/lib/world/schemas";

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
  const parsed = RippleRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { change, world }.");
  }
  const { change, world } = parsed.data;

  if (!process.env.MODEL_API_KEY) {
    const raw = await readFile(
      join(process.cwd(), "data", "seed", "anukili-ripple.json"),
      "utf-8",
    );
    const seed = RippleResultSchema.parse(JSON.parse(raw));
    return NextResponse.json({ ...seed, change, sample: true });
  }

  const charge = await checkBudget("ripple", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  try {
    const model = await completeJson(
      {
        instructions: RIPPLE_INSTRUCTIONS,
        input: rippleModelInput(change, world),
        schemaName: "ripple_result",
        jsonSchema: rippleModelJsonSchema(world),
      },
      RippleModelOutputSchema,
    );
    const fixes = toRippleFixes(model.fixes, world);
    const secretUpdates = toSecretUpdates(model.secretUpdates ?? [], world);
    return NextResponse.json(
      RippleResultSchema.parse({
        change,
        summary: model.summary,
        fixes,
        secretUpdates,
      }),
    );
  } catch (error) {
    if (error instanceof MetaApiError) {
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "The ripple failed.");
    }
    return errorResponse(500, "RIPPLE_FAILED", "The ripple failed.");
  }
}
