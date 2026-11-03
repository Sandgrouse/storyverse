import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { MetaApiError, completeJson } from "@/lib/meta/client";
import {
  READ_INSTRUCTIONS,
  ReadModelOutputSchema,
  ReadRequestSchema,
  buildReadInput,
  readModelJsonSchema,
  sanitizeArtFiles,
} from "@/lib/read";
import { WorldSchema } from "@/lib/world/schemas";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  const parsed = ReadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { files, idea? }.");
  }
  const { files, idea } = parsed.data;
  const hasIdea = typeof idea === "string" && idea.trim().length > 0;
  if (files.length === 0 && !hasIdea) {
    return errorResponse(400, "VALIDATION_ERROR", "Send files or an idea.");
  }

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
        instructions: READ_INSTRUCTIONS,
        input: buildReadInput(files, idea),
        schemaName: "canon",
        jsonSchema: readModelJsonSchema(),
      },
      ReadModelOutputSchema,
    );
    const sentNames = new Set(files.map((file) => file.name));
    const parsed = ReadModelOutputSchema.parse(model);
    const canon = sanitizeArtFiles(parsed, sentNames);
    return NextResponse.json(ReadModelOutputSchema.parse(canon));
  } catch (error) {
    if (error instanceof MetaApiError) {
      const status =
        error.status >= 400 && error.status < 600 ? error.status : 502;
      return errorResponse(status, error.code, "Reading failed.");
    }
    return errorResponse(500, "READ_FAILED", "Reading failed.");
  }
}
