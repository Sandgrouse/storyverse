import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  buildAgentZip,
  gameSetupScript,
  planAgentFiles,
} from "@/lib/package";
import { STUDIO_TEMPLATE_URL } from "@/lib/package";
import { WorldSchema, type World } from "@/lib/world/schemas";

const SERIES_SECRET = "the baby lived because of SERIES_MARKER";
const GAME_SECRET = "the stream hides GAME_MARKER";
const UNSCOPED_SECRET = "nobody may know UNSCOPED_MARKER";
const CHARACTER_SECRET = "a hidden CHAR_SECRET_MARKER scar";
const SERIES_CHANNEL_SECRET = "SERIES_CHANNEL_SECRET why the baby lived";
const GAME_CHANNEL_SECRET = "GAME_CHANNEL_SECRET what the stream keeps";

function makeWorld(): World {
  return WorldSchema.parse({
    id: "test-game",
    title: "Test Game",
    premise: "A premise about the stream.",
    logline: "A logline.",
    characters: [
      {
        id: "ada",
        name: "Ada",
        canon: "Brave and tall.",
        secret: CHARACTER_SECRET,
        artPath: "data:image/webp;base64,QUJD",
        sheet: [
          {
            view: "front",
            imagePath: "data:image/webp;base64,QUJD",
            cutoutPath: "data:image/png;base64,QUJD",
          },
          { view: "left", imagePath: "data:image/webp;base64,QUJD" },
        ],
        voice: { id: "voice-1", name: "Voice One" },
        lines: [
          { id: "line-1", text: "I will cross.", audioPath: "data:audio/mpeg;base64,QUJD" },
        ],
      },
    ],
    locations: [
      { id: "stream", name: "The Stream", description: "Cold water." },
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
        imagePath: "data:image/webp;base64,QUJD",
        characterIds: ["ada"],
      },
      {
        id: "part-2",
        order: 2,
        title: "Crossing",
        summary: "Ada crosses.",
        excerpt: "The water was cold.",
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
      {
        id: "beat-game-1",
        order: 2,
        timeLabel: "Part 1",
        title: "First ripple",
        channelId: "game",
        partId: "part-1",
        unitLabel: "Level 1",
        content: "Guide Ada across the stream.",
        characterIds: ["ada"],
      },
    ],
    secrets: [
      { id: "s-series", text: SERIES_SECRET, knownThrough: ["series"], note: "Shown." },
      { id: "s-game", text: GAME_SECRET, knownThrough: ["game"], note: "Found." },
      { id: "s-none", text: UNSCOPED_SECRET, knownThrough: [], note: "Not placed." },
    ],
    gaps: [],
    scripts: [
      {
        channelId: "game",
        partId: "part-1",
        text: "LEVEL ONE. Ada stands at the bank.",
        updatedAt: 1,
      },
    ],
  });
}

function contentsOf(world: World, channelId: string): string[] {
  return planAgentFiles(world, channelId)
    .filter((file) => !file.missing && file.content !== undefined)
    .map((file) =>
      typeof file.content === "string"
        ? file.content
        : new TextDecoder().decode(file.content),
    );
}

