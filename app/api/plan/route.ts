import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, budgetMessage, checkBudget } from "@/lib/budget";
import { MetaApiError, completeJson } from "@/lib/meta/client";
import {
  PLAN_INSTRUCTIONS,
  PlanModelOutputSchema,
  PlanRequestSchema,
  planModelInput,
  planModelJsonSchema,
  toPlanBeats,
  toPlanChannels,
  toPlanSecrets,
  uncoveredChannels,
  type PlanBeat,
  type PlanChannel,
  type PlanSecret,
} from "@/lib/plan";
import { WorldSchema } from "@/lib/world/schemas";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: Request) {
  const raw = await req.text().catch(() => null);
  if (raw === null) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { canon }.");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "That request is too large.");
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { canon }.");
  }
  const parsed = PlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { canon }.");
  }
  const { canon } = parsed.data;

  if (!process.env.MODEL_API_KEY) {
    const raw = await readFile(
      join(process.cwd(), "data", "seed", "anukili.json"),
      "utf-8",
    );
    const seed = WorldSchema.parse(JSON.parse(raw));
    return NextResponse.json({ ...seed, sample: true });
  }

  const charge = await checkBudget("plan", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  try {
    const withoutArt = {
      ...canon,
      files: [],
      characters: canon.characters.map((c) => ({
        ...c,
        artFile: "",
      })),
      parts: canon.parts.map((p) => ({ ...p, artFile: "" })),
    };
    const request = {
      instructions: PLAN_INSTRUCTIONS,
      input: planModelInput(withoutArt),
      schemaName: "channel_plan",
      jsonSchema: planModelJsonSchema(withoutArt),
    };
    const validate = (model: {
      channels?: unknown;
      beats?: unknown;
      secrets?: unknown;
    }): {
      channels: PlanChannel[];
      beats: PlanBeat[];
      secrets: PlanSecret[];
    } => {
      const channels = toPlanChannels(
        Array.isArray(model.channels) ? model.channels : [],
      );
      const channelIds = channels.map((channel) => channel.id);
      return {
        channels,
        beats: toPlanBeats(
          Array.isArray(model.beats) ? model.beats : [],
          canon,
          channelIds,
        ),
        secrets: toPlanSecrets(
          Array.isArray(model.secrets) ? model.secrets : [],
          channelIds,
        ),
      };
    };
    let plan = validate(await completeJson(request, PlanModelOutputSchema));
    // A channel with no secret breaks the map. Retry once, then continue
    // with what exists.
    if (uncoveredChannels(plan.channels, plan.secrets).length > 0) {
      plan = validate(await completeJson(request, PlanModelOutputSchema));
    }
    return NextResponse.json(plan);
  } catch (error) {
    if (error instanceof MetaApiError) {
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "Planning failed.");
    }
    return errorResponse(500, "PLAN_FAILED", "Planning failed.");
  }
}
