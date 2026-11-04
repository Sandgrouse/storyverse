import { NextResponse } from "next/server";
import { MAX_BODY_BYTES } from "@/lib/budget";
import {
  CustomRequestSchema,
  NO_VOICE_KEY_MESSAGE,
  OWNER_CONSENT_TEXT,
} from "@/lib/voice";
import { getVoiceProvider } from "@/lib/voice-provider";
import { requireOwnerCode } from "@/lib/voice-owner";
import { VoiceStoreError, getSample } from "@/lib/voice-store";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Owner: create a custom voice from stored samples through the live
 * voice provider. Consent is required: the checkbox must be ticked.
 */
export async function POST(req: Request) {
  const owner = requireOwnerCode(req);
  if (!owner.ok) {
    return errorResponse(owner.status, owner.code, owner.message);
  }

  const raw = await req.text().catch(() => null);
  if (raw === null) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { characterName, sampleIds, consent }.");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "That request is too large.");
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { characterName, sampleIds, consent }.");
  }
  const parsed = CustomRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    if (issues.some((issue) => String(issue.path[0]) === "consent")) {
      return errorResponse(400, "CONSENT_REQUIRED", OWNER_CONSENT_TEXT);
    }
    return errorResponse(400, "VALIDATION_ERROR", "Expected { characterName, sampleIds, consent }.");
  }
  const { characterName, sampleIds } = parsed.data;

  const provider = getVoiceProvider();
  if (!provider) {
    return errorResponse(503, "NO_VOICE_KEY", NO_VOICE_KEY_MESSAGE);
  }

  const files: Array<{ bytes: Uint8Array; mime: string; name: string }> = [];
  for (const sampleId of sampleIds) {
    let audio: { bytes: Uint8Array; mime: string } | null = null;
    try {
      audio = await getSample(sampleId);
    } catch (error) {
      if (error instanceof VoiceStoreError) {
        return errorResponse(400, "VALIDATION_ERROR", error.message);
      }
      throw error;
    }
    if (!audio) {
      return errorResponse(400, "VALIDATION_ERROR", "One of those recordings is missing.");
    }
    const ext = sampleId.split(".").pop() ?? "mp3";
    files.push({ bytes: audio.bytes, mime: audio.mime, name: `sample-${files.length}.${ext}` });
  }

  const created = await provider.createCustomVoice({
    name: characterName,
    files,
  });
  if (!created.ok) {
    return errorResponse(created.status, created.code, created.message);
  }
  return NextResponse.json({
    voiceId: created.voiceId,
    requiresVerification: created.requiresVerification,
  });
}
