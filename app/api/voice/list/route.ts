import { NextResponse } from "next/server";
import { NO_VOICE_KEY_MESSAGE } from "@/lib/voice";
import {
  getVoiceProvider,
  hasValidOwnerCode,
  resolveVoiceProvider,
} from "@/lib/voice-provider";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Premade voices only. Cached in memory for an hour; costs nothing. */
export async function GET(req: Request) {
  const id = resolveVoiceProvider();
  const provider = getVoiceProvider();
  if (!provider) {
    return errorResponse(503, "NO_VOICE_KEY", NO_VOICE_KEY_MESSAGE);
  }
  const ownerCode = hasValidOwnerCode(req)
    ? (req.headers.get("x-voice-owner-code") ?? "")
    : undefined;
  const result = await provider.listVoices(ownerCode);
  if (!result.ok) {
    return errorResponse(result.status, "VOICE_FAILED", result.message);
  }
  return NextResponse.json({ voices: result.voices, provider: id });
}
