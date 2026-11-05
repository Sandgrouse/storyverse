import { execFile, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  RAEA_GAME_EDIT,
  raeaGameReadme,
  raeaStoryTs,
} from "@/lib/raea-game";
import { planAgentFiles, planGameFiles } from "@/lib/package";
import { WorldSchema, type World } from "@/lib/world/schemas";

const execFileAsync = promisify(execFile);

const GAME_SECRET = "the stream hides GAME_MARKER";
const SERIES_SECRET = "the baby lived because of SERIES_MARKER";
const SERIES_CHANNEL_SECRET = "SERIES_CHANNEL_SECRET why the baby lived";
const GAME_CHANNEL_SECRET = "GAME_CHANNEL_SECRET what the stream keeps";

function dataUrl(mime: string, marker: string): string {
  return `data:${mime};base64,${Buffer.from(marker).toString("base64")}`;
}

function makeWorld(overrides: {
  channels?: Array<{
    id: string;
    name: string;
    kind: "series" | "game";
    title: string;
    secret?: string;
  }>;
  parts?: Array<{
    id: string;
    order: number;
    title: string;
    summary: string;
    excerpt: string;
    imagePath: string;
    characterIds: string[];
  }>;
  beats?: Array<{
    id: string;
    order: number;
    timeLabel: string;
    title: string;
    channelId: string;
    partId: string;
    unitLabel: string;
    content: string;
    characterIds: string[];
  }>;
  characters?: Array<{
    id: string;
    name: string;
    canon: string;
    sheet: Array<{ view: string; imagePath: string; cutoutPath?: string }>;
  }>;
  secrets?: Array<{
    id: string;
    text: string;
    knownThrough: string[];
    note: string;
  }>;
}): World {
  return WorldSchema.parse({
    id: "test-game",
    title: "Test Game",
    premise: "A premise about the stream.",
    logline: "A logline.",
    characters: overrides.characters ?? [
      {
        id: "ada",
        name: "Ada",
        canon: "Brave and tall.",
        sheet: [
          {
            view: "front",
            imagePath: dataUrl("image/webp", "sheet-front"),
            cutoutPath: dataUrl("image/png", "cutout-front"),
          },
        ],
      },
    ],
    locations: [],
    channels: overrides.channels ?? [
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
    parts: overrides.parts ?? [
      {
        id: "part-1",
        order: 1,
        title: "Beginnings",
        summary: "Ada arrives.",
        excerpt: "She came at dawn.",
        imagePath: dataUrl("image/webp", "scene-one"),
        characterIds: ["ada"],
      },
    ],
    beats: overrides.beats ?? [
      {
        id: "beat-game-1",
        order: 1,
        timeLabel: "Part 1",
        title: "First ripple",
        channelId: "game",
        partId: "part-1",
        unitLabel: "Level 1",
        content: "Guide Ada across the stream.",
        characterIds: ["ada"],
      },
    ],
    secrets: overrides.secrets ?? [
      { id: "s-game", text: GAME_SECRET, knownThrough: ["game"], note: "Found." },
      { id: "s-series", text: SERIES_SECRET, knownThrough: ["series"], note: "Shown." },
    ],
    gaps: [],
  });
}

function raeaFiles(world: World, channelId = "game") {
  return planGameFiles(world, channelId).filter((file) =>
    file.path.startsWith("raea/"),
  );
}

function storyOf(world: World, channelId = "game"): string {
  const story = raeaFiles(world, channelId).find(
    (file) => file.path === "raea/story.ts",
  )?.content;
  expect(typeof story).toBe("string");
  return story as string;
}

/** Parse a `export const NAME = <json>;` line back to its value. */
function constValue(text: string, name: string): unknown {
  const match = new RegExp(
    `export const ${name} = (null|"(?:[^"\\\\]|\\\\.)*")`,
  ).exec(text);
  expect(match, `missing ${name}`).not.toBeNull();
  return JSON.parse(match![1] as string);
}

/** Parse the SCENES rows back to title/art pairs. */
function sceneRows(text: string): Array<{ title: string; art: string | null }> {
  const rows = text.split("\n").filter((line) => line.startsWith("  {"));
  return rows.map((row) => {
    const title = /title: (null|"(?:[^"\\]|\\.)*")/.exec(row);
    const art = /art: (null|"(?:[^"\\]|\\.)*")/.exec(row);
    expect(title, `bad row ${row}`).not.toBeNull();
    expect(art, `bad row ${row}`).not.toBeNull();
    return {
      title: JSON.parse(title![1] as string) as string,
      art: JSON.parse(art![1] as string) as string | null,
    };
  });
}

