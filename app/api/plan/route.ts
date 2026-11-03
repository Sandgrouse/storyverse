import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
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
} from "@/lib/plan";
import { WorldSchema } from "@/lib/world/schemas";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
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

  try {
    const model = await completeJson(
      {
        instructions: PLAN_INSTRUCTIONS,
        input: planModelInput({
          ...canon,
          files: [],
          characters: canon.characters.map((c) => ({
            ...c,
            artFile: "",
          })),
          parts: canon.parts.map((p) => ({ ...p, artFile: "" })),
        }),
        schemaName: "channel_plan",
        jsonSchema: planModelJsonSchema({
          ...canon,
          files: [],
          characters: canon.characters.map((c) => ({
            ...c,
            artFile: "",
          })),
          parts: canon.parts.map((p) => ({ ...p, artFile: "" })),
        }),
      },
      PlanModelOutputSchema,
    );
    const channels = toPlanChannels(model.channels ?? []);
    const channelIds = channels.map((channel) => channel.id);
    const beats = toPlanBeats(model.beats ?? [], canon, channelIds);
    const secrets = toPlanSecrets(model.secrets ?? [], channelIds);
    return NextResponse.json({ channels, beats, secrets });
  } catch (error) {
    if (error instanceof MetaApiError) {
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "Planning failed.");
    }
    return errorResponse(500, "PLAN_FAILED", "Planning failed.");
  }
}
