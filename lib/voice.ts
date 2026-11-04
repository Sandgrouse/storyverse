import { z } from "zod";
import { stripImageData } from "@/lib/story";
import { WorldSchema, type World } from "@/lib/world/schemas";

/**
 * Character voices, spoken by ElevenLabs. Meta has no text-to-speech
 * model, so Muse Spark chooses the voice and writes the line, and
 * ElevenLabs speaks it. Pure shapes and small server helpers live here;
 * the API key is only ever touched inside the route handlers.
 */

export const ELEVENLABS_VOICES_URL =
  "https://api.elevenlabs.io/v2/voices?category=premade&page_size=100";

export function elevenLabsSpeakUrl(voiceId: string): string {
  return `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
}

/** Server-side voice id shape: plain ids only, never paths. */
export const VOICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Calm message when the speak voice isn't one of the listed premade voices. */
export const UNKNOWN_SPEAK_VOICE_MESSAGE = "Choose one of the listed voices."

export const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";

/** A premade voice as the drawer sees it. */
export const PremadeVoiceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  labels: z.record(z.string(), z.string()).default({}),
  previewUrl: z.string().default(""),
});

export type PremadeVoice = z.infer<typeof PremadeVoiceSchema>;

export const VoiceListResponseSchema = z.object({
  voices: z.array(PremadeVoiceSchema),
});

/** Upstream ElevenLabs voice, mapped down to what the drawer needs. */
const UpstreamVoiceSchema = z.object({
  voice_id: z.string().min(1),
  name: z.string().min(1),
  labels: z.record(z.string(), z.unknown()).optional(),
  preview_url: z.string().optional(),
});

const UpstreamVoicesSchema = z.object({
  voices: z.array(UpstreamVoiceSchema).default([]),
});

function labelStrings(labels: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!labels) return out;
  for (const [key, value] of Object.entries(labels)) {
    if (typeof value === "string" && value.length > 0) out[key] = value;
  }
  return out;
}

/** Map the ElevenLabs list payload to `{ voices: [...] }`. Pure. */
export function mapUpstreamVoices(payload: unknown): { voices: PremadeVoice[] } {
  const parsed = UpstreamVoicesSchema.safeParse(payload);
  const upstream = parsed.success ? parsed.data.voices : [];
  return {
    voices: upstream.map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      labels: labelStrings(voice.labels),
      previewUrl: voice.preview_url ?? "",
    })),
  };
}

// In-memory list cache: premade voices change rarely. One hour.
const LIST_TTL_MS = 60 * 60 * 1000;

let cachedAt = 0;
let cachedVoices: PremadeVoice[] | null = null;

/** Test-only reset of the voice list cache. */
export function __resetVoiceListCache(): void {
  cachedAt = 0;
  cachedVoices = null;
}

export function readVoiceListCache(now: number = Date.now()): PremadeVoice[] | null {
  if (!cachedVoices || now - cachedAt > LIST_TTL_MS) return null;
  return cachedVoices;
}

export function writeVoiceListCache(voices: PremadeVoice[], now: number = Date.now()): void {
  cachedVoices = voices;
  cachedAt = now;
}

export type PremadeVoicesResult =
  | { ok: true; voices: PremadeVoice[] }
  | { ok: false; status: number; message: string };

/**
 * Premade voices for server-side allowlist checks. Uses the cached list
 * when fresh, otherwise fetches the upstream list once and caches it.
 * Only the speak route needs this; the list route serves the cache itself.
 */
export async function loadPremadeVoices(apiKey: string): Promise<PremadeVoicesResult> {
  const cached = readVoiceListCache();
  if (cached) return { ok: true, voices: cached };
  let res: Response;
  try {
    res = await fetch(ELEVENLABS_VOICES_URL, {
      headers: { "xi-api-key": apiKey },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logVoiceFailure("speak", 0, message);
    return { ok: false, status: 500, message: voiceErrorFor(0, "") };
  }
  if (!res.ok) {
    const message = await upstreamMessage(res);
    logVoiceFailure("speak", res.status, message);
    const status = res.status >= 400 && res.status < 600 ? res.status : 502;
    return { ok: false, status, message: voiceErrorFor(res.status, message) };
  }
  const mapped = mapUpstreamVoices(await res.json().catch(() => null));
  const parsed = VoiceListResponseSchema.safeParse(mapped);
  if (!parsed.success) {
    logVoiceFailure("speak", res.status, "unparseable voice list");
    return { ok: false, status: 502, message: voiceErrorFor(502, "") };
  }
  writeVoiceListCache(parsed.data.voices);
  return { ok: true, voices: parsed.data.voices };
}

/** One "how names are said" entry: the story keeps the name, audio says sayAs. */
export const PronunciationSchema = z.object({
  name: z.string().min(1).max(120),
  sayAs: z.string().min(1).max(120),
});

export type Pronunciation = z.infer<typeof PronunciationSchema>;

/** A voice the suggest route may pick from: no preview needed to choose. */
export const SuggestVoiceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  labels: z.record(z.string(), z.string()).default({}),
});

export const SuggestRequestSchema = z.object({
  world: WorldSchema,
  characterId: z.string().min(1),
  voices: z.array(SuggestVoiceSchema).min(1),
});

export type SuggestRequest = z.infer<typeof SuggestRequestSchema>;

export const SpeakRequestSchema = z.object({
  voiceId: z.string().regex(VOICE_ID_PATTERN),
  text: z.string().min(1).max(300),
  pronunciations: z.array(PronunciationSchema).max(50).default([]),
});

export type SpeakRequest = z.infer<typeof SpeakRequestSchema>;

/** What Muse Spark returns: the pick, why, and a line in character. */
export const SuggestModelOutputSchema = z.object({
  voiceId: z.string().min(1),
  reason: z.string().min(1).max(200),
  line: z.string().min(1).max(160),
});

export type SuggestModelOutput = z.infer<typeof SuggestModelOutputSchema>;

export const SUGGEST_INSTRUCTIONS =
  "You match a story character to a narrator's voice and write one line they would say. " +
  "Use only the character's canon: the line must sound like them and fit what they know. " +
  "Keep the reason to one short line and the spoken line to 160 characters or fewer. " +
  "Never rename anyone or change an established detail.";

export const SUGGEST_SCHEMA_NAME = "voice_suggest";

export const SUGGEST_JSON_SCHEMA = {
  type: "object",
  properties: {
    voiceId: { type: "string" },
    reason: { type: "string" },
    line: { type: "string" },
  },
  required: ["voiceId", "reason", "line"],
  additionalProperties: false,
} as const;

/** Server log only: status plus a short upstream message, never key/audio. */
export function logVoiceFailure(route: string, status: number, message: string): void {
  console.error(`[voice] ${route} failed: ${status} ${message.slice(0, 200)}`);
}

export const NO_VOICE_KEY_MESSAGE = "Voices aren't set up here yet.";

/** Fish Audio has run out of credits. */
export const FISH_CREDITS_MESSAGE = "Your voice credits have run out.";

/** Owner record/upload consent, shown beside the checkbox. */
export const OWNER_CONSENT_TEXT =
  "I have the right and the speaker's consent to create an AI voice from this audio.";

/** Artist consent wording, with the project title filled in. */
export function artistConsentText(projectTitle: string): string {
  return (
    "I'm the person speaking, and I agree that the owner of " +
    `${projectTitle} may create an AI voice from these recordings ` +
    "for the characters listed here."
  );
}

/** Secrets must never reach a reading-lines prompt. */
export function secretTextsFor(world: World, characterId: string): string[] {
  const texts: string[] = [];
  for (const secret of world.secrets) {
    if (secret.text.trim()) texts.push(secret.text);
    if (secret.note.trim()) texts.push(secret.note);
  }
  for (const channel of world.channels) {
    if (channel.secret.trim()) texts.push(channel.secret);
  }
  const character = world.characters.find((c) => c.id === characterId);
  if (character?.secret?.trim()) texts.push(character.secret);
  return texts;
}

/** Redact every known secret string so none reaches the model. */
export function redactSecrets(text: string, secretTexts: string[]): string {
  let out = text;
  for (const secret of secretTexts) {
    const needle = secret.trim();
    if (needle.length === 0) continue;
    out = out.split(needle).join("[redacted]");
  }
  return out;
}

/**
 * Material for the reading-lines prompt: the character's canon plus
 * story text, with images stripped and every secret redacted.
 */
export function buildVoiceLinesPrompt(world: World, characterId: string): string {
  const secrets = secretTextsFor(world, characterId);
  const clean = stripImageData(world);
  const character = clean.characters.find((c) => c.id === characterId);
  const canon = redactSecrets(character?.canon ?? "", secrets);
  const material = [
    ...clean.parts.map((p) => `${p.title}: ${p.summary} ${p.excerpt}`),
    ...clean.beats
      .filter((b) => b.characterIds.includes(characterId))
      .map((b) => `${b.title}: ${b.content}`),
    ...clean.channels.map((c) => `${c.name}: ${c.pitch} ${c.tagline}`),
  ]
    .map((text) => redactSecrets(text, secrets))
    .filter((text) => text.replace(/\[redacted\]/g, "").trim().length > 0)
    .slice(0, 40)
    .join("\n");
  return (
    `Character: ${character?.name ?? "Unknown"}. Canon: ${canon}\n\n` +
    `Story material:\n${material}`
  );
}

export const LinesRequestSchema = z.object({
  world: WorldSchema,
  characterId: z.string().min(1),
});

export type LinesRequest = z.infer<typeof LinesRequestSchema>;

export const LinesModelOutputSchema = z.object({
  lines: z.array(z.string().min(1).max(200)).min(8).max(12),
});

export type LinesModelOutput = z.infer<typeof LinesModelOutputSchema>;

export const LINES_INSTRUCTIONS =
  "Write 8 to 12 short lines this story character would say, taken " +
  "from or true to the story material. Together they take about 90 " +
  "seconds to read aloud. Vary the emotion: joy, fear, anger, wonder, " +
  "sorrow. Each line is one breath, at most 200 characters. Never " +
  "mention or hint at anything marked [redacted].";

export const LINES_SCHEMA_NAME = "voice_lines";

export const LINES_JSON_SCHEMA = {
  type: "object",
  properties: {
    lines: { type: "array", items: { type: "string" }, minItems: 8, maxItems: 12 },
  },
  required: ["lines"],
  additionalProperties: false,
} as const;

export const ELEVENLABS_ADD_VOICE_URL = "https://api.elevenlabs.io/v1/voices/add";

export const CUSTOM_VOICE_LIMIT_MESSAGE =
  "Your ElevenLabs plan can't add another custom voice. Check your plan or remove a voice there.";

function isVoiceLimitMessage(message: string): boolean {
  return /voice.{0,20}limit|limit.{0,20}voice|maximum.{0,20}voice|too many voices|quota|plan/i.test(
    message,
  );
}

/**
 * Map an ElevenLabs voice-add failure. Plan and voice-limit errors get
 * the actionable plan message; anything else stays calm and generic.
 */
export function customVoiceErrorFor(status: number, message: string): string {
  if (status === 422 || status === 402 || status === 429 || isVoiceLimitMessage(message)) {
    return CUSTOM_VOICE_LIMIT_MESSAGE;
  }
  return voiceErrorFor(status, message);
}

export const CustomRequestSchema = z.object({
  characterName: z.string().min(1).max(80),
  sampleIds: z.array(z.string().min(1).max(120)).min(1).max(12),
  consent: z.literal(true),
});

export type CustomRequest = z.infer<typeof CustomRequestSchema>;

/** Calm message for 401s, quota errors and other ElevenLabs failures. */
export const VOICE_UNAVAILABLE_MESSAGE = "The voice service isn't available right now.";

export const VOICE_FAILED_MESSAGE = "The voice failed.";

function isQuotaMessage(message: string): boolean {
  return /quota|insufficient|credits?|limit|payment|billing/i.test(message);
}

/**
 * Map an ElevenLabs failure to a calm drawer message. 401s and quota
 * errors share one message; anything else gets a plain failure message.
 */
export function voiceErrorFor(status: number, message: string): string {
  if (status === 401 || status === 402 || status === 429 || isQuotaMessage(message)) {
    return VOICE_UNAVAILABLE_MESSAGE;
  }
  return VOICE_FAILED_MESSAGE;
}

/** Short upstream message for the server log. */
export async function upstreamMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (text.length === 0) return "empty response";
    try {
      const json: unknown = JSON.parse(text);
      if (json !== null && typeof json === "object") {
        const record = json as Record<string, unknown>;
        const detail = record.detail;
        if (typeof detail === "string" && detail.length > 0) return detail;
        const message = record.message;
        if (typeof message === "string" && message.length > 0) return message;
      }
    } catch {
      // Not JSON; fall through to the raw text.
    }
    return text;
  } catch {
    return "unreadable response";
  }
}

// Separate daily cap on ElevenLabs usage, in spoken characters. Same
// storage approach as lib/budget.ts: a small JSON file in Blob, read
// before each charge and written after, with an in-memory count where
// the higher total wins. A storage failure never blocks by itself.

export const VOICE_LIMIT_MESSAGE = "Today's voice limit is used up.";

export function voiceDailyChars(): number {
  const raw = Number(process.env.VOICE_DAILY_CHARS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5000;
}

export function voiceDayKeyUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export const DesignRequestSchema = z.object({
  world: WorldSchema,
  characterId: z.string().min(1),
});

export type DesignRequest = z.infer<typeof DesignRequestSchema>;

/** What Muse Spark returns: a voice description and a short test line. */
export const DesignModelOutputSchema = z.object({
  description: z.string().min(1).max(300),
  testLine: z.string().min(1).max(150),
});

export type DesignModelOutput = z.infer<typeof DesignModelOutputSchema>;

export const DESIGN_INSTRUCTIONS =
  "You invent a voice for a story character from their canon: describe " +
  "how the voice sounds in at most 300 characters, and write one short " +
  "line they would say, in character, of at most 150 characters, to test " +
  "the voice. Never rename anyone, change an established detail, or " +
  "mention or hint at anything marked [redacted].";

export const DESIGN_SCHEMA_NAME = "voice_design";

export const DESIGN_JSON_SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string" },
    testLine: { type: "string" },
  },
  required: ["description", "testLine"],
  additionalProperties: false,
} as const;

/**
 * Material for the voice-design prompt: the character's canon plus
 * story text, with images stripped and every secret redacted.
 */
export function buildVoiceDesignPrompt(
  world: World,
  characterId: string,
): string {
  const secrets = secretTextsFor(world, characterId);
  const clean = stripImageData(world);
  const character = clean.characters.find((c) => c.id === characterId);
  const canon = redactSecrets(character?.canon ?? "", secrets);
  const material = [
    ...clean.parts.map((p) => `${p.title}: ${p.summary} ${p.excerpt}`),
    ...clean.beats
      .filter((b) => b.characterIds.includes(characterId))
      .map((b) => `${b.title}: ${b.content}`),
    ...clean.channels.map((c) => `${c.name}: ${c.pitch} ${c.tagline}`),
  ]
    .map((text) => redactSecrets(text, secrets))
    .filter((text) => text.replace(/\[redacted\]/g, "").trim().length > 0)
    .slice(0, 20)
    .join("\n");
  return (
    `Character: ${character?.name ?? "Unknown"}. Canon: ${canon}\n\n` +
    `Story material:\n${material}`
  );
}

type VoiceBlobState = { day: string; chars: number };

function voiceBlobPath(day: string): string {
  return `storyverse-voice/${day}.json`;
}

let voiceMemDay = "";
let voiceMemChars = 0;

/** Test-only reset of the in-memory voice count. */
export function __resetVoiceMemory(): void {
  voiceMemDay = "";
  voiceMemChars = 0;
}

async function readVoiceBlob(day: string): Promise<VoiceBlobState | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const { list } = await import("@vercel/blob");
    const found = await list({ prefix: voiceBlobPath(day), token });
    const match = found.blobs.find((b) => b.pathname === voiceBlobPath(day)) ?? found.blobs[0];
    if (!match) return null;
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (json === null || typeof json !== "object") return null;
    const record = json as Record<string, unknown>;
    if (record.day !== day) return null;
    const chars = typeof record.chars === "number" && record.chars >= 0 ? record.chars : 0;
    return { day, chars };
  } catch {
    return null;
  }
}

async function writeVoiceBlob(state: VoiceBlobState): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return;
  try {
    const { put } = await import("@vercel/blob");
    await put(voiceBlobPath(state.day), JSON.stringify(state), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token,
    });
  } catch {
    // A storage failure must never block a request by itself.
  }
}

/**
 * Charge spoken characters against the daily voice cap. Reads Blob
 * before the charge and writes after; failures fall back to memory.
 */
export async function checkVoiceChars(chars: number): Promise<{ allowed: boolean }> {
  const day = voiceDayKeyUTC();
  if (voiceMemDay !== day) {
    voiceMemDay = day;
    voiceMemChars = 0;
  }
  const stored = await readVoiceBlob(day);
  const total = Math.max(voiceMemChars, stored?.chars ?? 0);
  if (total + chars > voiceDailyChars()) {
    return { allowed: false };
  }
  const next: VoiceBlobState = { day, chars: total + chars };
  voiceMemChars = next.chars;
  await writeVoiceBlob(next);
  return { allowed: true };
}
