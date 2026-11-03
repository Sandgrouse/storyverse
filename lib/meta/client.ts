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

/** The image filter refused this prompt. The caller may rewrite and retry. */
export class ContentPolicyBlockedError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(`Image prompt blocked (${code})`);
    this.name = "ContentPolicyBlockedError";
    this.status = status;
    this.code = code;
  }
}

export const IMAGE_MODEL = "muse-image-1.0";

export const IMAGE_SIZES = ["1024x1024", "1024x1536", "1536x1024"] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];

export type GenerateImageRequest = {
  prompt: string;
  referenceImages?: string[];
  size?: ImageSize;
  previousResponseId?: string;
};

export type GenerateImageResult = {
  imageBase64: string;
  responseId: string;
};

function isBlockedPayload(payload: unknown): boolean {
  return apiErrorCode(payload) === "content_policy_violation";
}

function firstImageResult(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object") return null;
  const output = (payload as Record<string, unknown>).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (item === null || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.type !== "image_generation_call") continue;
    if (typeof record.result === "string" && record.result.length > 0) {
      return record.result;
    }
  }
  return null;
}

/**
 * Call Muse Image through the Responses API. Reference images and the
 * previous response id keep chained views on-model. Throws
 * ContentPolicyBlockedError when the filter refuses the prompt.
 */
export async function generateImage(
  request: GenerateImageRequest,
): Promise<GenerateImageResult> {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) {
    throw new Error("MODEL_API_KEY is not set");
  }

  const content: Array<Record<string, string>> = [
    { type: "input_text", text: request.prompt },
  ];
  for (const image of request.referenceImages ?? []) {
    content.push({ type: "input_image", image_url: image });
  }

  const body: Record<string, unknown> = {
    model: IMAGE_MODEL,
    input: [{ role: "user", content }],
    tools: [{ type: "image_generation", size: request.size ?? "1024x1536" }],
  };
  if (request.previousResponseId) {
    body.previous_response_id = request.previousResponseId;
  }

  const res = await fetch(META_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = apiErrorCode(payload);
    const message = apiErrorMessage(payload);
    console.error(
      `[meta] image_generation failed: ${res.status} ${code}${message ? ` ${message}` : ""}`,
    );
    if (res.status === 400 && isBlockedPayload(payload)) {
      throw new ContentPolicyBlockedError(res.status, code);
    }
    throw new MetaApiError(res.status, code);
  }

  logUsage(payload, IMAGE_MODEL);
  const imageBase64 = firstImageResult(payload);
  if (!imageBase64) {
    throw new Error("Meta API returned no image_generation_call result");
  }
  const id = (payload as Record<string, unknown>).id;
  return {
    imageBase64,
    responseId: typeof id === "string" ? id : "",
  };
}

export type ModelMessage = {
  role: string;
  content: unknown;
};

export type StructuredOutputRequest = {
  instructions: string;
  input: string | ModelMessage[];
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

/**
 * The API's own error message, for the server log. The payload never holds
 * the key, but this stays a short string anyway: status, code and message.
 */
function apiErrorMessage(payload: unknown): string {
  if (payload !== null && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const error = record.error;
    if (error !== null && typeof error === "object") {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string" && message.length > 0) {
        return message.slice(0, 300);
      }
    }
    const message = record.message;
    if (typeof message === "string" && message.length > 0) {
      return message.slice(0, 300);
    }
  }
  return "";
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

function logUsage(payload: unknown, model: string = RIPPLE_MODEL): void {
  if (payload !== null && typeof payload === "object") {
    const usage = (payload as Record<string, unknown>).usage;
    if (usage !== null && typeof usage === "object") {
      console.log(`[meta] model=${model} usage=${JSON.stringify(usage)}`);
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
    const code = apiErrorCode(payload);
    const message = apiErrorMessage(payload);
    // Server log only. The key is in the request headers, never in the
    // payload, so logging status, code and message cannot leak it.
    console.error(
      `[meta] ${request.schemaName} failed: ${res.status} ${code}${message ? ` ${message}` : ""}`,
    );
    throw new MetaApiError(res.status, code);
  }

  logUsage(payload);
  const text = firstOutputText(payload);
  if (!text) {
    throw new Error("Meta API returned no output_text");
  }
  return resultSchema.parse(JSON.parse(text));
}
