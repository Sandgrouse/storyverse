import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as checkPOST } from "@/app/api/script/check/route";
import { POST as draftPOST } from "@/app/api/script/draft/route";
import { __resetBudgetMemory } from "@/lib/budget";
import { planAgentFiles } from "@/lib/package";
import { mergeWorldAssets } from "@/lib/projects";
import {
  COPY_DRAFT_INSTRUCTIONS,
  DESIGN_DRAFT_INSTRUCTIONS,
  DESIGN_HEADINGS,
  applyInsertAtCaret,
  applyScriptReplacement,
  draftInstructionsForForm,
  filterMentions,
  formatMentionName,
  formForKind,
  highlightSegments,
  initialScriptText,
  insertMentionAtCaret,
  insertSnippet,
  mentionCandidates,
  mentionQueryBeforeCaret,
  scriptCheckInput,
  scriptDraftInput,
  toScriptIssues,
  upsertScript,
} from "@/lib/script";
import { WorldSchema, type World } from "@/lib/world/schemas";

const SERIES_SECRET = "the baby lived because of SERIES_MARKER";
const GAME_SECRET = "the stream hides GAME_MARKER";
const SERIES_CHANNEL_SECRET = "SERIES_CHANNEL_SECRET why the baby lived";
const GAME_CHANNEL_SECRET = "GAME_CHANNEL_SECRET what the stream keeps";

function makeWorld(): World {
  return WorldSchema.parse({
    id: "test-story",
    title: "Test Story",
    premise: "A premise.",
    logline: "A logline.",
    characters: [
      { id: "ada", name: "Ada", canon: "Brave and tall.", sheet: [] },
      {
        id: "anukili-ugama",
        name: "Anukili Ugama",
        canon: "A child of wonder.",
        sheet: [],
      },
    ],
    locations: [
      { id: "stream", name: "The stream", description: "Cold water." },
    ],
    channels: [
      {
        id: "series",
        name: "Series",
        kind: "series",
        title: "The Series",
        secret: SERIES_CHANNEL_SECRET,
      },
      {
        id: "game",
        name: "Game",
        kind: "game",
        title: "The Game",
        secret: GAME_CHANNEL_SECRET,
      },
    ],
    parts: [
      {
        id: "part-1",
        order: 1,
        title: "Beginnings",
        summary: "Ada arrives.",
        excerpt: "She came at dawn.",
        characterIds: ["ada"],
      },
    ],
    beats: [
      {
        id: "beat-series-1",
        order: 1,
        timeLabel: "Part 1",
        title: "Arrival",
        channelId: "series",
        partId: "part-1",
        unitLabel: "Episode 1",
        content: "Ada arrives legs first.",
        characterIds: ["ada"],
      },
    ],
    secrets: [
      {
        id: "s-series",
        text: SERIES_SECRET,
        knownThrough: ["series"],
        note: "Shown, never said.",
      },
      {
        id: "s-game",
        text: GAME_SECRET,
        knownThrough: ["game"],
        note: "Found in the level.",
      },
    ],
    gaps: [],
    packs: [
      {
        partId: "part-1",
        channelId: "series",
        script: "Pack script for the scene.",
        shots: ["Ada at the bank.", "The water rises.", "She steps in."],
        posts: ["The stream is waiting.", "One step in.", "Watch part one."],
        reveals: [],
        additions: [],
      },
    ],
    scripts: [
      {
        channelId: "game",
        partId: "part-1",
        text: "Game draft for part one.",
        updatedAt: 7,
      },
    ],
  });
}

function post(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
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
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(modelPayload(text)), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  __resetBudgetMemory();
  vi.stubEnv("MODEL_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  __resetBudgetMemory();
});

