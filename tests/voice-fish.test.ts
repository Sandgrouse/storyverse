import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorldSchema, type World } from "@/lib/world/schemas";
import seed from "@/data/seed/anukili.json";
import { __resetBudgetMemory } from "@/lib/budget";
import {
  __resetVoiceMemory,
  __resetVoiceListCache,
  FISH_CREDITS_MESSAGE,
  buildVoiceDesignPrompt,
} from "@/lib/voice";
import {
  __resetFishVoiceListCache,
  applyPronunciationsToText,
  designFishVoice,
  fishPronunciationDictionary,
  getVoiceProvider,
  mapFishVoices,
  resolveVoiceProvider,
} from "@/lib/voice-provider";
import { __resetOwnerAttempts } from "@/lib/voice-owner";
import { __resetVoiceStore, putSample } from "@/lib/voice-store";
import { GET as listGET } from "@/app/api/voice/list/route";
import { POST as speakPOST } from "@/app/api/voice/speak/route";
import { POST as customPOST } from "@/app/api/voice/custom/route";
import { POST as designPOST } from "@/app/api/voice/design/route";
import { mergeWorldAssets } from "@/lib/projects";

function seedWorld(): World {
  return WorldSchema.parse(seed);
}

function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function ownerHeaders(code = "owner-secret"): Record<string, string> {
  return { "x-voice-owner-code": code, "x-forwarded-for": "9.9.9.9" };
}

function metaText(text: string): Response {
  return new Response(
    JSON.stringify({
      output: [{ content: [{ type: "output_text", text }] }],
    }),
    { status: 200 },
  );
}

function fishModels() {
  return {
    total: 3,
    items: [
      {
        _id: "fish-aaa",
        title: "River Voice",
        tags: ["warm", "deep"],
        state: "trained",
        samples: [{ title: "s", text: "hi", task_id: "t", audio: "https://cdn/preview.mp3" }],
      },
      { _id: "fish-bbb", title: "Training Voice", tags: [], state: "training", samples: [] },
      {
        _id: "fish-ccc",
        title: "Taken Down",
        tags: [],
        state: "trained",
        dmca_taken_down: true,
        samples: [],
      },
    ],
  };
}

beforeEach(() => {
  __resetBudgetMemory();
  __resetVoiceMemory();
  __resetVoiceListCache();
  __resetFishVoiceListCache();
  __resetOwnerAttempts();
  __resetVoiceStore();
  vi.stubEnv("FISH_API_KEY", "test-fish-key");
  vi.stubEnv("ELEVENLABS_API_KEY", "");
  vi.stubEnv("VOICE_PROVIDER", "");
  vi.stubEnv("VOICE_OWNER_CODE", "owner-secret");
  vi.stubEnv("MODEL_API_KEY", "test-key");
  vi.stubEnv("VOICE_STORE_MEMORY", "1");
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  __resetBudgetMemory();
  __resetVoiceMemory();
  __resetVoiceListCache();
  __resetFishVoiceListCache();
  __resetOwnerAttempts();
  __resetVoiceStore();
});

describe("provider selection", () => {
  it("prefers VOICE_PROVIDER when set", () => {
    vi.stubEnv("VOICE_PROVIDER", "elevenlabs");
    expect(resolveVoiceProvider()).toBe("elevenlabs");
    vi.stubEnv("VOICE_PROVIDER", "fish");
    expect(resolveVoiceProvider()).toBe("fish");
  });

  it("uses Fish when its key is set", () => {
    expect(resolveVoiceProvider()).toBe("fish");
    expect(getVoiceProvider()?.id).toBe("fish");
  });

  it("falls back to ElevenLabs when only its key is set", () => {
    vi.stubEnv("FISH_API_KEY", "");
    vi.stubEnv("ELEVENLABS_API_KEY", "eleven-key");
    expect(resolveVoiceProvider()).toBe("elevenlabs");
    expect(getVoiceProvider()?.id).toBe("elevenlabs");
  });

  it("is none when no key is set", () => {
    vi.stubEnv("FISH_API_KEY", "");
    expect(resolveVoiceProvider()).toBe("none");
    expect(getVoiceProvider()).toBeNull();
  });
});

