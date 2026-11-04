import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, budgetMessage, checkBudget } from "@/lib/budget";
import {
  NO_VOICE_KEY_MESSAGE,
  SpeakRequestSchema,
  UNKNOWN_SPEAK_VOICE_MESSAGE,
  VOICE_ID_PATTERN,
  VOICE_LIMIT_MESSAGE,
  checkVoiceChars,
} from "@/lib/voice";
import { getVoiceProvider, hasValidOwnerCode } from "@/lib/voice-provider";
import { requireOwnerCode } from "@/lib/voice-owner";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function audioDataUrl(bytes: Uint8Array): string {
  return `data:audio/mpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * Speak one short line with the live voice provider. Returns the mp3 as
 * a base64 data URL. Only successful speeches count against the daily
 * cap. Premade voices speak without the owner code; anything else is a
 * custom voice and needs the code.
 */
export async function POST(req: Request) {
  const raw = await req.text().catch(() => null);
  if (raw === null) {
    return errorResponse(400, "VALIDATION_ERROR", "Write a line of up to 300 characters.");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "That request is too large.");
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Write a line of up to 300 characters.");
  }
  const parsed = SpeakRequestSchema.safeParse(body);
  if (!parsed.success) {
    const voiceId =
      body !== null && typeof body === "object"
        ? (body as Record<string, unknown>).voiceId
        : undefined;
    if (typeof voiceId !== "string" || !VOICE_ID_PATTERN.test(voiceId)) {
      return errorResponse(400, "UNKNOWN_VOICE", UNKNOWN_SPEAK_VOICE_MESSAGE);
    }
    return errorResponse(400, "VALIDATION_ERROR", "Write a line of up to 300 characters.");
  }
  const { voiceId, text, pronunciations } = parsed.data;

  const provider = getVoiceProvider();
  if (!provider) {
    return errorResponse(503, "NO_VOICE_KEY", NO_VOICE_KEY_MESSAGE);
  }

  // Premade voices speak without the owner code. Anything else is a
  // custom voice and needs the code, so a stranger can never spend the
  // owner's voice slots.
  const ownerCode = hasValidOwnerCode(req)
    ? (req.headers.get("x-voice-owner-code") ?? "")
    : undefined;
  const premade = await provider.listVoices(ownerCode);
  if (!premade.ok) {
    return errorResponse(premade.status, "VOICE_FAILED", premade.message);
  }
  if (!premade.voices.some((voice) => voice.id === voiceId)) {
    const owner = requireOwnerCode(req);
    if (!owner.ok) {
      return errorResponse(owner.status, owner.code, owner.message);
    }
  }

  const charge = await checkBudget("voice-speak", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  const withinCap = await checkVoiceChars(text.length);
  if (!withinCap.allowed) {
    return errorResponse(429, "BUDGET", VOICE_LIMIT_MESSAGE);
  }

  const spoken = await provider.speak(voiceId, text, pronunciations);
  if (!spoken.ok) {
    return errorResponse(spoken.status, "VOICE_FAILED", spoken.message);
  }
  return NextResponse.json({ audioDataUrl: audioDataUrl(spoken.audioBytes) });
}
