import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorldSchema, type World } from "@/lib/world/schemas";
import seed from "@/data/seed/anukili.json";
import { __resetBudgetMemory } from "@/lib/budget";
import {
  __resetVoiceListCache,
  __resetVoiceMemory,
  elevenLabsSpeakUrl,
  mapUpstreamVoices,
  writeVoiceListCache,
} from "@/lib/voice";
import { GET as listGET } from "@/app/api/voice/list/route";
import { POST as suggestPOST } from "@/app/api/voice/suggest/route";
import { POST as speakPOST } from "@/app/api/voice/speak/route";
import {
  dropStoredRefs,
  extractImageEntries,
  hasStoredRefs,
  restoreImageRefs,
} from "@/lib/images";
import { stripImageData } from "@/lib/story";
import { mergeWorldAssets } from "@/lib/projects";
import { packageTree, planAgentFiles } from "@/lib/package";

const AUDIO = "data:audio/mpeg;base64,QUJD";
const IMAGE = "data:image/webp;base64,QUJD";

function seedWorld(): World {
  return WorldSchema.parse(seed);
}

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function upstreamVoices() {
  return {
    voices: [
      {
        voice_id: "v-aria",
        name: "Aria",
        labels: { accent: "british", age: "young", gender: "feminine" },
        preview_url: "https://audio/aria.mp3",
      },
      {
        voice_id: "v-owen",
        name: "Owen",
        preview_url: "https://audio/owen.mp3",
      },
    ],
  };
}

function metaText(text: string): Response {
  return new Response(
    JSON.stringify({
      output: [{ content: [{ type: "output_text", text }] }],
    }),
    { status: 200 },
  );
}

/** Suggest body for the first seeded character. */
function suggestBody(overrides: Record<string, unknown> = {}) {
  const world = seedWorld();
  return {
    world,
    characterId: world.characters[0]?.id ?? "missing",
    voices: [{ id: "v-aria", name: "Aria", labels: {} }],
    ...overrides,
  };
}

beforeEach(() => {
  __resetBudgetMemory();
  __resetVoiceMemory();
  __resetVoiceListCache();
  vi.stubEnv("ELEVENLABS_API_KEY", "test-voice-key");
  vi.stubEnv("MODEL_API_KEY", "test-key");
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  __resetBudgetMemory();
  __resetVoiceMemory();
  __resetVoiceListCache();
});

describe("voice list", () => {
  it("maps upstream voices and sends the key header", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(upstreamVoices()), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await listGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      voices: [
        {
          id: "v-aria",
          name: "Aria",
          labels: { accent: "british", age: "young", gender: "feminine" },
          previewUrl: "https://audio/aria.mp3",
        },
        {
          id: "v-owen",
          name: "Owen",
          labels: {},
          previewUrl: "https://audio/owen.mp3",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("api.elevenlabs.io/v2/voices");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe(
      "test-voice-key",
    );
  });

  it("caches the list for an hour", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(upstreamVoices()), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await listGET();
    await listGET();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 503 without the key", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await listGET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: { code: "NO_VOICE_KEY", message: "Voices aren't set up here yet." },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a 401 to the calm unavailable message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unauthorized", { status: 401 })),
    );
    const res = await listGET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: {
        code: "VOICE_FAILED",
        message: "The voice service isn't available right now.",
      },
    });
  });

  it("maps upstream payloads down to the drawer shape", () => {
    expect(mapUpstreamVoices(upstreamVoices()).voices).toHaveLength(2);
    expect(mapUpstreamVoices({ voices: [] })).toEqual({ voices: [] });
    expect(mapUpstreamVoices(null)).toEqual({ voices: [] });
  });
});

