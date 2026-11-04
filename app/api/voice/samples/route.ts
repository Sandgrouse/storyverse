import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_BODY_BYTES } from "@/lib/budget";
import { logVoiceFailure } from "@/lib/voice";
import { requireOwnerCode } from "@/lib/voice-owner";
import {
  MAX_VOICE_FILE_BYTES,
  VoiceStoreError,
  deleteSamples,
  putSample,
} from "@/lib/voice-store";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Owner: store one recording or upload under a per-character prefix.
 * Multipart with file and characterId. Returns a sample id for
 * POST /api/voice/custom.
 */
export async function POST(req: Request) {
  const owner = requireOwnerCode(req);
  if (!owner.ok) {
    return errorResponse(owner.status, owner.code, owner.message);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Send one recording as a file upload.");
  }
  const characterId = form.get("characterId");
  if (typeof characterId !== "string" || characterId.length < 1 || characterId.length > 80) {
    return errorResponse(400, "VALIDATION_ERROR", "Send one recording as a file upload.");
  }
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size <= 0) {
    return errorResponse(400, "VALIDATION_ERROR", "Attach one audio recording.");
  }
  if (file.size > MAX_VOICE_FILE_BYTES) {
    return errorResponse(413, "FILE_TOO_LARGE", "That recording is too large. Keep each file under 4MB.");
  }
  const mime = file.type || "audio/mpeg";
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "That recording could not be read.");
  }
  try {
    const sampleId = await putSample(characterId, bytes, mime);
    return NextResponse.json({ sampleId }, { status: 201 });
  } catch (error) {
    if (error instanceof VoiceStoreError) {
      return errorResponse(400, "VALIDATION_ERROR", error.message);
    }
    logVoiceFailure("samples", 500, error instanceof Error ? error.message : String(error));
    return errorResponse(500, "VOICE_FAILED", "Saving that recording failed.");
  }
}

const DeleteSamplesSchema = z.object({
  sampleIds: z.array(z.string().min(1).max(120)).min(1).max(24),
});

/**
 * Owner: delete source recordings after a voice is created. The drawer
 * offers this once ElevenLabs has the voice.
 */
export async function DELETE(req: Request) {
  const owner = requireOwnerCode(req);
  if (!owner.ok) {
    return errorResponse(owner.status, owner.code, owner.message);
  }
  const raw = await req.text().catch(() => null);
  if (raw === null || Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { sampleIds }.");
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { sampleIds }.");
  }
  const parsed = DeleteSamplesSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { sampleIds }.");
  }
  await deleteSamples(parsed.data.sampleIds).catch(() => {});
  return NextResponse.json({ deleted: true });
}