describe("script channel knowledge rule", () => {
  it("gives the draft prompt only the secrets this channel may know", () => {
    const world = makeWorld();
    const input = scriptDraftInput(world, "series", "part-1", {});
    expect(input).toContain("SERIES_MARKER");
    expect(input).toContain("SERIES_CHANNEL_SECRET");
    expect(input).not.toContain("GAME_MARKER");
    expect(input).not.toContain("GAME_CHANNEL_SECRET");
  });

  it("never sends another channel's secret text to the draft model", async () => {
    const world = makeWorld();
    const fetchMock = mockModel(JSON.stringify({ text: "A new scene." }));
    const res = await draftPOST(
      post("/api/script/draft", {
        world,
        channelId: "series",
        partId: "part-1",
        mode: "draft",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "A new scene." });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(init.body as string) as { input: string };
    expect(body.input).toContain("SERIES_MARKER");
    expect(body.input).not.toContain("GAME_MARKER");
    expect(body.input).not.toContain("GAME_CHANNEL_SECRET");
  });

  it("lets the check prompt see every secret, so leaks can be spotted", () => {
    const world = makeWorld();
    const input = scriptCheckInput(world, "series", "part-1", "Ada waits.");
    expect(input).toContain("SERIES_MARKER");
    expect(input).toContain("GAME_MARKER");
  });
});

describe("script check filtering", () => {
  const world = makeWorld();
  const text = "Ada walks to the stream at dawn. The water is cold.";

  it("drops issues whose quote is not an exact substring", () => {
    const issues = toScriptIssues(
      [
        {
          kind: "contradiction",
          quote: "Ada walks to the stream at dawn.",
          problem: "The canon says she arrives at noon.",
          replacement: "Move the walk to noon.",
        },
        {
          kind: "leak",
          quote: "A line that is nowhere in the draft.",
          problem: "Nothing holds it.",
          replacement: "Cut it.",
        },
      ],
      text,
      world,
      "series",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].quote).toBe("Ada walks to the stream at dawn.");
  });

  it("drops issues that repeat another channel's secret", () => {
    const issues = toScriptIssues(
      [
        {
          kind: "leak",
          quote: "The water is cold.",
          problem: `This hints that ${GAME_SECRET}.`,
          replacement: "Keep the water undescribed.",
        },
        {
          kind: "leak",
          quote: "The water is cold.",
          problem: "The cold water reads flat here.",
          replacement: `Warm it, since ${GAME_CHANNEL_SECRET}.`,
        },
        {
          kind: "contradiction",
          quote: "The water is cold.",
          problem: "The canon says the stream runs warm.",
          replacement: "Call the water warm.",
        },
      ],
      text,
      world,
      "series",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].replacement).toBe("Call the water warm.");
  });

  it("filters at the route level too", async () => {
    mockModel(
      JSON.stringify({
        issues: [
          {
            kind: "contradiction",
            quote: "The water is cold.",
            problem: "The canon says the stream runs warm.",
            replacement: "Call the water warm.",
          },
          {
            kind: "leak",
            quote: "A line that is nowhere in the draft.",
            problem: "Nothing holds it.",
            replacement: "Cut it.",
          },
          {
            kind: "leak",
            quote: "The water is cold.",
            problem: `This hints that ${GAME_SECRET}.`,
            replacement: "Keep the water undescribed.",
          },
        ],
      }),
    );
    const res = await checkPOST(
      post("/api/script/check", {
        world,
        channelId: "series",
        partId: "part-1",
        text,
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { issues: unknown[] };
    expect(json.issues).toHaveLength(1);
  });

  it("rejects a missing draft text", async () => {
    const res = await checkPOST(
      post("/api/script/check", {
        world,
        channelId: "series",
        partId: "part-1",
        text: "",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("script scene text", () => {
  it("starts from the saved script, else the pack, else empty", () => {
    const world = makeWorld();
    expect(initialScriptText(world, "game", "part-1")).toBe(
      "Game draft for part one.",
    );
    expect(initialScriptText(world, "series", "part-1")).toBe(
      "Pack script for the scene.",
    );
    const bare = { ...world, packs: [], scripts: [] };
    expect(initialScriptText(bare, "series", "part-1")).toBe("");
  });

  it("upserts one script per channel and part", () => {
    const world = makeWorld();
    const next = upsertScript(world, "series", "part-1", "First draft.");
    expect(next.scripts).toHaveLength(2);
    const again = upsertScript(next, "series", "part-1", "Second draft.");
    expect(again.scripts).toHaveLength(2);
    expect(
      again.scripts.find(
        (s) => s.channelId === "series" && s.partId === "part-1",
      )?.text,
    ).toBe("Second draft.");
  });
});

describe("mergeWorldAssets keeps scripts", () => {
  it("carries old scripts into a world without them", () => {
    const oldWorld = makeWorld();
    const nextWorld = { ...makeWorld(), scripts: [] };
    const merged = mergeWorldAssets(oldWorld, nextWorld);
    expect(
      merged.scripts.find(
        (s) => s.channelId === "game" && s.partId === "part-1",
      )?.text,
    ).toBe("Game draft for part one.");
  });

  it("lets the next world's script win on a conflict", () => {
    const oldWorld = makeWorld();
    const nextWorld = upsertScript(makeWorld(), "game", "part-1", "Newer.");
    const merged = mergeWorldAssets(oldWorld, nextWorld);
    const kept = merged.scripts.filter(
      (s) => s.channelId === "game" && s.partId === "part-1",
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].text).toBe("Newer.");
  });
});

describe("agent package scripts", () => {
  it("includes only that channel's script", () => {
    const world = upsertScript(makeWorld(), "series", "part-1", "Series draft.");
    const series = planAgentFiles(world, "series");
    const script = series.find(
      (f) => f.type === "script" && f.path.endsWith("scripts/part-1.txt"),
    );
    expect(script?.missing).toBe(false);
    expect(script?.content).toBe("Series draft.");
    const contents = series
      .filter((f) => !f.missing && f.content !== undefined)
      .map((f) =>
        typeof f.content === "string"
          ? f.content
          : new TextDecoder().decode(f.content),
      )
      .join("\n");
    expect(contents).not.toContain("Game draft for part one.");

    const game = planAgentFiles(world, "game");
    const gameScript = game.find((f) => f.type === "script");
    expect(gameScript?.content).toBe("Game draft for part one.");
    expect(
      game.some((f) => f.path.endsWith("scripts/part-1.txt") && f.content === "Series draft."),
    ).toBe(false);
  });
});

describe("script highlights", () => {
  it("matches the longest name first, case-insensitively", () => {
    const segments = highlightSegments("anukili ugama met Ada", [
      "Ada",
      "Anukili Ugama",
      "Anukili",
    ]);
    const marked = segments.filter((s) => s.mark).map((s) => s.text);
    expect(marked).toEqual(["anukili ugama", "Ada"]);
  });

  it("gives issue quotes the stronger highlight", () => {
    const segments = highlightSegments("Ada walks to the stream at dawn.", ["Ada"], [
      "the stream",
    ]);
    const stream = segments.find((s) => s.text === "the stream");
    expect(stream?.mark).toBe(true);
    expect(stream?.strong).toBe(true);
    const ada = segments.find((s) => s.text === "Ada");
    expect(ada?.strong).toBe(false);
  });
});

describe("formForKind", () => {
  it("maps screenplay channels to script", () => {
    for (const kind of ["series", "shorts", "film", "ad", "other"]) {
      expect(formForKind(kind)).toBe("script");
    }
  });

  it("maps the game channel to design", () => {
    expect(formForKind("game")).toBe("design");
  });

  it("maps website and press channels to copy", () => {
    expect(formForKind("website")).toBe("copy");
    expect(formForKind("press")).toBe("copy");
  });

  it("reads an unknown kind as script", () => {
    expect(formForKind("radio")).toBe("script");
  });

  it("picks the matching system prompt", () => {
    expect(draftInstructionsForForm("design")).toBe(DESIGN_DRAFT_INSTRUCTIONS);
    expect(draftInstructionsForForm("copy")).toBe(COPY_DRAFT_INSTRUCTIONS);
  });
});

function gameWorld(): World {
  const world = makeWorld();
  return WorldSchema.parse({
    ...world,
    channels: [...world.channels],
    beats: [
      ...world.beats,
      {
        id: "beat-game-1",
        order: 2,
        timeLabel: "Part 1",
        title: "The Crossing",
        channelId: "game",
        partId: "part-1",
        unitLabel: "Level 1",
        content: "Ada crosses the stream.",
        characterIds: ["ada"],
      },
    ],
  });
}

describe("design-form draft prompt", () => {
  it("lists every design heading in order", () => {
    const input = scriptDraftInput(gameWorld(), "game", "part-1", {});
    const at = DESIGN_HEADINGS.map((heading) => input.indexOf(heading));
    expect(at.every((index) => index !== -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("uses only the game channel's secret", () => {
    const input = scriptDraftInput(gameWorld(), "game", "part-1", {});
    expect(input).toContain("GAME_MARKER");
    expect(input).toContain("GAME_CHANNEL_SECRET");
    expect(input).not.toContain("SERIES_MARKER");
    expect(input).not.toContain("SERIES_CHANNEL_SECRET");
  });

  it("asks for plain text, never screenplay formatting", () => {
    const input = scriptDraftInput(gameWorld(), "game", "part-1", {});
    expect(input).toContain("Do not use screenplay formatting");
    expect(DESIGN_DRAFT_INSTRUCTIONS).toContain("Notes for building it in Godot");
  });

  it("sends the design prompt and only the game's secrets to the model", async () => {
    const fetchMock = mockModel(JSON.stringify({ text: "Core idea\nA game." }));
    const res = await draftPOST(
      post("/api/script/draft", {
        world: gameWorld(),
        channelId: "game",
        partId: "part-1",
        mode: "draft",
      }),
    );
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(init.body as string) as {
      instructions: string;
      input: string;
    };
    for (const heading of DESIGN_HEADINGS) {
      expect(body.instructions).toContain(heading);
    }
    expect(body.input).toContain("GAME_MARKER");
    expect(body.input).not.toContain("SERIES_MARKER");
    expect(body.input).not.toContain("SERIES_CHANNEL_SECRET");
  });

  it("rewrites and checks in design form too", async () => {
    const world = gameWorld();
    const rewriteMock = mockModel(JSON.stringify({ text: "Core idea\nNew." }));
    const rewrite = await draftPOST(
      post("/api/script/draft", {
        world,
        channelId: "game",
        partId: "part-1",
        mode: "rewrite",
        text: "Core idea\nOld.",
        selection: "Old.",
      }),
    );
    expect(rewrite.status).toBe(200);
    const [, rewriteInit] = rewriteMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const rewriteBody = JSON.parse(rewriteInit.body as string) as {
      instructions: string;
    };
    expect(rewriteBody.instructions).toContain("Core idea");

    mockModel(
      JSON.stringify({
        issues: [
          {
            kind: "contradiction",
            quote: "Core idea",
            problem: "The canon says otherwise.",
            replacement: "Core idea, fixed.",
          },
        ],
      }),
    );
    const check = await checkPOST(
      post("/api/script/check", {
        world,
        channelId: "game",
        partId: "part-1",
        text: "Core idea\nOld.",
      }),
    );
    expect(check.status).toBe(200);
  });
});

describe("copy-form draft prompt", () => {
  it("asks for headline, intro, sections and call to action", () => {
    const world = WorldSchema.parse({
      ...makeWorld(),
      channels: [
        ...makeWorld().channels,
        { id: "site", name: "Site", kind: "website", title: "The Site" },
      ],
    });
    const input = scriptDraftInput(world, "site", "part-1", {});
    expect(input).toContain("headline");
    expect(input).toContain("call to action");
    expect(COPY_DRAFT_INSTRUCTIONS).toContain("call to action");
  });
});

describe("upsertScript form", () => {
  it("saves the form derived from the channel kind", () => {
    const world = makeWorld();
    const next = upsertScript(world, "game", "part-1", "Design text.");
    expect(
      next.scripts.find((s) => s.channelId === "game")?.form,
    ).toBe("design");
    const again = upsertScript(next, "series", "part-1", "Scene text.");
    expect(
      again.scripts.find((s) => s.channelId === "series")?.form,
    ).toBe("script");
  });
});

describe("mention helpers", () => {
  const all = [
    { name: "Anukili Ugama", kind: "character" as const },
    { name: "Ada", kind: "character" as const },
    { name: "The stream", kind: "place" as const },
  ];

  it("lists characters then places", () => {
    const names = mentionCandidates(makeWorld()).map((c) => c.name);
    expect(names).toEqual(["Ada", "Anukili Ugama", "The stream"]);
  });

  it("filters as the creator types, case-insensitively", () => {
    expect(filterMentions(all, "")).toHaveLength(3);
    expect(filterMentions(all, "ada").map((c) => c.name)).toEqual(["Ada"]);
    expect(filterMentions(all, "ANUK").map((c) => c.name)).toEqual([
      "Anukili Ugama",
    ]);
    expect(filterMentions(all, "zzz")).toHaveLength(0);
  });

  it("reads the @ query before the caret", () => {
    expect(mentionQueryBeforeCaret("Hello @Ada", 10)).toBe("Ada");
    expect(mentionQueryBeforeCaret("Hello @", 7)).toBe("");
    expect(mentionQueryBeforeCaret("Hello world", 11)).toBe(null);
    expect(mentionQueryBeforeCaret("mail@ada", 8)).toBe(null);
    expect(mentionQueryBeforeCaret("@Ada\nnext", 4)).toBe("Ada");
  });

  it("uppercases a character cue in script form, keeps the exact name elsewhere", () => {
    expect(
      formatMentionName({ name: "Ada", kind: "character" }, "script"),
    ).toBe("ADA");
    expect(formatMentionName({ name: "Ada", kind: "character" }, "design")).toBe(
      "Ada",
    );
    expect(
      formatMentionName({ name: "The stream", kind: "place" }, "script"),
    ).toBe("The stream");
  });

  it("swaps the @ query for the picked name", () => {
    const next = insertMentionAtCaret("Hello @Ad world", 9, "ADA");
    expect(next.text).toBe("Hello ADA world");
    expect(next.caret).toBe("Hello ADA".length);
  });
});

describe("insert bar formatting", () => {
  it("formats each screenplay line", () => {
    expect(insertSnippet("scene")).toBe("INT. LOCATION - DAY\n\n");
    expect(insertSnippet("character")).toBe("CHARACTER\n");
    expect(insertSnippet("dialogue")).toBe("\tDialogue.\n");
    expect(insertSnippet("action")).toMatch(/\n$/);
  });

  it("starts the snippet on its own line", () => {
    const mid = applyInsertAtCaret("Action here.", 12, 12, insertSnippet("scene"));
    expect(mid.text).toBe("Action here.\nINT. LOCATION - DAY\n\n");
    const fresh = applyInsertAtCaret("", 0, 0, insertSnippet("character"));
    expect(fresh.text).toBe("CHARACTER\n");
    expect(fresh.caret).toBe("CHARACTER\n".length);
  });

  it("replaces the selection", () => {
    const next = applyInsertAtCaret("Keep this.", 0, 4, insertSnippet("dialogue"));
    expect(next.text).toBe("\tDialogue.\n this.");
  });
});

describe("applyScriptReplacement", () => {
  const text =
    "Anukili is a small and gentle woman from Lagos. She walks on.";

  it("swaps the quote for the replacement text", () => {
    expect(
      applyScriptReplacement(
        text,
        "Anukili is a small and gentle woman from Lagos.",
        "Anukili is a huge man of the Igbo myth.",
      ),
    ).toBe("Anukili is a huge man of the Igbo myth. She walks on.");
  });

  it("removes the quote when the replacement is empty", () => {
    expect(
      applyScriptReplacement(
        text,
        "Anukili is a small and gentle woman from Lagos. ",
        "",
      ),
    ).toBe("She walks on.");
  });

  it("leaves the text alone when the quote is missing", () => {
    expect(applyScriptReplacement(text, "No such line.", "New line.")).toBe(
      text,
    );
  });
});
