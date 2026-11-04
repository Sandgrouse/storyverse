import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, budgetMessage, checkBudget } from "@/lib/budget";
import {
  ELEVENLABS_MODEL_ID,
  NO_VOICE_KEY_MESSAGE,
  SpeakRequestSchema,
  UNKNOWN_SPEAK_VOICE_MESSAGE,
  VOICE_ID_PATTERN,
  VOICE_LIMIT_MESSAGE,
  checkVoiceChars,
  elevenLabsSpeakUrl,
  loadPremadeVoices,
  logVoiceFailure,
  upstreamMessage,
  voiceErrorFor,
} from "@/lib/voice";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Speak one short line with ElevenLabs. Returns the mp3 as a base64
 * data URL. Only successful speeches count against the daily cap.
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
  const { voiceId, text } = parsed.data;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return errorResponse(503, "NO_VOICE_KEY", NO_VOICE_KEY_MESSAGE);
  }

  // Premade voices only: the id must be on the listed voices. Uses the
  // cached list, fetching it once when the cache is empty.
  const premade = await loadPremadeVoices(apiKey);
  if (!premade.ok) {
    return errorResponse(premade.status, "VOICE_FAILED", premade.message);
  }
  if (!premade.voices.some((voice) => voice.id === voiceId)) {
    return errorResponse(400, "UNKNOWN_VOICE", UNKNOWN_SPEAK_VOICE_MESSAGE);
  }

  const charge = await checkBudget("voice-speak", req);
  if (!charge.allowed) {
    return errorResponse(429, "BUDGET", budgetMessage(charge.scope));
  }

  const withinCap = await checkVoiceChars(text.length);
  if (!withinCap.allowed) {
    return errorResponse(429, "BUDGET", VOICE_LIMIT_MESSAGE);
  }

  let res: Response;
  try {
    res = await fetch(elevenLabsSpeakUrl(voiceId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({ text, model_id: ELEVENLABS_MODEL_ID }),
    });
  } catch (error) {
    logVoiceFailure("speak", 0, error instanceof Error ? error.message : String(error));
    return errorResponse(500, "VOICE_FAILED", voiceErrorFor(0, ""));
  }
  if (!res.ok) {
    const message = await upstreamMessage(res);
    logVoiceFailure("speak", res.status, message);
    return errorResponse(
      res.status >= 400 && res.status < 600 ? res.status : 502,
      "VOICE_FAILED",
      voiceErrorFor(res.status, message),
    );
  }
  const bytes = new Uint8Array(await res.arrayBuffer().catch(() => []));
  if (bytes.length === 0) {
    logVoiceFailure("speak", res.status, "empty audio");
    return errorResponse(502, "VOICE_FAILED", voiceErrorFor(502, ""));
  }
  return NextResponse.json({
    audioDataUrl: `data:audio/mpeg;base64,${Buffer.from(bytes).toString("base64")}`,
  });
}