describe("fish list mapping", () => {
  it("keeps trained voices and drops training and taken-down ones", () => {
    const { voices } = mapFishVoices(fishModels());
    expect(voices.map((v) => v.id)).toEqual(["fish-aaa"]);
  });

  it("maps title, tags and the first sample to the drawer shape", () => {
    const { voices } = mapFishVoices(fishModels());
    expect(voices[0]).toEqual({
      id: "fish-aaa",
      name: "River Voice",
      labels: { tags: "warm, deep" },
      previewUrl: "https://cdn/preview.mp3",
    });
  });

  it("handles empty and unparseable payloads", () => {
    expect(mapFishVoices({ items: [] })).toEqual({ voices: [] });
    expect(mapFishVoices(null)).toEqual({ voices: [] });
  });

  it("returns the provider from the list route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(fishModels()), { status: 200 })),
    );
    const res = await listGET(new Request("http://localhost/api/voice/list"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { provider: string; voices: unknown[] };
    expect(json.provider).toBe("fish");
    expect(json.voices).toHaveLength(1);
  });

  it("merges self=true models at the top with a valid owner code", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        seen.push(String(url));
        if (String(url).includes("self=true")) {
          return new Response(
            JSON.stringify({
              total: 1,
              items: [
                {
                  _id: "fish-mine",
                  title: "My Voice",
                  tags: [],
                  state: "trained",
                  samples: [],
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify(fishModels()), { status: 200 });
      }),
    );
    const res = await listGET(
      new Request("http://localhost/api/voice/list", { headers: ownerHeaders() }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { voices: Array<{ id: string }> };
    expect(json.voices.map((v) => v.id)).toEqual(["fish-mine", "fish-aaa"]);
    expect(seen.some((url) => url.includes("self=true"))).toBe(true);
    expect(seen.some((url) => url.includes("sort_by=score"))).toBe(true);
  });
});

describe("fish speak", () => {
  function mockListThenSpeak(speakStatus = 200, speakBody: BodyInit = new Uint8Array([9, 8, 7])) {
    const seen: { url?: string; init?: RequestInit } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: RequestInit) => {
        if (String(url).includes("api.fish.audio/model")) {
          return new Response(JSON.stringify(fishModels()), { status: 200 });
        }
        seen.url = String(url);
        seen.init = init;
        return new Response(speakBody, { status: speakStatus });
      }),
    );
    return seen;
  }

  it("sends the model header and the expected body", async () => {
    const seen = mockListThenSpeak();
    const res = await speakPOST(
      postJson("http://localhost/api/voice/speak", {
        voiceId: "fish-aaa",
        text: "The river remembers.",
      }),
    );
    expect(res.status).toBe(200);
    expect(seen.url).toBe("https://api.fish.audio/v1/tts");
    const headers = seen.init?.headers as Record<string, string>;
    expect(headers.model).toBe("s2.1-pro");
    expect(headers.Authorization).toBe("Bearer test-fish-key");
    const body = JSON.parse(seen.init?.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      text: "The river remembers.",
      reference_id: "fish-aaa",
      format: "mp3",
      mp3_bitrate: 128,
      normalize: true,
      latency: "normal",
    });
    expect(body.pronunciation_dictionary).toBeUndefined();
    const json = (await res.json()) as { audioDataUrl: string };
    expect(json.audioDataUrl.startsWith("data:audio/mpeg;base64,")).toBe(true);
  });

  it("sends pronunciations as a pronunciation dictionary", async () => {
    const seen = mockListThenSpeak();
    const res = await speakPOST(
      postJson("http://localhost/api/voice/speak", {
        voiceId: "fish-aaa",
        text: "Enyinyi came.",
        pronunciations: [{ name: "Enyinyi", sayAs: "eh-yin-yi" }],
      }),
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(seen.init?.body as string) as Record<string, unknown>;
    expect(body.pronunciation_dictionary).toEqual([
      { items: [{ key: "Enyinyi", value: "eh-yin-yi" }] },
    ]);
  });

  it("maps a 402 to the credits message", async () => {
    mockListThenSpeak(402, JSON.stringify({ status: 402, message: "out of credits" }));
    const res = await speakPOST(
      postJson("http://localhost/api/voice/speak", { voiceId: "fish-aaa", text: "Hi." }),
    );
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      error: { code: "VOICE_FAILED", message: FISH_CREDITS_MESSAGE },
    });
    expect(FISH_CREDITS_MESSAGE).toBe("Your voice credits have run out.");
  });

  it("still needs the owner code for a voice that isn't listed", async () => {
    mockListThenSpeak();
    const res = await speakPOST(
      postJson("http://localhost/api/voice/speak", { voiceId: "fish-zzz", text: "Hi." }),
    );
    expect(res.status).toBe(401);
  });
});

