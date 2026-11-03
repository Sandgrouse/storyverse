import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as readPOST } from "@/app/api/read/route";
import { POST as planPOST } from "@/app/api/plan/route";
import {
  IDEA_ADDITION,
  READ_INSTRUCTIONS,
  ReadModelOutputSchema,
  buildReadContent,
  buildReadInput,
  sanitizeArtFiles,
} from "@/lib/read";
import {
  PLAN_INSTRUCTIONS,
  toPlanBeats,
  toPlanChannels,
  toPlanSecrets,
} from "@/lib/plan";
import {
  MAX_SEND_BYTES,
  largestFileName,
  overLimit,
} from "@/lib/files";
import { WorldSchema } from "@/lib/world/schemas";

function post(body: unknown): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function modelPayload(text: string): unknown {
  return {
    output: [{ content: [{ type: "output_text", text }] }],
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

function mockModel(text: string) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(modelPayload(text)), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const PDF = {
  name: "treatment.pdf",
  type: "application/pdf",
  dataUrl: "data:application/pdf;base64,JVBERi0x",
};

const TEXT = {
  name: "notes.md",
  type: "text/markdown",
  text: "A boy is born holding roots.",
};

const IMAGE = {
  name: "hero.webp",
  type: "image/webp",
  dataUrl: "data:image/webp;base64,UklGRg==",
};

const READ_MODEL = {
  title: "Test Story",
  logline: "A short logline.",
  files: [
    { file: "treatment.pdf", kind: "story", label: "Story treatment" },
    { file: "notes.md", kind: "story", label: "Notes" },
    { file: "hero.webp", kind: "character_art", label: "Hero art" },
  ],
  characters: [{ id: "c1", name: "Ada", canon: "Brave.", artFile: "hero.webp" }],
  locations: [{ id: "l1", name: "Aguleri", description: "A village." }],
  parts: [
    {
      id: "p1",
      order: 1,
      title: "The Omen",
      summary: "Born holding roots.",
      excerpt: "A retelling in new words.",
      artFile: "hero.webp",
    },
  ],
  gaps: [{ id: "g1", question: "Why did it happen?" }],
};

const CANON = {
  title: "Test Story",
  logline: "A short logline.",
  files: READ_MODEL.files,
  characters: READ_MODEL.characters,
  locations: READ_MODEL.locations,
  parts: READ_MODEL.parts,
  gaps: READ_MODEL.gaps,
};

beforeEach(() => {
  vi.stubEnv("MODEL_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("read content order", () => {
  it("lists file names first, then pdf, text and image parts", () => {
    const content = buildReadContent([PDF, TEXT, IMAGE]);
    expect(content[0]).toMatchObject({ type: "input_text" });
    const listing = (content[0] as { text: string }).text;
    expect(listing.indexOf("treatment.pdf")).toBeLessThan(listing.indexOf("notes.md"));
    expect(listing.indexOf("notes.md")).toBeLessThan(listing.indexOf("hero.webp"));
    const kinds = content.map((part) => part.type);
    expect(kinds).toEqual(["input_text", "input_file", "input_text", "input_image"]);
    expect(content[1]).toMatchObject({ type: "input_file", filename: "treatment.pdf" });
    expect(content[3]).toMatchObject({ type: "input_image", image_url: IMAGE.dataUrl });
  });

  it("wraps the content in a user message", () => {
    const input = buildReadInput([PDF], undefined);
    expect(input).toHaveLength(1);
    expect(input[0].role).toBe("user");
    expect(Array.isArray(input[0].content)).toBe(true);
  });

  it("uses the exact read instructions", () => {
    expect(READ_INSTRUCTIONS).toBe(
      "You read a creator's raw story material and build its canon. Use only what the material says. Never rename anyone, and keep all names and details exactly. Split the story into its natural parts. An excerpt is a short retelling in your own words, never copied text. A gap is an important question the material leaves open. For each image, say who or what it shows. Set artFile on a character, or on a part, only if an image clearly shows them, otherwise leave it empty.",
    );
  });

  it("uses the exact plan instructions", () => {
    expect(PLAN_INSTRUCTIONS).toBe(
      "You plan how one story spreads across channels. Propose three channels unless the material names others. Give each channel its own piece of the story, so that each holds at least one secret the others don't, and fans must follow several to get the whole truth. Every part must appear in at least one channel. Beat content is two to four sentences. Invented secrets are additions: keep them consistent with the canon, and never change a name or an established detail.",
    );
  });
});

describe("idea path", () => {
  it("adds the draft sentence when there are no files", () => {
    const content = buildReadContent([], "A river spirit returns.");
    const texts = content.map((part) => (part as { text?: string }).text ?? "");
    expect(texts).toContain("A river spirit returns.");
    expect(texts).toContain(IDEA_ADDITION);
  });

  it("sends the idea sentence through /api/read", async () => {
    const fetchMock = mockModel(JSON.stringify(READ_MODEL));
    const res = await readPOST(post({ files: [], idea: "A river spirit returns." }));
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const texts = (body.input[0].content as Array<{ text?: string }>)
      .map((part) => part.text ?? "")
      .join("\n");
    expect(texts).toContain("A river spirit returns.");
    expect(texts).toContain(IDEA_ADDITION);
  });
});

describe("POST /api/read", () => {
  it("sends the model parts in order with the file names listed first", async () => {
    const fetchMock = mockModel(JSON.stringify(READ_MODEL));
    const res = await readPOST(post({ files: [PDF, TEXT, IMAGE] }));
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-key" });
    const body = JSON.parse(init.body as string);
    expect(body.instructions).toBe(READ_INSTRUCTIONS);
    expect(body.input[0].role).toBe("user");
    const content = body.input[0].content as Array<Record<string, unknown>>;
    expect(content.map((part) => part.type)).toEqual([
      "input_text",
      "input_file",
      "input_text",
      "input_image",
    ]);
    const canon = ReadModelOutputSchema.parse(await res.json());
    expect(canon.title).toBe("Test Story");
  });

  it("clears artFile values that name no sent file", async () => {
    const bad = {
      ...READ_MODEL,
      characters: [{ id: "c1", name: "Ada", canon: "Brave.", artFile: "ghost.png" }],
      parts: [
        {
          id: "p1",
          order: 1,
          title: "The Omen",
          summary: "Born holding roots.",
          excerpt: "A retelling.",
          artFile: "ghost.png",
        },
      ],
    };
    mockModel(JSON.stringify(bad));
    const res = await readPOST(post({ files: [TEXT] }));
    expect(res.status).toBe(200);
    const canon = ReadModelOutputSchema.parse(await res.json());
    expect(canon.characters[0].artFile).toBe("");
    expect(canon.parts[0].artFile).toBe("");
  });

  it("clears bad artFiles in code as well", () => {
    const parsed = ReadModelOutputSchema.parse({
      ...READ_MODEL,
      characters: [{ id: "c1", name: "Ada", canon: "Brave.", artFile: "ghost.png" }],
    });
    const clean = sanitizeArtFiles(parsed, new Set(["notes.md"]));
    expect(clean.characters[0].artFile).toBe("");
  });

  it("reports failure instead of failing silently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { code: "bad" } }), { status: 500 })),
    );
    const res = await readPOST(post({ files: [TEXT] }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.code).toBeDefined();
  });

  it("returns the seed with sample:true without a key", async () => {
    vi.stubEnv("MODEL_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await readPOST(post({ files: [TEXT] }));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.sample).toBe(true);
    expect(json.title).toBe("Anukili");
  });
});

describe("POST /api/plan", () => {
  const planModel = {
    channels: [
      { id: "ch1", name: "Series", kind: "series", title: "Five", pitch: "A pitch." },
      { id: "ch2", name: "Game", kind: "arcade", title: "Play", pitch: "P." },
    ],
    beats: [
      {
        id: "b1",
        partId: "p1",
        channelId: "ch1",
        unitLabel: "Ep 1",
        title: "Start",
        content: "First it begins. Then it turns. Then it holds.",
        characterIds: ["c1", "nobody"],
      },
      {
        id: "b2",
        partId: "missing",
        channelId: "ch1",
        unitLabel: "Ep 2",
        title: "Lost",
        content: "Nowhere.",
        characterIds: [],
      },
    ],
    secrets: [
      { id: "s1", text: "Hidden.", knownThrough: ["ch1"], note: "Only there." },
      { id: "s2", text: "Lost.", knownThrough: ["nowhere"], note: "Nope." },
    ],
  };

  it("drops unresolved references", async () => {
    mockModel(JSON.stringify(planModel));
    const res = await planPOST(post({ canon: CANON }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.channels.map((c: { id: string }) => c.id)).toEqual(["ch1"]);
    expect(json.beats.map((b: { id: string }) => b.id)).toEqual(["b1"]);
    expect(json.beats[0].characterIds).toEqual(["c1"]);
    expect(json.secrets.map((s: { id: string }) => s.id)).toEqual(["s1"]);
  });

  it("drops unresolved references in code as well", () => {
    expect(
      toPlanChannels([
        { id: "ch1", name: "Series", kind: "series", title: "T", pitch: "P" },
        { id: "ch2", name: "Game", kind: "arcade", title: "T", pitch: "P" },
      ]).map((c) => c.id),
    ).toEqual(["ch1"]);
    const canon = { parts: [{ id: "p1" }], characters: [{ id: "c1" }] };
    expect(
      toPlanBeats(
        [
          {
            id: "b1",
            partId: "p1",
            channelId: "ch1",
            unitLabel: "Ep",
            title: "T",
            content: "C",
            characterIds: ["c1", "ghost"],
          },
          {
            id: "b2",
            partId: "missing",
            channelId: "ch1",
            unitLabel: "Ep",
            title: "T",
            content: "C",
            characterIds: [],
          },
        ],
        canon,
        ["ch1"],
      ).map((b) => b.id),
    ).toEqual(["b1"]);
    expect(
      toPlanSecrets(
        [
          { id: "s1", text: "T", knownThrough: ["ch1"], note: "N" },
          { id: "s2", text: "T", knownThrough: ["nowhere"], note: "N" },
        ],
        ["ch1"],
      ).map((s) => s.id),
    ).toEqual(["s1"]);
  });

  it("returns the seed with sample:true without a key", async () => {
    vi.stubEnv("MODEL_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    const raw = await readFile(join(process.cwd(), "data", "seed", "anukili.json"), "utf-8");
    const seed = WorldSchema.parse(JSON.parse(raw));
    const res = await planPOST(post({ canon: CANON }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sample).toBe(true);
    expect(json.channels).toHaveLength(seed.channels.length);
  });
});

describe("size limit", () => {
  it("flags totals over 4MB and names the largest file", () => {
    const big = "x".repeat(MAX_SEND_BYTES + 10);
    const files = [
      { name: "small.md", type: "text/markdown", text: "hi" },
      { name: "big-image.webp", type: "image/webp", dataUrl: big },
    ];
    expect(overLimit(files)).toBe(true);
    expect(largestFileName(files)).toBe("big-image.webp");
    expect(overLimit([{ name: "a.md", type: "text/markdown", text: "hi" }])).toBe(false);
  });
});