describe("game package layout", () => {
  it("lays the ZIP out like the studio template, at its root", () => {
    const paths = planAgentFiles(makeWorld(), "game").map((f) => f.path);
    for (const expected of [
      "AGENTS.md",
      "project.yaml",
      "README.md",
      "STUDIO-NOTICE.md",
      "design/gdd/game-concept.md",
      "design/narrative/story.md",
      "design/characters/ada.md",
      "design/art-bible.md",
      "design/registry/entities.yaml",
      "docs/story/part-1/brief.md",
      "docs/story/part-1/script.txt",
      "docs/engine-reference/godot/README.md",
      "production/stage.md",
      "src/.gitkeep",
      "assets/characters/ada/sheet/front.webp",
      "assets/characters/ada/cutouts/front.png",
      "assets/characters/ada/voice.json",
      "assets/characters/ada/voice/line-1.mp3",
      "assets/scenes/part-1/art.webp",
      ".agents/README.md",
      "scripts/setup-studio.sh",
    ]) {
      expect(paths, `missing ${expected}`).toContain(expected);
    }
    // Uncovered parts stay out; unmade sketches stay out, never missing.
    expect(paths.some((p) => p.includes("part-2"))).toBe(false);
    expect(planAgentFiles(makeWorld(), "game").some((f) => f.missing)).toBe(false);
  });

  it("names AGENTS.md, never CLAUDE.md or .claude/", () => {
    const paths = planAgentFiles(makeWorld(), "game").map((f) => f.path);
    expect(paths).toContain("AGENTS.md");
    expect(paths.some((p) => p.includes("CLAUDE.md"))).toBe(false);
    expect(paths.some((p) => p.includes(".claude"))).toBe(false);
    expect(paths.some((p) => p.includes(".agents"))).toBe(true);
  });

  it("writes project rules with the secret rule and real names", () => {
    const files = planAgentFiles(makeWorld(), "game");
    const agents = files.find((f) => f.path === "AGENTS.md")?.content as string;
    expect(agents).toContain("The Game");
    expect(agents).toContain("Engine: Godot 4");
    expect(agents).toContain("Language: GDScript");
    expect(agents).toContain("may know only its own secret");
    expect(agents).toContain(GAME_CHANNEL_SECRET);
    expect(agents).toContain("real names only");
    expect(agents).toContain("design/");
    expect(agents).toContain("production/");
    const yaml = files.find((f) => f.path === "project.yaml")?.content as string;
    expect(yaml).toContain("schema_version: 1");
    expect(yaml).toContain("engine: godot");
    expect(yaml).toContain("Test Game");
    expect(yaml).toContain("game");
  });

  it("keeps only this channel's secret in every game file", () => {
    for (const content of contentsOf(makeWorld(), "game")) {
      expect(content).not.toContain("SERIES_MARKER");
      expect(content).not.toContain("UNSCOPED_MARKER");
      expect(content).not.toContain("CHAR_SECRET_MARKER");
      expect(content).not.toContain("SERIES_CHANNEL_SECRET");
    }
    expect(contentsOf(makeWorld(), "game").join("\n")).toContain("GAME_MARKER");
  });

  it("uses the saved game-design script when there is one", () => {
    const files = planAgentFiles(makeWorld(), "game");
    const concept = files.find((f) => f.path === "design/gdd/game-concept.md")
      ?.content as string;
    expect(concept).toContain("LEVEL ONE. Ada stands at the bank.");
    const story = files.find((f) => f.path === "design/narrative/story.md")
      ?.content as string;
    expect(story).toContain("Beginnings");
    expect(story).toContain("Guide Ada across the stream.");
    const ada = files.find((f) => f.path === "design/characters/ada.md")
      ?.content as string;
    expect(ada).toContain("Brave and tall.");
    expect(ada).toContain("Voice One");
    expect(ada).toContain("I will cross.");
  });

  it("builds the concept from the canon when no game script exists", () => {
    const world = { ...makeWorld(), scripts: [] };
    const files = planAgentFiles(world, "game");
    const concept = files.find((f) => f.path === "design/gdd/game-concept.md")
      ?.content as string;
    expect(concept).toContain("built from the canon");
    expect(concept).toContain("A premise about the stream.");
    expect(files.some((f) => f.path === "docs/story/part-1/script.txt")).toBe(false);
  });

  it("credits the template and warns the agents are untested", () => {
    const files = planAgentFiles(makeWorld(), "game");
    const notice = files.find((f) => f.path === "STUDIO-NOTICE.md")
      ?.content as string;
    expect(notice).toContain("Claude Code Game Studios");
    expect(notice).toContain(STUDIO_TEMPLATE_URL);
    expect(notice).toContain("MIT");
    expect(notice).toContain(
      "See LICENSE in the template, copied by setup-studio.sh.",
    );
    expect(notice).toContain("have not been tested with Muse Code");
    const readme = files.find((f) => f.path === ".agents/README.md")
      ?.content as string;
    expect(readme).toContain("scripts/setup-studio.sh");
    const engine = files.find(
      (f) => f.path === "docs/engine-reference/godot/README.md",
    )?.content as string;
    expect(engine).toContain(STUDIO_TEMPLATE_URL);
  });

  it("ships a setup script that needs git and reports what it did", () => {
    const script = gameSetupScript();
    expect(script).toContain("set -euo pipefail");
    expect(script).toContain("command -v git");
    expect(script).toContain(".agents");
    expect(script).toContain("AGENTS.md");
    expect(script).toContain("Muse Code");
    // Replacements skip LICENSE.
    expect(script).toContain("LICENSE");
    expect(script).toContain("echo");
  });

  it("marks the setup script executable in the ZIP", async () => {
    const { blob, files } = await buildAgentZip(makeWorld(), "game");
    expect(files.some((f) => f.missing)).toBe(false);
    const zip = await JSZip.loadAsync(blob);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]?.dir);
    for (const file of files) {
      expect(names).toContain(file.path);
    }
    const setup = zip.files["scripts/setup-studio.sh"];
    expect((Number(setup?.unixPermissions ?? 0) & 0o111)).not.toBe(0);
    const agents = zip.files["AGENTS.md"];
    expect((Number(agents?.unixPermissions ?? 0) & 0o111)).toBe(0);
    expect(names.some((n) => n.includes("CLAUDE.md"))).toBe(false);
  });

  it("reports Concept with what is made and not made yet", () => {
    const files = planAgentFiles(makeWorld(), "game");
    const stage = files.find((f) => f.path === "production/stage.md")
      ?.content as string;
    expect(stage).toContain("Concept");
    expect(stage).toContain("Scene art: Beginnings");
    expect(stage).toContain("Design: Beginnings");
    // A game needs no storyboards or video: neither is listed.
    expect(stage).not.toContain("Storyboard");
    expect(stage).not.toContain("Video");
  });

  it("keeps the current layout for other kinds", () => {
    const paths = planAgentFiles(makeWorld(), "series").map((f) => f.path);
    expect(paths.every((p) => p.startsWith("test-game-series/"))).toBe(true);
    expect(paths).toContain("test-game-series/AGENT_BRIEF.md");
    expect(paths.some((p) => p === "AGENTS.md")).toBe(false);
  });

  it("returns no files for an unknown channel", () => {
    expect(planAgentFiles(makeWorld(), "missing")).toEqual([]);
  });
});
