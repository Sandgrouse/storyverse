import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorldSchema, type World } from "@/lib/world/schemas";
import seed from "@/data/seed/anukili.json";
import { __resetBudgetMemory } from "@/lib/budget";
import {
  CUSTOM_VOICE_LIMIT_MESSAGE,
  buildVoiceLinesPrompt,
  customVoiceErrorFor,
  writeVoiceListCache,
  __resetVoiceListCache,
} from "@/lib/voice";
import { __resetVoiceMemory } from "@/lib/voice";
import { __resetOwnerAttempts } from "@/lib/voice-owner";
import {
  VoiceStoreError,
  __resetVoiceStore,
  appendSubmission,
  deleteSamples,
  getAudio,
  getSample,
  isAudioFileId,
  isInviteToken,
  listSubmissions,
  makeInviteToken,
  putSample,
  readInvite,
  saveInvite,
  type InviteRecord,
  type SubmissionRecord,
} from "@/lib/voice-store";
import { POST as invitesPOST } from "@/app/api/voice/invites/route";
import { DELETE as inviteDELETE, GET as inviteGET } from "@/app/api/voice/invites/[token]/route";
import { GET as filesGET, POST as filesPOST } from "@/app/api/voice/invites/[token]/files/route";
import { POST as customPOST } from "@/app/api/voice/custom/route";
import { POST as linesPOST } from "@/app/api/voice/lines/route";
import { POST as speakPOST } from "@/app/api/voice/speak/route";

function seedWorld(): World {
  return WorldSchema.parse(seed);
}

function ownerHeaders(code = "owner-secret"): Record<string, string> {
  return { "x-voice-owner-code": code, "x-forwarded-for": "9.9.9.9" };
}

function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function metaText(text: string): Response {
  return new Response(
    JSON.stringify({
      output: [{ content: [{ type: "output_text", text }] }],
    }),
    { status: 200 },
  );
}

function inviteBody(overrides: Record<string, unknown> = {}) {
  return {
    projectTitle: "Anukili",
    note: "Thanks!",
    characters: [{ id: "c1", name: "Anukili", brief: "A giant.", lines: ["Line one.", "Line two."] }],
    ...overrides,
  };
}

function submissionFile(name = "take.m4a", type = "audio/mp4", bytes = new Uint8Array([1, 2, 3, 4])): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

async function seedInvite(token = makeInviteToken()): Promise<InviteRecord> {
  const record: InviteRecord = {
    token,
    projectTitle: "Anukili",
    note: "Thanks!",
    characters: [{ id: "c1", name: "Anukili", brief: "A giant.", lines: ["Line one!", "Line two!"] }],
    createdAt: Date.now(),
    submissions: [],
  };
  await saveInvite(record);
  return record;
}

beforeEach(() => {
  __resetBudgetMemory();
  __resetVoiceMemory();
  __resetVoiceListCache();
  __resetOwnerAttempts();
  __resetVoiceStore();
  vi.stubEnv("ELEVENLABS_API_KEY", "test-voice-key");
  vi.stubEnv("MODEL_API_KEY", "test-key");
  vi.stubEnv("VOICE_OWNER_CODE", "owner-secret");
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
  __resetOwnerAttempts();
  __resetVoiceStore();
});

describe("owner code", () => {
  it("rejects creating an invite without the code", async () => {
    const res = await invitesPOST(postJson("http://localhost/api/voice/invites", inviteBody()));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "OWNER_CODE_REQUIRED", message: "Custom voices are for this project's owner." },
    });
  });

  it("rejects a wrong code", async () => {
    const res = await invitesPOST(
      postJson("http://localhost/api/voice/invites", inviteBody(), ownerHeaders("wrong")),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "OWNER_CODE_INVALID", message: "That code isn't right." },
    });
  });

  it("creates an invite with the right code", async () => {
    const res = await invitesPOST(
      postJson("http://localhost/api/voice/invites", inviteBody(), ownerHeaders()),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { token: string; url: string };
    expect(typeof json.token).toBe("string");
    expect(json.url).toContain("/voice/");
  });

  it("returns 503 when the owner code is unset", async () => {
    vi.stubEnv("VOICE_OWNER_CODE", "");
    const res = await invitesPOST(
      postJson("http://localhost/api/voice/invites", inviteBody(), ownerHeaders()),
    );
    expect(res.status).toBe(503);
  });

  it("locks out after 10 wrong attempts from one address", async () => {
    for (let i = 0; i < 9; i++) {
      const res = await invitesPOST(
        postJson("http://localhost/api/voice/invites", inviteBody(), ownerHeaders("wrong")),
      );
      expect(res.status).toBe(401);
    }
    const tenth = await invitesPOST(
      postJson("http://localhost/api/voice/invites", inviteBody(), ownerHeaders("wrong")),
    );
    expect(tenth.status).toBe(429);
    expect(await tenth.json()).toEqual({
      error: { code: "OWNER_CODE_LOCKED", message: "Too many wrong codes. Try again in an hour." },
    });
  });
});