describe("raea game folder", () => {
  it("appears for a game channel that covers a part, and not for one covering none", () => {
    const paths = raeaFiles(makeWorld({})).map((file) => file.path);
    expect(paths).toContain("raea/README.md");
    expect(paths).toContain("raea/edit.tsx");
    expect(paths).toContain("raea/story.ts");
    expect(paths).toContain("raea/media/hero.png");
    expect(paths).toContain("raea/media/scene-01.webp");
    const types = raeaFiles(makeWorld({})).map((file) => file.type);
    expect(types).toContain("raea-readme");
    expect(types).toContain("raea-edit");
    expect(types).toContain("raea-data");
    expect(types).toContain("raea-media");

    const empty = makeWorld({ beats: [] });
    expect(raeaFiles(empty)).toEqual([]);
  });

  it("orders scenes by order and leaves uncovered parts out", () => {
    const world = makeWorld({
      parts: [
        {
          id: "part-2",
          order: 2,
          title: "Crossing",
          summary: "Ada crosses.",
          excerpt: "The water was cold.",
          imagePath: dataUrl("image/png", "scene-two"),
          characterIds: ["ada"],
        },
        {
          id: "part-1",
          order: 1,
          title: "Beginnings",
          summary: "Ada arrives.",
          excerpt: "She came at dawn.",
          imagePath: dataUrl("image/webp", "scene-one"),
          characterIds: ["ada"],
        },
        {
          id: "part-9",
          order: 9,
          title: "UNCOVERED_PART_TITLE",
          summary: "Never told here.",
          excerpt: "UNCOVERED_PART_EXCERPT",
          imagePath: dataUrl("image/png", "UNCOVERED_PART_IMAGE"),
          characterIds: ["ada"],
        },
      ],
      beats: [
        {
          id: "beat-game-2",
          order: 2,
          timeLabel: "Part 2",
          title: "Second ripple",
          channelId: "game",
          partId: "part-2",
          unitLabel: "Level 2",
          content: "Cross.",
          characterIds: ["ada"],
        },
        {
          id: "beat-game-1",
          order: 1,
          timeLabel: "Part 1",
          title: "First ripple",
          channelId: "game",
          partId: "part-1",
          unitLabel: "Level 1",
          content: "Arrive.",
          characterIds: ["ada"],
        },
        {
          id: "beat-series-9",
          order: 3,
          timeLabel: "Part 9",
          title: "Elsewhere",
          channelId: "series",
          partId: "part-9",
          unitLabel: "Episode 9",
          content: "Told on another channel.",
          characterIds: ["ada"],
        },
      ],
    });
    const story = storyOf(world);
    expect(sceneRows(story).map((row) => row.title)).toEqual([
      "Beginnings",
      "Crossing",
    ]);
    expect(sceneRows(story).map((row) => row.art)).toEqual([
      "scene-01.webp",
      "scene-02.png",
    ]);
    const text = raeaFiles(world)
      .map((file) =>
        typeof file.content === "string"
          ? file.content
          : Buffer.from(file.content ?? []).toString("latin1"),
      )
      .join("\n");
    expect(text).not.toContain("UNCOVERED_PART_TITLE");
    expect(text).not.toContain("UNCOVERED_PART_EXCERPT");
    expect(text).not.toContain("UNCOVERED_PART_IMAGE");
    expect(text).not.toContain("part-9");
  });

  it("gives art null for a scene with no art and HERO null with no character art", () => {
    const world = makeWorld({
      parts: [
        {
          id: "part-1",
          order: 1,
          title: "Beginnings",
          summary: "Ada arrives.",
          excerpt: "She came at dawn.",
          imagePath: "",
          characterIds: ["ada"],
        },
        {
          id: "part-2",
          order: 2,
          title: "Mystery",
          summary: "Nothing drawn.",
          excerpt: "Dark.",
          imagePath: "not-a-data-url",
          characterIds: ["ada"],
        },
        {
          id: "part-3",
          order: 3,
          title: "Strange",
          summary: "Unknown type.",
          excerpt: "Odd.",
          imagePath: dataUrl("image/gif", "nope"),
          characterIds: ["ada"],
        },
      ],
      beats: ["part-1", "part-2", "part-3"].map((partId, index) => ({
        id: `beat-game-${index}`,
        order: index + 1,
        timeLabel: `Part ${index + 1}`,
        title: `Ripple ${index + 1}`,
        channelId: "game",
        partId,
        unitLabel: `Level ${index + 1}`,
        content: "Play.",
        characterIds: ["ada"],
      })),
      characters: [
        { id: "ada", name: "Ada", canon: "Brave and tall.", sheet: [] },
      ],
    });
    const story = storyOf(world);
    expect(constValue(story, "HERO")).toBeNull();
    expect(sceneRows(story)).toEqual([
      { title: "Beginnings", art: null },
      { title: "Mystery", art: null },
      { title: "Strange", art: null },
    ]);
    const paths = raeaFiles(world).map((file) => file.path);
    expect(paths.some((path) => path.startsWith("raea/media/"))).toBe(false);
  });

  it("prefers a cut-out over a sheet image, and front over other views", () => {
    const world = makeWorld({
      characters: [
        {
          id: "ada",
          name: "Ada",
          canon: "Brave and tall.",
          sheet: [
            {
              view: "front",
              imagePath: dataUrl("image/webp", "front-sheet"),
              cutoutPath: dataUrl("image/gif", "front-cutout-bad"),
            },
            {
              view: "left",
              imagePath: dataUrl("image/webp", "left-sheet"),
              cutoutPath: dataUrl("image/png", "left-cutout"),
            },
          ],
        },
      ],
    });
    // The front cut-out is an unknown type, so the left cut-out wins
    // over the front sheet image: cut-out beats sheet.
    expect(constValue(storyOf(world), "HERO")).toBe("hero.png");

    const front = makeWorld({
      characters: [
        {
          id: "ada",
          name: "Ada",
          canon: "Brave and tall.",
          sheet: [
            {
              view: "left",
              imagePath: dataUrl("image/webp", "left-sheet"),
              cutoutPath: dataUrl("image/png", "left-cutout"),
            },
            {
              view: "front",
              imagePath: dataUrl("image/webp", "front-sheet"),
              cutoutPath: dataUrl("image/webp", "front-cutout"),
            },
          ],
        },
      ],
    });
    // Both cut-outs decode, so the front one wins: front beats others.
    expect(constValue(storyOf(front), "HERO")).toBe("hero.webp");
  });

  it("uses the first character with any usable image", () => {
    const world = makeWorld({
      characters: [
        { id: "nope", name: "Nope", canon: "No art.", sheet: [] },
        {
          id: "ada",
          name: "Ada",
          canon: "Brave and tall.",
          sheet: [
            { view: "front", imagePath: dataUrl("image/png", "ada-sheet") },
          ],
        },
      ],
    });
    expect(constValue(storyOf(world), "HERO")).toBe("hero.png");
  });

  it("keeps a title holding quotes valid", () => {
    const title = 'Ada\'s "Hunt" \\ at dawn';
    const world = makeWorld({
      channels: [
        { id: "series", name: "Series", kind: "series", title: "The Series" },
        { id: "game", name: "Game", kind: "game", title },
      ],
      parts: [
        {
          id: "part-1",
          order: 1,
          title: 'The "Stream"',
          summary: "Ada arrives.",
          excerpt: "She came at dawn.",
          imagePath: dataUrl("image/webp", "scene-one"),
          characterIds: ["ada"],
        },
      ],
    });
    const story = storyOf(world);
    expect(constValue(story, "TITLE")).toBe(title);
    expect(sceneRows(story)).toEqual([{ title: 'The "Stream"', art: "scene-01.webp" }]);
    expect(raeaGameReadme(title)).toContain(`# ${title}: raea starter`);
  });

  it("titles the starter like the game docs: title, then name, then id", () => {
    const titled = makeWorld({});
    expect(constValue(storyOf(titled), "TITLE")).toBe("The Game");
    const named = makeWorld({
      channels: [
        { id: "series", name: "Series", kind: "series", title: "The Series" },
        { id: "game", name: "Game", kind: "game", title: "" },
      ],
    });
    expect(constValue(storyOf(named), "TITLE")).toBe("Game");
  });

  it("holds no secret of any channel in any raea/ file", () => {
    const files = raeaFiles(makeWorld({}));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text =
        typeof file.content === "string"
          ? file.content
          : Buffer.from(file.content ?? []).toString("latin1");
      expect(text).not.toContain("GAME_MARKER");
      expect(text).not.toContain("SERIES_MARKER");
      expect(text).not.toContain("SERIES_CHANNEL_SECRET");
      expect(text).not.toContain("GAME_CHANNEL_SECRET");
    }
  });
});

