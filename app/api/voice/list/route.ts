import { NextResponse } from "next/server";
import {
  ELEVENLABS_VOICES_URL,
  logVoiceFailure,
  mapUpstreamVoices,
  readVoiceListCache,
  upstreamMessage,
  voiceErrorFor,
  writeVoiceListCache,
  NO_VOICE_KEY_MESSAGE,
  VoiceListResponseSchema,
} from "@/lib/voice";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Premade voices only. Cached in memory for an hour; costs nothing. */
export async function GET() {
  if (!process.env.ELEVENLABS_API_KEY) {
    return errorResponse(503, "NO_VOICE_KEY", NO_VOICE_KEY_MESSAGE);
  }
  const cached = readVoiceListCache();
  if (cached) {
    return NextResponse.json({ voices: cached });
  }
  let res: Response;
  try {
    res = await fetch(ELEVENLABS_VOICES_URL, {
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
    });
  } catch (error) {
    logVoiceFailure("list", 0, error instanceof Error ? error.message : String(error));
    return errorResponse(500, "VOICE_FAILED", voiceErrorFor(0, ""));
  }
  if (!res.ok) {
    const message = await upstreamMessage(res);
    logVoiceFailure("list", res.status, message);
    return errorResponse(res.status >= 400 && res.status < 600 ? res.status : 502, "VOICE_FAILED", voiceErrorFor(res.status, message));
  }
  const mapped = mapUpstreamVoices(await res.json().catch(() => null));
  const parsed = VoiceListResponseSchema.safeParse(mapped);
  if (!parsed.success) {
    logVoiceFailure("list", res.status, "unparseable voice list");
    return errorResponse(502, "VOICE_FAILED", voiceErrorFor(502, ""));
  }
  writeVoiceListCache(parsed.data.voices);
  return NextResponse.json(parsed.data);
}
