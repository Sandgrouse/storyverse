import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_BODY_BYTES } from "@/lib/budget";
import {
  CUSTOM_VOICE_LIMIT_MESSAGE,
  CustomRequestSchema,
  ELEVENLABS_ADD_VOICE_URL,
  NO_VOICE_KEY_MESSAGE,
  OWNER_CONSENT_TEXT,
  customVoiceErrorFor,
  logVoiceFailure,
  upstreamMessage,
} from "@/lib/voice";
import { requireOwnerCode } from "@/lib/voice-owner";
import { VoiceStoreError, getSample } from "@/lib/voice-store";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const AddVoiceResponseSchema = z.object({
  voice_id: z.string().min(1),
  requires_verification: z.boolean().optional(),
});

/**
 * Owner: create a custom ElevenLabs voice from stored samples. Reads the
 * sample files and calls POST https://api.elevenlabs.io/v1/voices/add
 * as multipart, with name, files, remove_background_noise false and a
 * description. Consent is required: the checkbox must be ticked.
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

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
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

  const form = new FormData();
  form.set("name", characterName);
  for (const file of files) {
    form.append("files", new Blob([file.bytes as unknown as BlobPart], { type: file.mime }), file.name);
  }
  form.set("remove_background_noise", "false");
  form.set("description", `Storyverse custom voice for ${characterName}.`);

  let res: Response;
  try {
    res = await fetch(ELEVENLABS_ADD_VOICE_URL, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });
  } catch (error) {
    logVoiceFailure("custom", 0, error instanceof Error ? error.message : String(error));
    return errorResponse(500, "VOICE_FAILED", "Creating that voice failed.");
  }
  if (!res.ok) {
    const message = await upstreamMessage(res);
    logVoiceFailure("custom", res.status, message);
    const mapped = customVoiceErrorFor(res.status, message);
    const code = mapped === CUSTOM_VOICE_LIMIT_MESSAGE ? "VOICE_LIMIT" : "VOICE_FAILED";
    const status = res.status >= 400 && res.status < 600 ? res.status : 502;
    return errorResponse(status, code, mapped);
  }
  const payload: unknown = await res.json().catch(() => null);
  const voice = AddVoiceResponseSchema.safeParse(payload);
  if (!voice.success) {
    logVoiceFailure("custom", res.status, "unparseable voice response");
    return errorResponse(502, "VOICE_FAILED", "Creating that voice failed.");
  }
  return NextResponse.json({
    voiceId: voice.data.voice_id,
    requiresVerification: voice.data.requires_verification ?? false,
  });
}