describe("RAEA_GAME_EDIT", () => {
  it("imports from raea and never from remotion", () => {
    expect(RAEA_GAME_EDIT).toContain('from "raea"');
    expect(RAEA_GAME_EDIT).toContain('from "raea/arena"');
    expect(RAEA_GAME_EDIT).toContain("./story");
    expect(RAEA_GAME_EDIT).not.toContain("remotion");
  });

  it("holds no backticks or backslashes", () => {
    expect(RAEA_GAME_EDIT).not.toContain("`");
    expect(RAEA_GAME_EDIT).not.toContain("\\");
  });
});

describe("raeaStoryTs", () => {
  it("matches the documented shape", () => {
    expect(
      raeaStoryTs("The hunt", "hero.png", [
        { title: "The Stream", art: "scene-01.webp" },
        { title: "The Pots", art: "scene-02.png" },
        { title: "The Fire", art: null },
      ]),
    ).toBe(
      'export const TITLE = "The hunt";\n' +
        'export const HERO = "hero.png" as string | null;\n' +
        "export const SCENES = [\n" +
        '  { title: "The Stream", art: "scene-01.webp" as string | null },\n' +
        '  { title: "The Pots", art: "scene-02.png" as string | null },\n' +
        '  { title: "The Fire", art: null as string | null },\n' +
        "];\n",
    );
  });
});