describe("fish custom voice", () => {
  it("posts multipart with the expected fields and returns _id", async () => {
    const sampleId = await putSample("c1", new Uint8Array([1, 2, 3]), "audio/mpeg");
    const seen: { url?: string; init?: RequestInit } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: RequestInit) => {
        seen.url = String(url);
        seen.init = init;
        return new Response(JSON.stringify({ _id: "fish-new" }), { status: 201 });
      }),
    );
    const res = await customPOST(
      postJson(
        "http://localhost/api/voice/custom",
        { characterName: "Anukili", sampleIds: [sampleId], consent: true },
        ownerHeaders(),
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voiceId: "fish-new", requiresVerification: false });
    expect(seen.url).toBe("https://api.fish.audio/model");
    const form = seen.init?.body as FormData;
    expect(form.get("type")).toBe("tts");
    expect(form.get("title")).toBe("Anukili");
    expect(form.get("visibility")).toBe("private");
    expect(form.get("train_mode")).toBe("fast");
    expect(typeof form.get("description")).toBe("string");
    expect(form.getAll("voices").length).toBe(1);
  });

  it("maps a 402 to the credits message", async () => {
    const sampleId = await putSample("c1", new Uint8Array([1, 2, 3]), "audio/mpeg");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "no credits" }), { status: 402 })),
    );
    const res = await customPOST(
      postJson(
        "http://localhost/api/voice/custom",
        { characterName: "Anukili", sampleIds: [sampleId], consent: true },
        ownerHeaders(),
      ),
    );
    expect(await res.json()).toEqual({
      error: { code: "VOICE_FAILED", message: "Your voice credits have run out." },
    });
  });
});

describe("designed voices", () => {
  function worldWithSecrets(): World {
    const world = seedWorld();
    const first = world.characters[0];
    return {
      ...world,
      secrets: [
        {
          id: "s1",
          text: "quasar-lantern-secret",
          knownThrough: [],
          note: "hidden-orchid-note",
          suggested: false,
        },
      ],
      channels: world.channels.map((c, i) => (i === 0 ? { ...c, secret: "covert-channel-iris" } : c)),
      characters: world.characters.map((c, i) =>
        i === 0 ? { ...c, secret: "buried-character-ember" } : c,
      ),
      parts: world.parts.map((p, i) =>
        i === 0 ? { ...p, summary: `A calm day. quasar-lantern-secret ${p.summary}` } : p,
      ),
      beats: world.beats.map((b) => ({ ...b, characterIds: first ? [first.id] : [] })),
    };
  }

  function mockDesign(candidates = 3) {
    const seen: { meta?: string; fish?: string } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: RequestInit) => {
        if (String(url).includes("api.meta.ai")) {
          seen.meta = String(init?.body ?? "");
          return metaText(
            JSON.stringify({
              description: "A warm, deep voice like river stones.",
              testLine: "The river remembers your name.",
            }),
          );
        }
        seen.fish = String(init?.body ?? "");
        const headers = init?.headers as Record<string, string>;
        expect(headers.model).toBe("voice-design-1");
        return new Response(
          JSON.stringify({
            candidates: Array.from({ length: candidates }, (_, i) => ({
              id: `cand-${i}`,
              index: i,
              audio_base64: Buffer.from([i + 1, i + 2]).toString("base64"),
              sample_rate: 44100,
              duration_ms: 2000,
            })),
          }),
          { status: 200 },
        );
      }),
    );
    return seen;
  }

  it("returns the description and three candidates as data URLs", async () => {
    const seen = mockDesign();
    const world = seedWorld();
    const res = await designPOST(
      postJson(
        "http://localhost/api/voice/design",
        { world, characterId: world.characters[0]?.id },
        ownerHeaders(),
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      description: string;
      testLine: string;
      candidates: Array<{ id: string; audioDataUrl: string }>;
    };
    expect(json.description).toBe("A warm, deep voice like river stones.");
    expect(json.candidates).toHaveLength(3);
    expect(json.candidates[0]?.audioDataUrl.startsWith("data:audio/mpeg;base64,")).toBe(true);
    const fishBody = JSON.parse(seen.fish ?? "{}") as Record<string, unknown>;
    expect(fishBody).toMatchObject({
      instruction: "A warm, deep voice like river stones.",
      reference_text: "The river remembers your name.",
      language: "en",
      n: 3,
    });
  });

  it("keeps secrets out of the design prompt", async () => {
    const seen = mockDesign();
    const world = worldWithSecrets();
    const res = await designPOST(
      postJson(
        "http://localhost/api/voice/design",
        { world, characterId: world.characters[0]?.id },
        ownerHeaders(),
      ),
    );
    expect(res.status).toBe(200);
    for (const needle of [
      "quasar-lantern-secret",
      "hidden-orchid-note",
      "covert-channel-iris",
      "buried-character-ember",
    ]) {
      expect(seen.meta ?? "").not.toContain(needle);
    }
    expect(buildVoiceDesignPrompt(world, world.characters[0]?.id ?? "")).toContain("[redacted]");
  });

  it("needs the owner code", async () => {
    mockDesign();
    const world = seedWorld();
    const res = await designPOST(
      postJson("http://localhost/api/voice/design", {
        world,
        characterId: world.characters[0]?.id,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("refuses designed voices on ElevenLabs", async () => {
    vi.stubEnv("FISH_API_KEY", "");
    vi.stubEnv("ELEVENLABS_API_KEY", "eleven-key");
    vi.stubGlobal("fetch", vi.fn());
    const world = seedWorld();
    const res = await designPOST(
      postJson(
        "http://localhost/api/voice/design",
        { world, characterId: world.characters[0]?.id },
        ownerHeaders(),
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Designed voices need Fish Audio." },
    });
  });

  it("labels candidate audio from the schema and fails calmly with none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (String(url).includes("api.meta.ai")) {
          return metaText(JSON.stringify({ description: "Warm.", testLine: "Hello." }));
        }
        return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
      }),
    );
    const world = seedWorld();
    const res = await designPOST(
      postJson(
        "http://localhost/api/voice/design",
        { world, characterId: world.characters[0]?.id },
        ownerHeaders(),
      ),
    );
    expect(res.status).toBe(502);
    // The schema's VoiceDesignCandidate carries base64 audio with no
    // format field, so candidates are labelled mp3 like the TTS output.
    const direct = await designFishVoice({ instruction: "Warm.", referenceText: "Hello." });
    expect(direct.ok).toBe(false);
  });
});

