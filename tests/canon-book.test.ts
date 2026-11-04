import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ChannelKindSchema,
  WorldSchema,
} from "@/lib/world/schemas";
import {
  ReadModelOutputSchema,
  readModelJsonSchema,
} from "@/lib/read";
import { planModelJsonSchema } from "@/lib/plan";
import {
  aliasesFor,
  bookPassageForPart,
  chapterCountFor,
  coverChips,
  highlightPassage,
  placeArtFor,
} from "@/lib/canon";
import { mergeWorldAssets } from "@/lib/projects";
import { backFor } from "@/lib/nav";

async function loadSeed() {
  const raw = await readFile(
    join(process.cwd(), "data", "seed", "anukili.json"),
    "utf-8",
  );
  return WorldSchema.parse(JSON.parse(raw));
}

async function loadTreatmentSection(heading: string): Promise<string> {
  const raw = await readFile(
    join(process.cwd(), "docs", "story", "anukili-treatment.md"),
    "utf-8",
  );
  const start = raw.indexOf(heading);
  const rest = raw.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

describe("canon schemas", () => {
  it("uses the channel kinds in exactly the shared order", () => {
    expect(ChannelKindSchema.options).toEqual([
      "game",
      "series",
      "shorts",
      "press",
      "film",
      "website",
      "ad",
      "other",
    ]);
  });

  it("returns facts and each part's text from the read model", () => {
    const canon = ReadModelOutputSchema.parse({
      title: "T",
      logline: "L.",
      parts: [{ id: "p1", order: 1, title: "One" }],
      facts: [{ id: "f1", label: "Genre", value: "", source: "muse" }],
    });
    expect(canon.parts[0].text).toBe("");
    expect(canon.facts).toEqual([
      { id: "f1", label: "Genre", value: "", source: "muse" },
    ]);
    const schema = readModelJsonSchema() as {
      required: string[];
      properties: {
        parts: { items: { required: string[]; properties: Record<string, { type: string | string[] }> } };
        facts: { items: { required: string[]; properties: Record<string, { type: string | string[] }> } };
      };
    };
    expect(schema.required).toContain("facts");
    expect(schema.properties.parts.items.required).toContain("text");
    expect(schema.properties.parts.items.properties.text.type).toEqual([
      "string",
      "null",
    ]);
    expect(schema.properties.facts.items.required).toEqual([
      "id",
      "label",
      "value",
      "source",
    ]);
    expect(schema.properties.facts.items.properties.value.type).toEqual([
      "string",
      "null",
    ]);
  });

  it("sends the extended kinds to the plan model", () => {
    const schema = planModelJsonSchema({
      title: "T",
      logline: "",
      characters: [],
      locations: [],
      parts: [],
      facts: [],
      gaps: [],
    }) as {
      properties: {
        channels: { items: { properties: { kind: { enum: string[] } } } };
      };
    };
    expect(
      schema.properties.channels.items.properties.kind.enum,
    ).toEqual([
      "game",
      "series",
      "shorts",
      "press",
      "film",
      "website",
      "ad",
      "other",
    ]);
  });
});

describe("anukili seed canon", () => {
  it("sets each part's text verbatim from the treatment", async () => {
    const world = await loadSeed();
    const headings = [
      "## Part 1: The Omen",
      "## Part 2: The Weight",
      "## Part 3: The Stream",
      "## Part 4: The Pots",
      "## Part 5: The Fire",
    ];
    expect(world.parts).toHaveLength(headings.length);
    for (let i = 0; i < headings.length; i++) {
      const expected = await loadTreatmentSection(headings[i] as string);
      expect(world.parts[i].text, `part ${i + 1} text`).toBe(expected);
    }
  });

  it("sets the facts exactly as the prototype shows", async () => {
    const world = await loadSeed();
    expect(world.facts).toEqual([
      { id: "fact-kind", label: "Kind of story", value: "Myth retold as fiction", source: "material" },
      { id: "fact-genre", label: "Genre", value: "Mythic tragedy", source: "muse" },
      { id: "fact-where", label: "Where", value: "Aguleri, with its stream and the Omabala River", source: "material" },
      { id: "fact-when", label: "When", value: "A mythic past, before anyone wrote anything down", source: "material" },
      { id: "fact-tone", label: "Tone", value: "Dark, mythic, fearful", source: "muse" },
      { id: "fact-told-as", label: "Told as", value: "A series, a game and shorts", source: "material" },
      { id: "fact-themes", label: "Themes", value: "Power without limit · A hero who turns on his own people · Whether the mighty can fall", source: "muse" },
      { id: "fact-audience", label: "Who it's for", value: "", source: "muse" },
      { id: "fact-voice", label: "Language and voice", value: "", source: "muse" },
    ]);
  });
});

describe("highlight matching", () => {
  const world = {
    characters: [
      { id: "anukili", name: "Anukili Ugama" },
      { id: "people", name: "The people of Eziagulu" },
    ],
    locations: [
      { id: "aguleri", name: "Aguleri" },
      { id: "stream", name: "The stream" },
    ],
  };

  it("matches whole names case-insensitively", () => {
    const segments = highlightPassage(
      "ANUKILI UGAMA met Enyinyi in AGULERI.",
      {
        characters: [...world.characters, { id: "enyinyi", name: "Enyinyi" }],
        locations: world.locations,
      },
    );
    const lit = segments.filter((s) => s.kind !== null);
    expect(lit.map((s) => s.id)).toEqual(["anukili", "enyinyi", "aguleri"]);
    expect(lit[0].kind).toBe("character");
    expect(lit[2].kind).toBe("place");
  });

  it("matches the name without a leading The", () => {
    expect(aliasesFor("The stream")).toEqual(["The stream", "stream"]);
    const segments = highlightPassage(
      "Water comes from the stream.",
      world,
    );
    const lit = segments.filter((s) => s.kind !== null);
    expect(lit).toHaveLength(1);
    expect(lit[0]).toMatchObject({ id: "stream", kind: "place" });
    const people = highlightPassage("people of Eziagulu vowed.", world);
    expect(
      people.filter((s) => s.kind !== null),
    ).toMatchObject([{ text: "people of Eziagulu", kind: "character", id: "people" }]);
  });

  it("never matches partial words", () => {
    const segments = highlightPassage(
      "Agulerians streamed past.",
      world,
    );
    expect(segments.filter((s) => s.kind !== null)).toEqual([]);
  });
});

describe("book passages", () => {
  it("falls back to summary and excerpt when a part has no text", () => {
    expect(
      bookPassageForPart({ summary: "Born holding roots.", excerpt: "A retelling.", text: "" }),
    ).toBe("Born holding roots. A retelling.");
  });

  it("counts the chapters that mention a name", async () => {
    const world = await loadSeed();
    // Whole names only: the texts say "Enyinyi" and "Aguleri" verbatim.
    expect(chapterCountFor("enyinyi", "character", world)).toBe(2);
    expect(chapterCountFor("aguleri", "place", world)).toBe(2);
    expect(chapterCountFor("stream", "place", world)).toBe(1);
    // "Anukili Ugama" never appears in full, so it counts nothing.
    expect(chapterCountFor("anukili-ugama", "character", world)).toBe(0);
    expect(chapterCountFor("nobody", "character", world)).toBe(0);
  });

  it("draws the cover chips from the facts", async () => {
    const world = await loadSeed();
    const chips = coverChips(world);
    expect(chips[chips.length - 1]).toBe("5 chapters · 4 characters · 4 places");
    expect(chips.slice(0, -1)).toEqual(
      world.facts
        .filter((fact) => fact.value.trim().length > 0)
        .slice(0, 3)
        .map((fact) => fact.value),
    );
  });
});

describe("empty facts", () => {
  it("treats an empty value as not in the material yet", async () => {
    const world = await loadSeed();
    const empty = world.facts.filter((fact) => fact.value === "");
    expect(empty.length).toBeGreaterThan(0);
    for (const fact of empty) {
      expect(fact.source).not.toBe("material");
    }
  });
});

describe("mergeWorldAssets", () => {
  it("keeps facts and part text from the old world", async () => {
    const oldWorld = await loadSeed();
    const nextWorld = WorldSchema.parse({
      ...JSON.parse(JSON.stringify(oldWorld)),
      facts: [],
      parts: oldWorld.parts.map((part) => ({ ...part, text: "" })),
    });
    const merged = mergeWorldAssets(oldWorld, nextWorld);
    expect(merged.facts).toEqual(oldWorld.facts);
    for (let i = 0; i < merged.parts.length; i++) {
      expect(merged.parts[i].text).toBe(oldWorld.parts[i].text);
    }
  });

  it("prefers the next world's facts when it has its own", async () => {
    const oldWorld = await loadSeed();
    const nextWorld = WorldSchema.parse({
      ...JSON.parse(JSON.stringify(oldWorld)),
      facts: [
        { id: "f1", label: "Genre", value: "Epic", source: "you" },
      ],
    });
    expect(mergeWorldAssets(oldWorld, nextWorld).facts).toEqual(
      nextWorld.facts,
    );
  });
});

describe("canon navigation", () => {
  it("sends Back on the canon page to the Story Book view", () => {
    expect(backFor("/projects/abc/canon")).toBe(
      "/projects/abc/story?view=book",
    );
  });
});

describe("place art", () => {
  const world = {
    characters: [],
    locations: [
      { id: "stream", name: "The stream" },
      { id: "aguleri", name: "Aguleri" },
      { id: "nowhere", name: "Nowhere" },
    ],
    parts: [
      { id: "p1", order: 1, title: "One", summary: "Born in Aguleri.", excerpt: "A retelling.", text: "", imagePath: "first-art" },
      { id: "p2", order: 2, title: "Two", summary: "Walking on.", excerpt: "Still walking.", text: "They reached the stream at dusk.", imagePath: "stream-art" },
    ],
  };

  it("uses the art of the first part whose text names the place", () => {
    expect(placeArtFor({ id: "stream", name: "The stream" }, world)).toBe("stream-art");
  });

  it("matches a summary when the text does not name the place", () => {
    expect(placeArtFor({ id: "aguleri", name: "Aguleri" }, world)).toBe("first-art");
  });

  it("falls back to the first part's art when no part names the place", () => {
    expect(placeArtFor({ id: "nowhere", name: "Nowhere" }, world)).toBe("first-art");
  });

  it("matches whole names only, case-insensitively", () => {
    const streamed = {
      ...world,
      parts: [
        { id: "p1", order: 1, title: "One", summary: "Agulerians streamed past.", excerpt: "", text: "", imagePath: "first-art" },
      ],
    };
    expect(placeArtFor({ id: "stream", name: "The stream" }, streamed)).toBe("first-art");
    expect(placeArtFor({ id: "aguleri", name: "Aguleri" }, streamed)).toBe("first-art");
  });
});
