import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerCode } from "@/lib/voice-owner";
import { logVoiceFailure } from "@/lib/voice";
import { artistConsentText } from "@/lib/voice";
import {
  MAX_VOICE_FILE_BYTES,
  VOICE_INVITE_MISSING_MESSAGE,
  VoiceStoreError,
  appendSubmission,
  getAudio,
  listSubmissions,
  putAudio,
  readInvite,
} from "@/lib/voice-store";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function storeError(error: VoiceStoreError) {
  if (error.code === "NOT_FOUND" || error.code === "EXPIRED") {
    return errorResponse(404, "INVITE_NOT_FOUND", VOICE_INVITE_MISSING_MESSAGE);
  }
  if (error.code === "LIMIT") {
    return errorResponse(400, "CHARACTER_FILE_LIMIT", error.message);
  }
  return errorResponse(400, "VALIDATION_ERROR", error.message);
}

const consentGiven = (value: FormDataEntryValue | null): boolean =>
  value === "true" || value === "on" || value === "1";

const fileSchema = z.object({
  characterId: z.string().min(1).max(80),
  lineIndex: z.coerce.number().int().min(0).max(100),
  artistName: z.string().trim().min(1).max(80),
});

/**
 * Public: one artist recording as multipart. Fields: file, characterId,
 * lineIndex, artistName, consent (checkbox). Stores the artist's name,
 * the consent wording shown and a timestamp with the submission.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await readInvite(token);
  if (!record) {
    return errorResponse(404, "INVITE_NOT_FOUND", VOICE_INVITE_MISSING_MESSAGE);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Send one recording as a file upload.");
  }
  const parsed = fileSchema.safeParse({
    characterId: form.get("characterId"),
    lineIndex: form.get("lineIndex"),
    artistName: form.get("artistName"),
  });
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Send one recording as a file upload.");
  }
  if (!consentGiven(form.get("consent"))) {
    return errorResponse(
      400,
      "CONSENT_REQUIRED",
      "The artist's consent is required before sending recordings.",
    );
  }
  const character = record.characters.find((c) => c.id === parsed.data.characterId);
  if (!character) {
    return errorResponse(400, "VALIDATION_ERROR", "Unknown character for this invite.");
  }
  if (parsed.data.lineIndex >= character.lines.length) {
    return errorResponse(400, "VALIDATION_ERROR", "Unknown line for this character.");
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

  let stored: { fileId: string; url: string | null };
  try {
    stored = await putAudio(bytes, mime, `invite-${character.id}`);
  } catch (error) {
    if (error instanceof VoiceStoreError) return storeError(error);
    logVoiceFailure("invite-files", 500, error instanceof Error ? error.message : String(error));
    return errorResponse(500, "VOICE_FAILED", "Saving that recording failed.");
  }

  try {
    const submission = await appendSubmission(token, {
      characterId: character.id,
      lineIndex: parsed.data.lineIndex,
      artistName: parsed.data.artistName,
      consentText: artistConsentText(record.projectTitle),
      consentAt: Date.now(),
      mimeType: mime,
      size: bytes.length,
      fileId: stored.fileId,
      url: stored.url,
    });
    return NextResponse.json({ id: submission.id }, { status: 201 });
  } catch (error) {
    if (error instanceof VoiceStoreError) return storeError(error);
    logVoiceFailure("invite-files", 500, error instanceof Error ? error.message : String(error));
    return errorResponse(500, "VOICE_FAILED", "Saving that recording failed.");
  }
}

/** Owner: the submissions, with play-back audio and the consent record. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const owner = requireOwnerCode(req);
  if (!owner.ok) {
    return errorResponse(owner.status, owner.code, owner.message);
  }
  const { token } = await params;
  let submissions;
  try {
    submissions = await listSubmissions(token);
  } catch (error) {
    if (error instanceof VoiceStoreError) return storeError(error);
    return errorResponse(500, "VOICE_FAILED", "Reading those recordings failed.");
  }
  const withAudio = await Promise.all(
    submissions.map(async (submission) => {
      const audio = await getAudio(submission.fileId).catch(() => null);
      return {
        id: submission.id,
        characterId: submission.characterId,
        lineIndex: submission.lineIndex,
        artistName: submission.artistName,
        consentText: submission.consentText,
        consentAt: submission.consentAt,
        mimeType: submission.mimeType,
        size: submission.size,
        url: submission.url,
        audioDataUrl:
          audio && audio.bytes.length > 0
            ? `data:${audio.mime};base64,${Buffer.from(audio.bytes).toString("base64")}`
            : null,
      };
    }),
  );
  return NextResponse.json({ submissions: withAudio });
}