describe("voice suggest", () => {
  function mockSuggest(model: unknown, seen: { input?: string } = {}) {
    const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes("elevenlabs.io")) {
        throw new Error("suggest must not call ElevenLabs");
      }
      if (init?.body) seen.input = init.body as string;
      return metaText(JSON.stringify(model));
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("returns the pick, reason and line", async () => {
    mockSuggest({ voiceId: "v-aria", reason: "Warm and young.", line: "The river remembers." });
    const res = await suggestPOST(
      post("http://localhost/api/voice/suggest", suggestBody()),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      voiceId: "v-aria",
      reason: "Warm and young.",
      line: "The river remembers.",
    });
  });

  it("rejects a voiceId that isn't in the list", async () => {
    mockSuggest({ voiceId: "v-stranger", reason: "Nope.", line: "Hello there." });
    const res = await suggestPOST(
      post("http://localhost/api/voice/suggest", suggestBody()),
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: { code: "UNKNOWN_VOICE", message: "That voice isn't in the list." },
    });
  });

  it("fails calmly when the model writes past 160 characters", async () => {
    mockSuggest({ voiceId: "v-aria", reason: "Warm.", line: "x".repeat(200) });
    const res = await suggestPOST(
      post("http://localhost/api/voice/suggest", suggestBody()),
    );
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toBe("Choosing a voice failed.");
  });

  it("strips image and audio data before sending the world", async () => {
    const seen: { input?: string } = {};
    mockSuggest(
      { voiceId: "v-aria", reason: "Warm.", line: "Hello." },
      seen,
    );
    const world = seedWorld();
    const withData: World = {
      ...world,
      characters: world.characters.map((c, i) => ({
        ...c,
        artPath: IMAGE,
        sheet: [{ view: "front", imagePath: IMAGE }],
        lines: i === 0 ? [{ id: "l1", text: "old line", audioPath: AUDIO }] : [],
      })),
    };
    const res = await suggestPOST(
      post(
        "http://localhost/api/voice/suggest",
        suggestBody({ world: withData }),
      ),
    );
    expect(res.status).toBe(200);
    expect(seen.input ?? "").not.toContain("data:image");
    expect(seen.input ?? "").not.toContain("data:audio");
  });

  it("returns 503 without the key", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    const res = await suggestPOST(
      post("http://localhost/api/voice/suggest", suggestBody()),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: { code: "NO_VOICE_KEY", message: "Voices aren't set up here yet." },
    });
  });
});

