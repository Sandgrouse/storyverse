// Server only. Never import this module from a client component: it sends
// the model API key. Route handlers (server) are the only callers.

import { z } from "zod";

if (typeof window !== "undefined") {
  throw new Error("lib/meta/client.ts is server only");
}

export const META_RESPONSES_URL = "https://api.meta.ai/v1/responses";
export const RIPPLE_MODEL = "muse-spark-1.3";

export class MetaApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    // Never include the API key here. Only the status and the API's code.
    super(`Meta API error ${status} (${code})`);
    this.name = "MetaApiError";
    this.status = status;
    this.code = code;
  }
}

export type StructuredOutputRequest = {
  instructions: string;
  input: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
};

function apiErrorCode(payload: unknown): string {
  if (payload !== null && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const error = record.error;
    if (error !== null && typeof error === "object") {
      const code = (error as Record<string, unknown>).code;
      if (typeof code === "string" && code.length > 0) return code;
    }
    const code = record.code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return "meta_error";
}

function firstOutputText(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object") return null;
  const output = (payload as Record<string, unknown>).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (item === null || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const entry of content) {
      if (entry === null || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      if (record.type === "output_text" && typeof record.text === "string") {
        return record.text;
      }
    }
  }
  return null;
}

function logUsage(payload: unknown): void {
  if (payload !== null && typeof payload === "object") {
    const usage = (payload as Record<string, unknown>).usage;
    if (usage !== null && typeof usage === "object") {
      console.log(`[meta] model=${RIPPLE_MODEL} usage=${JSON.stringify(usage)}`);
    }
  }
}

/** Call the Responses API with structured output, then validate with zod. */
export async function completeJson<T>(
  request: StructuredOutputRequest,
  resultSchema: z.ZodType<T>,
): Promise<T> {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) {
    throw new Error("MODEL_API_KEY is not set");
  }

  const res = await fetch(META_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: RIPPLE_MODEL,
      reasoning: { effort: "low" },
      instructions: request.instructions,
      input: request.input,
      text: {
        format: {
          type: "json_schema",
          name: request.schemaName,
          strict: true,
          schema: request.jsonSchema,
        },
      },
    }),
  });

  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new MetaApiError(res.status, apiErrorCode(payload));
  }

  logUsage(payload);
  const text = firstOutputText(payload);
  if (!text) {
    throw new Error("Meta API returned no output_text");
  }
  return resultSchema.parse(JSON.parse(text));
}
