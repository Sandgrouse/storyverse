import { NextResponse } from "next/server";
import { budgetMessage, checkBudget } from "@/lib/budget";
import {
  ContentPolicyBlockedError,
  MetaApiError,
  completeJson,
  generateImage,
} from "@/lib/meta/client";
import {
  BLOCKED_MESSAGE,
  NO_KEY_MESSAGE,
  REWRITE_INSTRUCTIONS,
  REWRITE_JSON_SCHEMA,
  REWRITE_SCHEMA_NAME,
  RewriteModelOutputSchema,
  SceneArtRequestSchema,
  fitsRequestLimit,
  pickSceneReferences,
  scenePrompt,
} from "@/lib/art";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * One scene image in landscape. At most three reference images travel
 * with the request. A ripple proposal arrives as change and is added to
 * the prompt. A blocked prompt is rewritten once; a second block
 * returns 422 with the rewritten description for the creator to edit
 * and retry.
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
  const parsed = SceneArtRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { part }.");
  }
  const { part, characters, styleImage, change } = parsed.data;
  let { description } = parsed.data;
  const references = pickSceneReferences(parsed.data.references);
  if (references.length === 0 && styleImage) references.push(styleImage);

  if (!process.env.MODEL_API_KEY) {
    return errorResponse(503, "NO_API_KEY", NO_KEY_MESSAGE);
  }

  const charge = await checkBudget("scene", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  const attempt = (text: string | undefined) =>
    generateImage({
      prompt: scenePrompt({
        part,
        characters,
        referenceCount: references.length,
        change,
        description: text,
      }),
      referenceImages: references,
      size: "1536x1024",
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
        return errorResponse(status, error.code, "The scene art failed.");
      }
      return errorResponse(500, "SCENE_ART_FAILED", "The scene art failed.");
    }
  }

  try {
    const rewrite = await completeJson(
      {
        instructions: REWRITE_INSTRUCTIONS,
        input: scenePrompt({
          part,
          characters,
          referenceCount: references.length,
          change,
          description,
        }),
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
      return errorResponse(status, error.code, "The scene art failed.");
    }
    return errorResponse(500, "SCENE_ART_FAILED", "The scene art failed.");
  }
}