describe("voice speak", () => {
  function mockSpeak(status = 200, bytes: number[] = [1, 2, 3]) {
    // The speak route only speaks listed premade voices: seed the cache
    // so these tests exercise the speak call, not the list fetch.
    writeVoiceListCache([
      { id: "v-alice", name: "Alice", labels: {}, previewUrl: "" },
    ]);
    const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (!String(url).includes("elevenlabs.io")) {
        throw new Error(`unexpected call to ${String(url)}`);
      }
      const headers = init?.headers as Record<string, string>;
      expect(headers["xi-api-key"]).toBe("test-voice-key");
      expect(String(url)).toContain("/text-to-speech/v-alice");
      expect(String(url)).toContain("output_format=mp3_44100_128");
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      expect(body.model_id).toBe("eleven_multilingual_v2");
      return new Response(new Uint8Array(bytes), { status });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("returns the mp3 as a base64 data URL", async () => {
    mockSpeak();
    const res = await speakPOST(
      post("http://localhost/api/voice/speak", {
        voiceId: "v-alice",
        text: "The river remembers.",
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { audioDataUrl: string };
    expect(json.audioDataUrl.startsWith("data:audio/mpeg;base64,")).toBe(true);
    const decoded = Buffer.from(json.audioDataUrl.split(",")[1] ?? "", "base64");
    expect([...decoded]).toEqual([1, 2, 3]);
  });

  it("rejects text over 300 characters", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await speakPOST(
      post("http://localhost/api/voice/speak", {
        voiceId: "v-alice",
        text: "x".repeat(301),
      }),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty text", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await speakPOST(
      post("http://localhost/api/voice/speak", { voiceId: "v-alice", text: "" }),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a voice id shaped like a path", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("must not call upstream for a bad voice id");
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await speakPOST(
      post("http://localhost/api/voice/speak", {
        voiceId: "../../voices/add",
        text: "Hi.",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "UNKNOWN_VOICE", message: "Choose one of the listed voices." },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("needs the owner code for a voice that isn't listed", async () => {
    vi.stubEnv("VOICE_OWNER_CODE", "owner-secret");
    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url).includes("/v2/voices")) {
        return new Response(JSON.stringify(upstreamVoices()), { status: 200 });
      }
      throw new Error(`must not speak a custom voice without the code: ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await speakPOST(
      post("http://localhost/api/voice/speak", {
        voiceId: "v-stranger",
        text: "Hi.",
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: {
        code: "OWNER_CODE_REQUIRED",
        message: "Custom voices are for this project's owner.",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v2/voices");
  });

  it("encodes the voice id in the speak URL", () => {
    expect(elevenLabsSpeakUrl("v-alice")).toContain("/text-to-speech/v-alice?");
    expect(elevenLabsSpeakUrl("a/b")).toContain("/text-to-speech/a%2Fb?");
  });

  it("returns 503 without the key", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await speakPOST(
      post("http://localhost/api/voice/speak", { voiceId: "v-alice", text: "Hi." }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: { code: "NO_VOICE_KEY", message: "Voices aren't set up here yet." },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps daily characters and spends nothing on failure", async () => {
    vi.stubEnv("VOICE_DAILY_CHARS", "10");
    mockSpeak();
    const first = await speakPOST(
      post("http://localhost/api/voice/speak", {
        voiceId: "v-alice",
        text: "12345678",
      }),
    );
    expect(first.status).toBe(200);
    const second = await speakPOST(
      post("http://localhost/api/voice/speak", {
        voiceId: "v-alice",
        text: "12345",
      }),
    );
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({
      error: { code: "BUDGET", message: "Today's voice limit is used up." },
    });
  });

  it("maps a 401 to the calm unavailable message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unauthorized", { status: 401 })),
    );
    const res = await speakPOST(
      post("http://localhost/api/voice/speak", { voiceId: "v-alice", text: "Hi." }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: {
        code: "VOICE_FAILED",
        message: "The voice service isn't available right now.",
      },
    });
  });
});

describe("voice audio refs", () => {
  const LINE = { id: "l1", text: "The river remembers.", audioPath: AUDIO };

  function worldWithLine(): World {
    const world = seedWorld();
    return {
      ...world,
      characters: world.characters.map((c, i) => ({
        ...c,
        voice: i === 0 ? { id: "v-aria", name: "Aria", reason: "Warm." } : undefined,
        lines: i === 0 ? [LINE] : [],
      })),
    };
  }

  it("extracts audio data URLs into refs and restores them", () => {
    const { world: refs, entries } = extractImageEntries(worldWithLine());
    expect(entries.map((e) => e.name)).toContain(
      `voice-${refs.characters[0]?.id}-l1`,
    );
    expect(JSON.stringify(refs)).not.toContain("data:audio");
    expect(hasStoredRefs(refs)).toBe(true);

    const images: Record<string, string> = {};
    for (const entry of entries) images[entry.name] = entry.dataUrl;
    const restored = restoreImageRefs(refs, images);
    expect(restored.characters[0]?.lines?.[0]?.audioPath).toBe(AUDIO);
    expect(restored.characters[0]?.voice).toEqual({
      id: "v-aria",
      name: "Aria",
      reason: "Warm.",
    });
  });

  it("drops stored audio refs and leaves plain paths alone", () => {
    const { world: refs } = extractImageEntries(worldWithLine());
    const dropped = dropStoredRefs(refs);
    expect(dropped.characters[0]?.lines?.[0]?.audioPath).toBe("");
    expect(JSON.stringify(dropped)).not.toContain("idb:");
  });

  it("strips audio data from requests and persisted worlds", () => {
    const stripped = stripImageData(worldWithLine());
    expect(stripped.characters[0]?.lines?.[0]?.audioPath).toBe("");
    expect(JSON.stringify(stripped)).not.toContain("data:audio");
    expect(JSON.stringify(stripped)).not.toContain(AUDIO);
  });

  it("keeps voice and lines for matching characters on merge", () => {
    const oldWorld = worldWithLine();
    const nextWorld: World = {
      ...seedWorld(),
      characters: seedWorld().characters.map((c, i) =>
        i === 0
          ? { id: "new-id", name: c.name, canon: "new canon", sheet: [] }
          : { id: `other-${i}`, name: c.name, canon: c.canon, sheet: [] },
      ),
    };
    const merged = mergeWorldAssets(oldWorld, nextWorld);
    const kept = merged.characters.find(
      (c) => c.name === oldWorld.characters[0]?.name,
    );
    expect(kept?.voice).toEqual({ id: "v-aria", name: "Aria", reason: "Warm." });
    expect(kept?.lines).toEqual([LINE]);
  });
});

describe("voice in the agent package", () => {
  it("lists voice.json and each line mp3 in the tree", async () => {
    const world = seedWorld();
    const withVoice: World = {
      ...world,
      characters: world.characters.map((c, i) => ({
        ...c,
        voice: i === 0 ? { id: "v-aria", name: "Aria" } : undefined,
        lines: i === 0 ? [{ id: "l1", text: "The river remembers.", audioPath: AUDIO }] : [],
      })),
    };
    const files = planAgentFiles(withVoice, withVoice.channels[0]?.id ?? "");
    const byChar = files.filter((f) => f.path.includes("/characters/"));
    const index = byChar.find((f) => f.type === "voice");
    expect(index?.missing).toBe(false);
    const parsed = JSON.parse(index?.content as string) as {
      voiceId: string;
      voiceName: string;
      lines: Array<{ text: string }>;
    };
    expect(parsed.voiceId).toBe("v-aria");
    expect(parsed.voiceName).toBe("Aria");
    expect(parsed.lines.map((l) => l.text)).toEqual(["The river remembers."]);

    const mp3 = byChar.find((f) => f.type === "voice-audio");
    expect(mp3?.path).toMatch(/voice\/l1\.mp3$/);
    expect(mp3?.missing).toBe(false);

    const tree = packageTree(files);
    expect(tree).toContain("voice.json");
    expect(tree).toContain("voice/l1.mp3");
  });
});
