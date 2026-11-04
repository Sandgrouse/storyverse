import { timingSafeEqual } from "node:crypto";
import {
  CUSTOM_VOICE_LIMIT_MESSAGE,
  ELEVENLABS_ADD_VOICE_URL,
  ELEVENLABS_MODEL_ID,
  ELEVENLABS_VOICES_URL,
  FISH_CREDITS_MESSAGE,
  customVoiceErrorFor,
  elevenLabsSpeakUrl,
  logVoiceFailure,
  mapUpstreamVoices,
  readVoiceListCache,
  upstreamMessage,
  voiceErrorFor,
  writeVoiceListCache,
  type PremadeVoice,
} from "@/lib/voice";

if (typeof window !== "undefined") {
  throw new Error("lib/voice-provider.ts is server only");
}

/**
 * One small voice interface with two implementations behind it. Fish
 * Audio is the live provider; ElevenLabs stays unchanged in behaviour
 * for when a key is added. Routes call this module, never a voice
 * service directly. Schemas below were checked against
 * https://api.fish.audio/openapi.json on Nov 4, 2026.
 */

export type VoiceProviderId = "fish" | "elevenlabs" | "none";

export interface Pronunciation {
  name: string;
  sayAs: string;
}

export interface CustomVoiceFile {
  bytes: Uint8Array;
  mime: string;
  name: string;
}

export type PremadeVoicesResult =
  | { ok: true; voices: PremadeVoice[] }
  | { ok: false; status: number; message: string };

export type SpeakResult =
  | { ok: true; audioBytes: Uint8Array }
  | { ok: false; status: number; message: string };

export type CreateVoiceResult =
  | { ok: true; voiceId: string; requiresVerification: boolean }
  | { ok: false; status: number; code: string; message: string };

export interface VoiceProvider {
  id: Exclude<VoiceProviderId, "none">;
  /** Premade voices. With a valid owner code, private Fish models come first. */
  listVoices(ownerCode?: string): Promise<PremadeVoicesResult>;
  speak(
    voiceId: string,
    text: string,
    pronunciations: Pronunciation[],
  ): Promise<SpeakResult>;
  createCustomVoice(args: {
    name: string;
    description?: string;
    files: CustomVoiceFile[];
  }): Promise<CreateVoiceResult>;
}

/**
 * Choose the provider on the server: VOICE_PROVIDER when set to
 * "fish" or "elevenlabs", otherwise Fish when FISH_API_KEY is set,
 * otherwise ElevenLabs when its key is set, otherwise none.
 */
export function resolveVoiceProvider(): VoiceProviderId {
  const override = (process.env.VOICE_PROVIDER ?? "").trim().toLowerCase();
  if (override === "fish" || override === "elevenlabs") return override;
  if (process.env.FISH_API_KEY) return "fish";
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  return "none";
}

/** True when the request carries the project owner's voice code. */
export function hasValidOwnerCode(req: Request): boolean {
  const expected = process.env.VOICE_OWNER_CODE ?? "";
  if (expected.length === 0) return false;
  const given = req.headers.get("x-voice-owner-code") ?? "";
  if (given.length === 0) return false;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    try {
      timingSafeEqual(a, Buffer.alloc(a.length, 0));
    } catch {
      // Lengths always match here; ignore.
    }
    return false;
  }
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function getVoiceProvider(): VoiceProvider | null {
  const id = resolveVoiceProvider();
  if (id === "fish") return fishProvider;
  if (id === "elevenlabs") return elevenLabsProvider;
  return null;
}

// --- ElevenLabs (unchanged behaviour) -----------------------------------