describe("voice speak with custom voices", () => {
  function mockListThenSpeak() {
    writeVoiceListCache([{ id: "v-alice", name: "Alice", labels: {}, previewUrl: "" }]);
    const fetchMock = vi.fn(async (url: unknown) => {
      if (!String(url).includes("elevenlabs.io")) throw new Error("unexpected call");
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("speaks a premade voice without the code", async () => {
    mockListThenSpeak();
    const res = await speakPOST(
      postJson("http://localhost/api/voice/speak", { voiceId: "v-alice", text: "Hi." }),
    );
    expect(res.status).toBe(200);
  });

  it("needs the code for any other voice", async () => {
    mockListThenSpeak();
    const res = await speakPOST(
      postJson("http://localhost/api/voice/speak", { voiceId: "v-custom", text: "Hi." }),
    );
    expect(res.status).toBe(401);
  });

  it("speaks a custom voice with the code", async () => {
    mockListThenSpeak();
    const res = await speakPOST(
      postJson("http://localhost/api/voice/speak", { voiceId: "v-custom", text: "Hi." }, ownerHeaders()),
    );
    expect(res.status).toBe(200);
  });
});

describe("reading lines keep secrets out", () => {
  function worldWithSecrets(): World {
    const world = seedWorld();
    const first = world.characters[0];
    return {
      ...world,
      secrets: [
        {
          id: "s1",
          text: "zylophone-quasar-secret",
          knownThrough: [],
          note: "hidden-note-umbrella",
          suggested: false,
        },
      ],
      channels: world.channels.map((c, i) => (i === 0 ? { ...c, secret: "channel-covert-orchid" } : c)),
      characters: world.characters.map((c, i) =>
        i === 0 ? { ...c, secret: "character-buried-lantern" } : c,
      ),
      parts: world.parts.map((p, i) =>
        i === 0 ? { ...p, summary: `A calm day. zylophone-quasar-secret ${p.summary}` } : p,
      ),
      beats: world.beats.map((b) => ({ ...b, characterIds: first ? [first.id] : [] })),
    };
  }

  it("builds a prompt with no secret text", () => {
    const world = worldWithSecrets();
    const prompt = buildVoiceLinesPrompt(world, world.characters[0]?.id ?? "");
    for (const needle of [
      "zylophone-quasar-secret",
      "hidden-note-umbrella",
      "channel-covert-orchid",
      "character-buried-lantern",
    ]) {
      expect(prompt).not.toContain(needle);
    }
    expect(prompt).toContain("[redacted]");
  });

  it("never sends secrets to the model", async () => {
    let seen = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        seen = String(init?.body ?? "");
        return metaText(JSON.stringify({ lines: ["One.", "Two.", "Three.", "Four.", "Five.", "Six.", "Seven.", "Eight."] }));
      }),
    );
    const world = worldWithSecrets();
    const res = await linesPOST(
      postJson(
        "http://localhost/api/voice/lines",
        { world, characterId: world.characters[0]?.id },
        ownerHeaders(),
      ),
    );
    expect(res.status).toBe(200);
    for (const needle of [
      "zylophone-quasar-secret",
      "hidden-note-umbrella",
      "channel-covert-orchid",
      "character-buried-lantern",
    ]) {
      expect(seen).not.toContain(needle);
    }
  });

  it("needs the owner code", async () => {
    const world = seedWorld();
    const res = await linesPOST(
      postJson("http://localhost/api/voice/lines", {
        world,
        characterId: world.characters[0]?.id,
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("invites store only the given fields", () => {
  it("drops canon and secrets from stored characters", async () => {
    const res = await invitesPOST(
      postJson(
        "http://localhost/api/voice/invites",
        {
          projectTitle: "Anukili",
          note: "Hi",
          canon: "should never be stored",
          secrets: ["nope"],
          characters: [
            {
              id: "c1",
              name: "Anukili",
              brief: "A giant.",
              lines: ["Hello."],
              canon: "stolen canon",
              secret: "stolen secret",
            },
          ],
        },
        ownerHeaders(),
      ),
    );
    expect(res.status).toBe(201);
    const { token } = (await res.json()) as { token: string };
    const pub = await inviteGET(new Request("http://localhost/x"), { params: Promise.resolve({ token }) });
    expect(pub.status).toBe(200);
    const json = (await pub.json()) as Record<string, unknown>;
    expect(JSON.stringify(json)).not.toContain("stolen canon");
    expect(JSON.stringify(json)).not.toContain("stolen secret");
    expect(JSON.stringify(json)).not.toContain("should never be stored");
    expect(Object.keys(json).sort()).toEqual(["characters", "createdAt", "note", "projectTitle", "token"]);
  });

  it("returns a calm 404 for unknown and expired invites", async () => {
    const unknown = await inviteGET(new Request("http://localhost/x"), {
      params: Promise.resolve({ token: "nope" }),
    });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({
      error: { code: "INVITE_NOT_FOUND", message: "That link has expired or never existed." },
    });

    const expired = makeInviteToken();
    await saveInvite({
      token: expired,
      projectTitle: "Old",
      note: "",
      characters: [{ id: "c1", name: "A", brief: "", lines: ["Hi."] }],
      createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
      submissions: [],
    });
    const gone = await inviteGET(new Request("http://localhost/x"), {
      params: Promise.resolve({ token: expired }),
    });
    expect(gone.status).toBe(404);
  });

  it("deletes the invite and its files", async () => {
    const token = makeInviteToken();
    await seedInvite(token);
    const form = new FormData();
    form.set("file", submissionFile());
    form.set("characterId", "c1");
    form.set("lineIndex", "0");
    form.set("artistName", "Ada");
    form.set("consent", "true");
    const sent = await filesPOST(
      new Request(`http://localhost/api/voice/invites/${token}/files`, { method: "POST", body: form }),
      { params: Promise.resolve({ token }) },
    );
    expect(sent.status).toBe(201);
    const removed = await inviteDELETE(
      new Request("http://localhost/x", { method: "DELETE", headers: ownerHeaders() }),
      { params: Promise.resolve({ token }) },
    );
    expect(removed.status).toBe(200);
    const gone = await inviteGET(new Request("http://localhost/x"), {
      params: Promise.resolve({ token }),
    });
    expect(gone.status).toBe(404);
  });

  it("needs the owner code to list and delete", async () => {
    const token = makeInviteToken();
    await seedInvite(token);
    const listed = await filesGET(new Request("http://localhost/x"), {
      params: Promise.resolve({ token }),
    });
    expect(listed.status).toBe(401);
    const removed = await inviteDELETE(new Request("http://localhost/x", { method: "DELETE" }), {
      params: Promise.resolve({ token }),
    });
    expect(removed.status).toBe(401);
  });
});

describe("artist submissions", () => {
  function uploadForm(overrides: Record<string, string | File> = {}): FormData {
    const form = new FormData();
    form.set("file", submissionFile());
    form.set("characterId", "c1");
    form.set("lineIndex", "0");
    form.set("artistName", "Ada");
    form.set("consent", "true");
    for (const [key, value] of Object.entries(overrides)) form.set(key, value);
    return form;
  }

  it("stores the consent record with the submission", async () => {
    const token = makeInviteToken();
    await seedInvite(token);
    const sent = await filesPOST(
      new Request(`http://localhost/api/voice/invites/${token}/files`, {
        method: "POST",
        body: uploadForm(),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(sent.status).toBe(201);
    const listed = await filesGET(new Request("http://localhost/x", { headers: ownerHeaders() }), {
      params: Promise.resolve({ token }),
    });
    expect(listed.status).toBe(200);
    const json = (await listed.json()) as { submissions: SubmissionRecord[] };
    expect(json.submissions).toHaveLength(1);
    expect(json.submissions[0]?.artistName).toBe("Ada");
    expect(json.submissions[0]?.consentText).toContain("Anukili");
    expect(typeof json.submissions[0]?.consentAt).toBe("number");
  });

  it("requires consent", async () => {
    const token = makeInviteToken();
    await seedInvite(token);
    const sent = await filesPOST(
      new Request(`http://localhost/api/voice/invites/${token}/files`, {
        method: "POST",
        body: uploadForm({ consent: "false" }),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(sent.status).toBe(400);
    expect(await sent.json()).toEqual({
      error: {
        code: "CONSENT_REQUIRED",
        message: "The artist's consent is required before sending recordings.",
      },
    });
  });

  it("rejects non-audio files and files over 4MB", async () => {
    const token = makeInviteToken();
    await seedInvite(token);
    const bad = await filesPOST(
      new Request(`http://localhost/api/voice/invites/${token}/files`, {
        method: "POST",
        body: uploadForm({ file: submissionFile("pic.png", "image/png") }),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(bad.status).toBe(400);
    const big = await filesPOST(
      new Request(`http://localhost/api/voice/invites/${token}/files`, {
        method: "POST",
        body: uploadForm({
          file: submissionFile("big.mp3", "audio/mpeg", new Uint8Array(4 * 1024 * 1024 + 1)),
        }),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(big.status).toBe(413);
  });

  it("holds at most 12 files per character", async () => {
    const record = await seedInvite();
    for (let i = 0; i < 12; i++) {
      await appendSubmission(record.token, {
        characterId: "c1",
        lineIndex: 0,
        artistName: "Ada",
        consentText: "consent",
        consentAt: Date.now(),
        mimeType: "audio/mpeg",
        size: 4,
        fileId: `file-${i}.mp3`,
        url: null,
      });
    }
    const extra = await filesPOST(
      new Request(`http://localhost/api/voice/invites/${record.token}/files`, {
        method: "POST",
        body: uploadForm(),
      }),
      { params: Promise.resolve({ token: record.token }) },
    );
    expect(extra.status).toBe(400);
    expect(await extra.json()).toEqual({
      error: {
        code: "CHARACTER_FILE_LIMIT",
        message: "That character already has 12 takes. Remove one before adding another.",
      },
    });
  });
});

describe("creating the voice", () => {
  it("requires consent", async () => {
    const res = await customPOST(
      postJson(
        "http://localhost/api/voice/custom",
        { characterName: "Anukili", sampleIds: ["a.mp3"], consent: false },
        ownerHeaders(),
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: "CONSENT_REQUIRED",
        message: "I have the right and the speaker's consent to create an AI voice from this audio.",
      },
    });
  });

  it("needs the owner code", async () => {
    const res = await customPOST(
      postJson("http://localhost/api/voice/custom", {
        characterName: "Anukili",
        sampleIds: ["a.mp3"],
        consent: true,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("calls voices/add as multipart and returns the voice", async () => {
    const sampleId = await putSample("c1", new Uint8Array([1, 2, 3]), "audio/mpeg");
    const seen: { url?: string; init?: RequestInit } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: RequestInit) => {
        seen.url = String(url);
        seen.init = init;
        return new Response(JSON.stringify({ voice_id: "v-new" }), { status: 200 });
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
    expect(await res.json()).toEqual({ voiceId: "v-new", requiresVerification: false });
    expect(seen.url).toBe("https://api.elevenlabs.io/v1/voices/add");
    expect((seen.init?.headers as Record<string, string>)["xi-api-key"]).toBe("test-voice-key");
    const form = seen.init?.body as FormData;
    expect(form.get("name")).toBe("Anukili");
    expect(form.get("remove_background_noise")).toBe("false");
    expect(form.get("files")).toBeInstanceOf(Blob);
  });

  it("maps a plan or voice-limit error to the calm message", async () => {
    const sampleId = await putSample("c1", new Uint8Array([1, 2, 3]), "audio/mpeg");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: { message: "voice limit reached" } }), {
            status: 422,
          }),
      ),
    );
    const res = await customPOST(
      postJson(
        "http://localhost/api/voice/custom",
        { characterName: "Anukili", sampleIds: [sampleId], consent: true },
        ownerHeaders(),
      ),
    );
    expect(await res.json()).toEqual({
      error: { code: "VOICE_LIMIT", message: CUSTOM_VOICE_LIMIT_MESSAGE },
    });
    expect(customVoiceErrorFor(422, "voice limit reached")).toBe(CUSTOM_VOICE_LIMIT_MESSAGE);
    expect(customVoiceErrorFor(500, "boom")).not.toBe(CUSTOM_VOICE_LIMIT_MESSAGE);
  });
});

describe("invite tokens and file ids are validated", () => {
  it("only accepts 32-char base64url tokens", () => {
    expect(isInviteToken(makeInviteToken())).toBe(true);
    for (const bad of [
      "../",
      "../../etc/passwd",
      "..%2F..%2Fetc%2Fpasswd",
      "tok-123",
      "",
      "a".repeat(31),
      "a".repeat(33),
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!1",
      "abc/defghijklmnopqrstuvwxyz12345",
    ]) {
      expect(isInviteToken(bad)).toBe(false);
    }
  });

  it("returns not found for traversal tokens without touching the store", async () => {
    const token = makeInviteToken();
    await seedInvite(token);
    for (const bad of ["../", "../../etc/passwd", "..", "tok-123", ""]) {
      expect(await readInvite(bad)).toBeNull();
      await expect(
        appendSubmission(bad, {
          characterId: "c1",
          lineIndex: 0,
          artistName: "Ada",
          consentText: "consent",
          consentAt: Date.now(),
          mimeType: "audio/mpeg",
          size: 4,
          fileId: "c1-abcdefghijklmnop.mp3",
          url: null,
        }),
      ).rejects.toBeInstanceOf(VoiceStoreError);
      await expect(listSubmissions(bad)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    // The real invite still reads fine.
    expect((await readInvite(token))?.token).toBe(token);
  });

  it("answers 404 for traversal tokens at the invite routes", async () => {
    const missing = await inviteGET(new Request("http://localhost/x"), {
      params: Promise.resolve({ token: "../../etc/passwd" }),
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: { code: "INVITE_NOT_FOUND", message: "That link has expired or never existed." },
    });
    const removed = await inviteDELETE(
      new Request("http://localhost/x", { method: "DELETE", headers: ownerHeaders() }),
      { params: Promise.resolve({ token: "../other" }) },
    );
    expect(removed.status).toBe(404);
  });

  it("rejects saving an invite with a bad token", async () => {
    await expect(
      saveInvite({
        token: "../evil",
        projectTitle: "Anukili",
        note: "",
        characters: [],
        createdAt: Date.now(),
        submissions: [],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("only accepts file ids in the exact form putAudio generates", async () => {
    const sampleId = await putSample("c1", new Uint8Array([1, 2, 3]), "audio/mpeg");
    expect(isAudioFileId(sampleId)).toBe(true);
    expect((await getSample(sampleId))?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    // Right shape but never stored still reads as missing.
    expect(isAudioFileId("c1-abcdefghijklmnop.mp3")).toBe(true);
    expect(await getSample("c1-abcdefghijklmnop.mp3")).toBeNull();
    for (const bad of [
      "../invite.json",
      "../../etc/passwd",
      "audio/../../etc/passwd",
      "c1-evil.mp3",
      "c1-tooshort.mp3",
      "c1-abcdefghijklmnop.exe",
      "c1-abcdefghijklmnop.MP3",
      "file-0.mp3",
      "",
    ]) {
      expect(isAudioFileId(bad)).toBe(false);
      expect(await getSample(bad)).toBeNull();
      expect(await getAudio(bad)).toBeNull();
    }
    // Skipping bad ids never throws and never deletes the real sample.
    await deleteSamples(["../other.mp3", "nope"]);
    expect((await getSample(sampleId))?.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("answers 400 for traversal sample ids at the custom-voice route", async () => {
    const res = await customPOST(
      postJson(
        "http://localhost/api/voice/custom",
        { characterName: "Anukili", sampleIds: ["../../etc/passwd"], consent: true },
        ownerHeaders(),
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "One of those recordings is missing." },
    });
  });
});