describe("pronunciations", () => {
  it("defaults to an empty list on old worlds", () => {
    expect(seedWorld().pronunciations).toEqual([]);
    const parsed = WorldSchema.parse({ ...seedWorld(), pronunciations: undefined });
    expect(parsed.pronunciations).toEqual([]);
  });

  it("builds a Fish pronunciation dictionary and drops invalid entries", () => {
    expect(
      fishPronunciationDictionary([{ name: "Enyinyi", sayAs: "eh-yin-yi" }]),
    ).toEqual([{ items: [{ key: "Enyinyi", value: "eh-yin-yi" }] }]);
    expect(fishPronunciationDictionary([])).toBeUndefined();
    expect(
      fishPronunciationDictionary([
        { name: "", sayAs: "x" },
        { name: "A", sayAs: "" },
        { name: "B", sayAs: "<|phoneme_start|>x" },
      ]),
    ).toBeUndefined();
  });

  it("replaces names in the sent text for ElevenLabs", () => {
    expect(
      applyPronunciationsToText("Enyinyi came with Anukili.", [
        { name: "Enyinyi", sayAs: "eh-yin-yi" },
      ]),
    ).toBe("eh-yin-yi came with Anukili.");
    expect(applyPronunciationsToText("No names here.", [])).toBe("No names here.");
  });

  it("mergeWorldAssets keeps pronunciations", () => {
    const oldWorld = seedWorld();
    const withPron: World = {
      ...oldWorld,
      pronunciations: [{ name: "Enyinyi", sayAs: "eh-yin-yi" }],
    };
    const nextWorld: World = { ...seedWorld() };
    const merged = mergeWorldAssets(withPron, nextWorld);
    expect(merged.pronunciations).toEqual([{ name: "Enyinyi", sayAs: "eh-yin-yi" }]);
    const merged2 = mergeWorldAssets(seedWorld(), withPron);
    expect(merged2.pronunciations).toEqual([{ name: "Enyinyi", sayAs: "eh-yin-yi" }]);
  });
});