const elevenLabsProvider: VoiceProvider = {
  id: "elevenlabs",

  async listVoices(): Promise<PremadeVoicesResult> {
    const apiKey = process.env.ELEVENLABS_API_KEY ?? "";
    const cached = readVoiceListCache();
    if (cached) return { ok: true, voices: cached };
    let res: Response;
    try {
      res = await fetch(ELEVENLABS_VOICES_URL, {
        headers: { "xi-api-key": apiKey },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logVoiceFailure("list", 0, message);
      return { ok: false, status: 500, message: voiceErrorFor(0, "") };
    }
    if (!res.ok) {
      const message = await upstreamMessage(res);
      logVoiceFailure("list", res.status, message);
      const status = res.status >= 400 && res.status < 600 ? res.status : 502;
      return { ok: false, status, message: voiceErrorFor(res.status, message) };
    }
    const mapped = mapUpstreamVoices(await res.json().catch(() => null));
    writeVoiceListCache(mapped.voices);
    return { ok: true, voices: mapped.voices };
  },

  async speak(
    voiceId: string,
    text: string,
    pronunciations: Pronunciation[],
  ): Promise<SpeakResult> {
    const apiKey = process.env.ELEVENLABS_API_KEY ?? "";
    const spoken = applyPronunciationsToText(text, pronunciations);
    let res: Response;
    try {
      res = await fetch(elevenLabsSpeakUrl(voiceId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({ text: spoken, model_id: ELEVENLABS_MODEL_ID }),
      });
    } catch (error) {
      logVoiceFailure(
        "speak",
        0,
        error instanceof Error ? error.message : String(error),
      );
      return { ok: false, status: 500, message: voiceErrorFor(0, "") };
    }
    if (!res.ok) {
      const message = await upstreamMessage(res);
      logVoiceFailure("speak", res.status, message);
      const status = res.status >= 400 && res.status < 600 ? res.status : 502;
      return {
        ok: false,
        status,
        message: voiceErrorFor(res.status, message),
      };
    }
    const bytes = new Uint8Array(await res.arrayBuffer().catch(() => []));
    if (bytes.length === 0) {
      logVoiceFailure("speak", res.status, "empty audio");
      return { ok: false, status: 502, message: voiceErrorFor(502, "") };
    }
    return { ok: true, audioBytes: bytes };
  },

  async createCustomVoice(args: {
    name: string;
    description?: string;
    files: CustomVoiceFile[];
  }): Promise<CreateVoiceResult> {
    const apiKey = process.env.ELEVENLABS_API_KEY ?? "";
    const form = new FormData();
    form.set("name", args.name);
    for (const file of args.files) {
      form.append(
        "files",
        new Blob([file.bytes as unknown as BlobPart], { type: file.mime }),
        file.name,
      );
    }
    form.set("remove_background_noise", "false");
    form.set(
      "description",
      args.description ?? `Storyverse custom voice for ${args.name}.`,
    );
    let res: Response;
    try {
      res = await fetch(ELEVENLABS_ADD_VOICE_URL, {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
      });
    } catch (error) {
      logVoiceFailure(
        "custom",
        0,
        error instanceof Error ? error.message : String(error),
      );
      return {
        ok: false,
        status: 500,
        code: "VOICE_FAILED",
        message: "Creating that voice failed.",
      };
    }
    if (!res.ok) {
      const message = await upstreamMessage(res);
      logVoiceFailure("custom", res.status, message);
      const mapped = customVoiceErrorFor(res.status, message);
      const code =
        mapped === CUSTOM_VOICE_LIMIT_MESSAGE ? "VOICE_LIMIT" : "VOICE_FAILED";
      const status = res.status >= 400 && res.status < 600 ? res.status : 502;
      return { ok: false, status, code, message: mapped };
    }
    const payload: unknown = await res.json().catch(() => null);
    const record =
      payload !== null && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : null;
    const voiceId = record?.voice_id;
    if (typeof voiceId !== "string" || voiceId.length === 0) {
      logVoiceFailure("custom", res.status, "unparseable voice response");
      return {
        ok: false,
        status: 502,
        code: "VOICE_FAILED",
        message: "Creating that voice failed.",
      };
    }
    const requiresVerification =
      record?.requires_verification === true ? true : false;
    return { ok: true, voiceId, requiresVerification };
  },
};

/** ElevenLabs has no pronunciation dictionary: say the names as written. */
export function applyPronunciationsToText(
  text: string,
  pronunciations: Pronunciation[],
): string {
  let out = text;
  const entries = pronunciations
    .filter((p) => p.name.trim().length > 0 && p.sayAs.trim().length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  for (const entry of entries) {
    out = out.split(entry.name).join(entry.sayAs);
  }
  return out;
}

// --- Fish Audio ------------------------------------------------------------

export const FISH_MODELS_URL = "https://api.fish.audio/model";
export const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
export const FISH_TTS_MODEL = "s2.1-pro";
export const FISH_VOICE_DESIGN_URL = "https://api.fish.audio/v1/voice-design";
export const FISH_VOICE_DESIGN_MODEL = "voice-design-1";

/**
 * Sort options the Fish list endpoint accepts
 * (openapi.json `sort_by` enum: score, task_count, created_at).
 * Anything else is dropped from the request.
 */
const FISH_SORT_BY_OPTIONS = new Set(["score", "task_count", "created_at"]);
export const FISH_SORT_BY = "score";

function fishListUrl(self: boolean): string {
  const params = new URLSearchParams({ page_size: "100", language: "en" });
  if (FISH_SORT_BY_OPTIONS.has(FISH_SORT_BY)) {
    params.set("sort_by", FISH_SORT_BY);
  }
  if (self) params.set("self", "true");
  return `${FISH_MODELS_URL}?${params.toString()}`;
}

const FishSampleSchema = {
  audio: "",
} as const;

interface FishModel {
  _id: string;
  title: string;
  tags: string[];
  state: string;
  dmcaTakenDown: boolean;
  previewUrl: string;
}

function asFishModel(value: unknown): FishModel | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record._id !== "string" || typeof record.title !== "string") {
    return null;
  }
  const tags = Array.isArray(record.tags)
    ? record.tags.filter((t): t is string => typeof t === "string")
    : [];
  const samples = Array.isArray(record.samples) ? record.samples : [];
  let previewUrl = "";
  for (const sample of samples) {
    if (
      sample !== null &&
      typeof sample === "object" &&
      typeof (sample as Record<string, unknown>).audio === "string"
    ) {
      previewUrl = (sample as Record<string, unknown>).audio as string;
      break;
    }
  }
  void FishSampleSchema;
  return {
    _id: record._id,
    title: record.title,
    tags,
    state: typeof record.state === "string" ? record.state : "",
    dmcaTakenDown: record.dmca_taken_down === true,
    previewUrl,
  };
}

/** Map the Fish list payload to `{ voices: [...] }`. Pure. */
export function mapFishVoices(payload: unknown): { voices: PremadeVoice[] } {
  const items =
    payload !== null && typeof payload === "object" && Array.isArray(
      (payload as Record<string, unknown>).items,
    )
      ? ((payload as Record<string, unknown>).items as unknown[])
      : [];
  const voices: PremadeVoice[] = [];
  for (const item of items) {
    const model = asFishModel(item);
    if (!model) continue;
    if (model.state !== "trained" || model.dmcaTakenDown) continue;
    voices.push({
      id: model._id,
      name: model.title,
      labels:
        model.tags.length > 0 ? { tags: model.tags.join(", ") } : {},
      previewUrl: model.previewUrl,
    });
  }
  return { voices };
}

// In-memory Fish list cache: public voices change rarely. One hour.
const FISH_LIST_TTL_MS = 60 * 60 * 1000;

let fishCachedAt = 0;
let fishCachedVoices: PremadeVoice[] | null = null;
let fishSelfCachedAt = 0;
let fishSelfCachedVoices: PremadeVoice[] | null = null;

/** Test-only reset of the Fish voice list cache. */
export function __resetFishVoiceListCache(): void {
  fishCachedAt = 0;
  fishCachedVoices = null;
  fishSelfCachedAt = 0;
  fishSelfCachedVoices = null;
}

async function fetchFishModels(
  apiKey: string,
  self: boolean,
  route: string,
): Promise<PremadeVoice[] | null> {
  let res: Response;
  try {
    res = await fetch(fishListUrl(self), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (error) {
    logVoiceFailure(
      route,
      0,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
  if (!res.ok) {
    const message = await upstreamMessage(res);
    logVoiceFailure(route, res.status, message);
    return null;
  }
  return mapFishVoices(await res.json().catch(() => null)).voices;
}

function mergeFishVoices(
  voices: PremadeVoice[],
  selfVoices: PremadeVoice[],
): PremadeVoice[] {
  const seen = new Set(selfVoices.map((v) => v.id));
  return [...selfVoices, ...voices.filter((v) => !seen.has(v.id))];
}

/**
 * Build the Fish `pronunciation_dictionary` payload from the world's
 * "how names are said" list. Checked against openapi.json
 * `PronunciationItem`: key 1-256 chars, value 1-1024 chars, without the
 * `<|phoneme_start|>` / `<|phoneme_end|>` markers the engine adds
 * itself. Returns undefined when nothing valid remains.
 */
export function fishPronunciationDictionary(
  pronunciations: Pronunciation[],
): Array<{ items: Array<{ key: string; value: string }> }> | undefined {
  const items: Array<{ key: string; value: string }> = [];
  for (const entry of pronunciations) {
    const key = entry.name.trim();
    const value = entry.sayAs.trim();
    if (key.length === 0 || key.length > 256) continue;
    if (value.length === 0 || value.length > 1024) continue;
    if (key.includes("<|phoneme_start|>") || key.includes("<|phoneme_end|>")) {
      continue;
    }
    if (
      value.includes("<|phoneme_start|>") ||
      value.includes("<|phoneme_end|>")
    ) {
      continue;
    }
    if (items.some((item) => item.key === key)) continue;
    items.push({ key, value });
  }
  if (items.length === 0) return undefined;
  return [{ items }];
}

/** Calm message for Fish custom-voice failures. */
export function fishCustomVoiceErrorFor(
  status: number,
  message: string,
): string {
  if (status === 402 || /credit|balance|payment|billing|quota/i.test(message)) {
    return FISH_CREDITS_MESSAGE;
  }
  if (
    /10\s*second|too short|short|duration|minimum/i.test(message) ||
    status === 400
  ) {
    return "Those recordings are too short. Each sample needs to be at least 10 seconds long.";
  }
  return "Creating that voice failed.";
}

const fishProvider: VoiceProvider = {
  id: "fish",

  async listVoices(ownerCode?: string): Promise<PremadeVoicesResult> {
    const apiKey = process.env.FISH_API_KEY ?? "";
    const now = Date.now();
    const hasOwnerCode =
      !!ownerCode &&
      !!process.env.VOICE_OWNER_CODE &&
      ownerCode === process.env.VOICE_OWNER_CODE;
    if (!fishCachedVoices || now - fishCachedAt > FISH_LIST_TTL_MS) {
      const voices = await fetchFishModels(apiKey, false, "list");
      if (!voices) {
        return { ok: false, status: 502, message: voiceErrorFor(502, "") };
      }
      fishCachedVoices = voices;
      fishCachedAt = now;
    }
    let voices = fishCachedVoices;
    if (hasOwnerCode) {
      if (
        !fishSelfCachedVoices ||
        now - fishSelfCachedAt > FISH_LIST_TTL_MS
      ) {
        const selfVoices = await fetchFishModels(apiKey, true, "list");
        if (selfVoices) {
          fishSelfCachedVoices = selfVoices;
          fishSelfCachedAt = now;
        }
      }
      if (fishSelfCachedVoices) {
        voices = mergeFishVoices(voices, fishSelfCachedVoices);
      }
    }
    return { ok: true, voices };
  },

  async speak(
    voiceId: string,
    text: string,
    pronunciations: Pronunciation[],
  ): Promise<SpeakResult> {
    const apiKey = process.env.FISH_API_KEY ?? "";
    const body: Record<string, unknown> = {
      text,
      reference_id: voiceId,
      format: "mp3",
      mp3_bitrate: 128,
      normalize: true,
      latency: "normal",
    };
    const dictionary = fishPronunciationDictionary(pronunciations);
    if (dictionary) body.pronunciation_dictionary = dictionary;
    let res: Response;
    try {
      res = await fetch(FISH_TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          model: FISH_TTS_MODEL,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      logVoiceFailure(
        "speak",
        0,
        error instanceof Error ? error.message : String(error),
      );
      return { ok: false, status: 500, message: voiceErrorFor(0, "") };
    }
    if (!res.ok) {
      const message = await upstreamMessage(res);
      logVoiceFailure("speak", res.status, message);
      if (res.status === 402) {
        return { ok: false, status: 402, message: FISH_CREDITS_MESSAGE };
      }
      const status = res.status >= 400 && res.status < 600 ? res.status : 502;
      return {
        ok: false,
        status,
        message: voiceErrorFor(res.status, message),
      };
    }
    const bytes = new Uint8Array(await res.arrayBuffer().catch(() => []));
    if (bytes.length === 0) {
      logVoiceFailure("speak", res.status, "empty audio");
      return { ok: false, status: 502, message: voiceErrorFor(502, "") };
    }
    return { ok: true, audioBytes: bytes };
  },

  async createCustomVoice(args: {
    name: string;
    description?: string;
    files: CustomVoiceFile[];
  }): Promise<CreateVoiceResult> {
    const apiKey = process.env.FISH_API_KEY ?? "";
    const form = new FormData();
    form.set("type", "tts");
    form.set("title", args.name);
    form.set(
      "description",
      args.description ?? `Storyverse custom voice for ${args.name}.`,
    );
    form.set("visibility", "private");
    form.set("train_mode", "fast");
    for (const file of args.files) {
      form.append(
        "voices",
        new Blob([file.bytes as unknown as BlobPart], { type: file.mime }),
        file.name,
      );
    }
    let res: Response;
    try {
      res = await fetch(FISH_MODELS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
    } catch (error) {
      logVoiceFailure(
        "custom",
        0,
        error instanceof Error ? error.message : String(error),
      );
      return {
        ok: false,
        status: 500,
        code: "VOICE_FAILED",
        message: "Creating that voice failed.",
      };
    }
    if (!res.ok) {
      const message = await upstreamMessage(res);
      logVoiceFailure("custom", res.status, message);
      const status = res.status >= 400 && res.status < 600 ? res.status : 502;
      return {
        ok: false,
        status,
        code: "VOICE_FAILED",
        message: fishCustomVoiceErrorFor(res.status, message),
      };
    }
    const payload: unknown = await res.json().catch(() => null);
    const record =
      payload !== null && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : null;
    const id = record?._id;
    if (typeof id !== "string" || id.length === 0) {
      logVoiceFailure("custom", res.status, "unparseable voice response");
      return {
        ok: false,
        status: 502,
        code: "VOICE_FAILED",
        message: "Creating that voice failed.",
      };
    }
    return { ok: true, voiceId: id, requiresVerification: false };
  },
};

// --- Fish voice design (Fish only) -------------------------------------------

export interface VoiceDesignCandidate {
  id: string;
  audioDataUrl: string;
}

export type VoiceDesignResult =
  | { ok: true; candidates: VoiceDesignCandidate[] }
  | { ok: false; status: number; message: string };

/**
 * Generate candidate voices from a description. The schema
 * (`VoiceDesignCandidate`) carries base64 audio with no format field;
 * like the TTS endpoint it is labelled mp3.
 */
export async function designFishVoice(args: {
  instruction: string;
  referenceText: string;
}): Promise<VoiceDesignResult> {
  const apiKey = process.env.FISH_API_KEY ?? "";
  let res: Response;
  try {
    res = await fetch(FISH_VOICE_DESIGN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        model: FISH_VOICE_DESIGN_MODEL,
      },
      body: JSON.stringify({
        instruction: args.instruction,
        reference_text: args.referenceText,
        language: "en",
        n: 3,
      }),
    });
  } catch (error) {
    logVoiceFailure(
      "design",
      0,
      error instanceof Error ? error.message : String(error),
    );
    return { ok: false, status: 500, message: voiceErrorFor(0, "") };
  }
  if (!res.ok) {
    const message = await upstreamMessage(res);
    logVoiceFailure("design", res.status, message);
    if (res.status === 402) {
      return { ok: false, status: 402, message: FISH_CREDITS_MESSAGE };
    }
    const status = res.status >= 400 && res.status < 600 ? res.status : 502;
    return {
      ok: false,
      status,
      message: voiceErrorFor(res.status, message),
    };
  }
  const payload: unknown = await res.json().catch(() => null);
  const record =
    payload !== null && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  const raw = Array.isArray(record?.candidates) ? record?.candidates : [];
  const candidates: VoiceDesignCandidate[] = [];
  for (const entry of raw as unknown[]) {
    if (entry === null || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.audio_base64 !== "string" ||
      candidate.audio_base64.length === 0
    ) {
      continue;
    }
    candidates.push({
      id: candidate.id,
      audioDataUrl: `data:audio/mpeg;base64,${candidate.audio_base64}`,
    });
  }
  if (candidates.length === 0) {
    logVoiceFailure("design", res.status, "no voice candidates");
    return { ok: false, status: 502, message: voiceErrorFor(502, "") };
  }
  return { ok: true, candidates };
}