describe("raeaGameReadme", () => {
  it("fills in the title and points at the engine", () => {
    const text = raeaGameReadme("The Game");
    expect(text).toContain("# The Game: raea starter");
    expect(text).toContain("raea play edit.tsx");
    expect(text).toContain("https://raea.io");
    expect(text).toContain("`raea guide games`");
  });
});

describe("game docs mention the starter", () => {
  it("names raea/ in AGENTS.md and README.md only when the folder is there", () => {
    const withFolder = planAgentFiles(makeWorld({}), "game");
    const agents = withFolder.find((file) => file.path === "AGENTS.md")
      ?.content as string;
    expect(agents).toContain(
      "`raea/` holds an optional starter for the raea engine. Use it only if the owner asks to build in raea; otherwise build in Godot 4.",
    );
    const readme = withFolder.find((file) => file.path === "README.md")
      ?.content as string;
    expect(readme).toContain("raea/README.md");

    const withoutFolder = planAgentFiles(makeWorld({ beats: [] }), "game");
    expect(
      withoutFolder.some((file) => file.path.startsWith("raea/")),
    ).toBe(false);
    const plainAgents = withoutFolder.find(
      (file) => file.path === "AGENTS.md",
    )?.content as string;
    expect(plainAgents).not.toContain("raea/");
    const plainReadme = withoutFolder.find(
      (file) => file.path === "README.md",
    )?.content as string;
    expect(plainReadme).not.toContain("raea/");
  });
});

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A small real PNG (zlib-compressed) that a renderer can decode. */
function realPng(width: number, height: number): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      raw[row + 1 + x * 3] = 180;
      raw[row + 1 + x * 3 + 1] = 120;
      raw[row + 1 + x * 3 + 2] = 60;
    }
  }
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const hasRaea = (() => {
  try {
    execFileSync("raea", ["help"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

it.skipIf(!hasRaea)(
  "renders a raea game starter frame with the raea CLI",
  async (ctx) => {
    const art = (bytes: Uint8Array): string =>
      `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
    const world = makeWorld({
      characters: [
        {
          id: "ada",
          name: "Ada",
          canon: "Brave and tall.",
          sheet: [
            { view: "front", imagePath: art(realPng(32, 48)) },
          ],
        },
      ],
      parts: [
        {
          id: "part-1",
          order: 1,
          title: "Beginnings",
          summary: "Ada arrives.",
          excerpt: "She came at dawn.",
          imagePath: art(realPng(64, 36)),
          characterIds: ["ada"],
        },
      ],
    });
    const files = planGameFiles(world, "game");
    const edit = files.find((file) => file.type === "raea-edit");
    expect(edit?.content).toBe(RAEA_GAME_EDIT);
    const dir = await mkdtemp(join(tmpdir(), "raea-game-test-"));
    for (const file of files) {
      if (!file.path.startsWith("raea/") || file.content === undefined) {
        continue;
      }
      const target = join(dir, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(
        target,
        typeof file.content === "string" ? file.content : Buffer.from(file.content),
      );
    }
    const cwd = join(dir, "raea");
    try {
      await execFileAsync("raea", ["render", "edit.tsx", "-o", "frame.png", "--frame", "0"], {
        cwd,
        timeout: 120000,
      });
    } catch (error) {
      // raea renders on the GPU; a machine with the CLI but no graphics
      // adapter cannot render, so the test skips instead of failing.
      const err = error as { stderr?: unknown; stdout?: unknown };
      const output = `${String(err.stderr ?? "")} ${String(err.stdout ?? "")} ${String(error)}`;
      if (/no suitable graphics adapter|unable to find a gpu/i.test(output)) {
        ctx.skip();
        return;
      }
      throw error;
    }
    const rendered = await stat(join(cwd, "frame.png"));
    expect(rendered.size).toBeGreaterThan(0);
  },
  180000,
);
