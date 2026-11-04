import { readFile } from "node:fs/promises";
import { join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorldSchema, type World } from "@/lib/world/schemas";
import CastDrawer from "@/components/experience/CastDrawer";
import PackDrawer from "@/components/experience/PackDrawer";

function emptyWorld(): World {
  return WorldSchema.parse({
    id: "empty-story",
    title: "Empty Story",
    premise: "Nothing yet.",
    logline: "Nothing yet.",
    characters: [],
    locations: [],
    channels: [],
    parts: [],
    beats: [],
    secrets: [],
    gaps: [],
  });
}

function worldWithSheet(): World {
  const base = emptyWorld();
  return {
    ...base,
    characters: [
      {
        id: "ada",
        name: "Ada",
        canon: "Brave and tall.",
        artPath: undefined,
        sheet: [
          { view: "front", imagePath: "sheet-front-marker" },
          {
            view: "left",
            imagePath: "sheet-left-marker",
            cutoutPath: "cutout-left-marker",
          },
        ],
      },
    ],
  };
}

describe("CastDrawer reload", () => {
  it("shows sheet images from the world, not local state", () => {
    const noop = () => {};
    const html = renderToString(
      <CastDrawer world={worldWithSheet()} open onClose={noop} onWorld={noop} />,
    );
    expect(html).toContain("sheet-front-marker");
    expect(html).toContain("sheet-left-marker");
    // Only the four views without images offer to make them.
    expect(html.match(/Make this view/g)).toHaveLength(4);
  });

  it("shows cutouts from the world, not local state", () => {
    const noop = () => {};
    const html = renderToString(
      <CastDrawer world={worldWithSheet()} open onClose={noop} onWorld={noop} />,
    );
    expect(html).toContain("cutout-left-marker");
  });

  it("renders a valid world with empty lists", () => {
    const noop = () => {};
    const html = renderToString(
      <CastDrawer world={emptyWorld()} open onClose={noop} onWorld={noop} />,
    );
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("Sheet views");
  });
});

describe("CastDrawer scroll", () => {
  it("drawer scrolls as one column with full-height sections", async () => {
    const css = await readFile(join(process.cwd(), "app", "globals.css"), "utf-8");
    const drawerBlock = css.match(/\.drawer\s*\{[^}]*\}/)?.[0] ?? "";
    expect(drawerBlock, ".drawer must scroll").toContain("overflow-y: auto");
    // Art row, canon text and sheet sections must not shrink away.
    expect(css, "drawer sections must keep full height").toContain("flex-shrink: 0");
    const whoOverride = css.match(/\.drawer\s+\.who\s*\{[^}]*\}/)?.[0] ?? "";
    expect(whoOverride, ".drawer .who must size to its content").toContain("flex: none");
  });
});

describe("PackDrawer empty world", () => {
  it("renders a valid world with empty lists", () => {
    const noop = () => {};
    const html = renderToString(
      <PackDrawer world={emptyWorld()} open onClose={noop} />,
    );
    expect(html.length).toBeGreaterThan(0);
  });
});

function worldWithCast(): World {
  const base = emptyWorld();
  return {
    ...base,
    id: "cast-story",
    channels: [
      {
        id: "series",
        name: "Series",
        kind: "series",
        title: "The Series",
        tagline: "",
        pitch: "",
        secret: "",
        imagePath: "",
      },
    ],
    parts: [
      {
        id: "part-1",
        order: 1,
        title: "Beginnings",
        summary: "Ada arrives.",
        excerpt: "",
        text: "",
        imagePath: "",
        imagePosition: "",
        tint: "",
        characterIds: ["ada", "bob"],
      },
    ],
    beats: [
      {
        id: "beat-1",
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
    characters: [
      {
        id: "ada",
        name: "Ada",
        canon: "Brave and tall.",
        artPath: undefined,
        sheet: [
          { view: "front", imagePath: "sheet-front-marker" },
        ],
      },
      {
        id: "bob",
        name: "Bob",
        canon: "Quiet and quick.",
        artPath: undefined,
        sheet: [],
      },
    ],
  };
}

function worldWithMany(count: number): World {
  const base = emptyWorld();
  return {
    ...base,
    characters: Array.from({ length: count }, (_, i) => ({
      id: `char-${i}`,
      name: `Character ${i}`,
      canon: `Canon ${i}.`,
      artPath: undefined,
      sheet: [],
    })),
  };
}

describe("CastDrawer one at a time", () => {
  it("defaults to the first character and hides the others' detail", () => {
    const noop = () => {};
    const html = renderToString(
      <CastDrawer world={worldWithCast()} open onClose={noop} onWorld={noop} />,
    );
    // The heading names Ada; her canon and art show.
    expect(html).toContain("<h2>Ada</h2>");
    expect(html).toContain("Brave and tall.");
    expect(html).toContain("sheet-front-marker");
    // Bob is in the list, but his canon is nowhere.
    expect(html).toContain("Bob");
    expect(html).not.toContain("Quiet and quick.");
  });

  it("links each appearance to the Script page for it", () => {
    const noop = () => {};
    const html = renderToString(
      <CastDrawer world={worldWithCast()} open onClose={noop} onWorld={noop} />,
    );
    expect(html).toContain("Series");
    expect(html).toContain("script?channel=series");
    expect(html).toContain("part-1");
  });

  it("shows the search box only past 8 characters and scales to 30", () => {
    const noop = () => {};
    const few = renderToString(
      <CastDrawer world={worldWithCast()} open onClose={noop} onWorld={noop} />,
    );
    expect(few).not.toContain("Search characters");
    const many = renderToString(
      <CastDrawer world={worldWithMany(9)} open onClose={noop} onWorld={noop} />,
    );
    expect(many).toContain("Search characters");
    const thirty = renderToString(
      <CastDrawer world={worldWithMany(30)} open onClose={noop} onWorld={noop} />,
    );
    for (let i = 0; i < 30; i += 1) {
      expect(thirty).toContain(`Character ${i}`);
    }
    // Narrow screens get a select with every character.
    expect(thirty).toContain("Choose a character");
  });
});

function worldWithFullSheet(): World {
  const base = emptyWorld();
  return {
    ...base,
    characters: [
      {
        id: "ada",
        name: "Ada",
        canon: "Brave and tall.",
        artPath: undefined,
        sheet: ["front", "left", "right", "back", "walking", "crouching"].map(
          (view) => ({ view, imagePath: `${view}-marker` }),
        ),
      },
    ],
  };
}

describe("CastDrawer sheet states", () => {
  it("hides the draw button and offers the viewer when the sheet is complete", () => {
    const noop = () => {};
    const html = renderToString(
      <CastDrawer
        world={worldWithFullSheet()}
        open
        onClose={noop}
        onWorld={noop}
      />,
    );
    expect(html).toContain("View sheet");
    expect(html).not.toContain("Make the missing poses");
    expect(html).not.toContain("Generate full sheet");
    // Every pose image opens the viewer instead of redrawing.
    expect(html).toContain("View Ada Front");
    // The extra-pose chips and the free text box stay.
    expect(html).toContain("More poses");
    expect(html).toContain("Make this pose");
  });

  it("offers to draw only the missing poses when the sheet is partial", () => {
    const noop = () => {};
    const html = renderToString(
      <CastDrawer world={worldWithSheet()} open onClose={noop} onWorld={noop} />,
    );
    expect(html).toContain("Make the missing poses");
    expect(html).not.toContain("View sheet");
    expect(html).not.toContain("Generate full sheet");
  });
});

describe("CastDrawer views grid", () => {
  it("shows each base view with its cutout action or a make pill", () => {
    const noop = () => {};
    const html = renderToString(
      <CastDrawer world={worldWithSheet()} open onClose={noop} onWorld={noop} />,
    );
    for (const label of ["Front", "Left", "Right", "Back", "Walking", "Crouching"]) {
      expect(html).toContain(label);
    }
    // Left already has a cutout, front can be cut out.
    expect(html).toContain("cutout-left-marker");
    expect(html).toContain("Cut out");
  });

  it("offers the pose chips and a free text box below the sheet actions", () => {
    const noop = () => {};
    const html = renderToString(
      <CastDrawer world={worldWithSheet()} open onClose={noop} onWorld={noop} />,
    );
    // Two of six views exist: the sheet is partial, so the button only
    // draws what is missing and never redraws what exists.
    expect(html).toContain("Make the missing poses");
    expect(html).not.toContain("Generate full sheet");
    expect(html).toContain("Cut out all");
    expect(html).toContain("More poses");
    for (const chip of [
      "Sitting",
      "Running",
      "Fighting stance",
      "Looking back",
      "Arms raised",
      "Close-up face",
    ]) {
      expect(html).toContain(chip);
    }
    expect(html).toContain("Describe another pose");
    expect(html).toContain("Make this pose");
  });

  it("puts custom views last in the grid", () => {
    const noop = () => {};
    const base = worldWithSheet();
    const world: World = {
      ...base,
      characters: base.characters.map((c) =>
        c.id === "ada"
          ? {
              ...c,
              sheet: [...c.sheet, { view: "dancing-joyfully", imagePath: "dancing-marker" }],
            }
          : c,
      ),
    };
    const html = renderToString(
      <CastDrawer world={world} open onClose={noop} onWorld={noop} />,
    );
    expect(html).toContain("dancing-marker");
    expect(html).toContain("Dancing joyfully");
    expect(html.indexOf("Walking")).toBeLessThan(html.indexOf("Dancing joyfully"));
  });

  it("lays voice and custom voice side by side", () => {
    const noop = () => {};
    const html = renderToString(
      <CastDrawer world={worldWithSheet()} open onClose={noop} onWorld={noop} />,
    );
    expect(html).toContain("voicerow");
    expect(html).toContain("Voice");
    expect(html).toContain("Custom voice");
  });
});

describe("PackDrawer dashboard", () => {
  it("shows tiles, not-made-yet links and the files fold", () => {
    const noop = () => {};
    const html = renderToString(
      <PackDrawer world={worldWithCast()} open onClose={noop} />,
    );
    for (const tile of [
      "Characters",
      "Scenes",
      "Scripts written",
      "Storyboards",
      "Scene art",
      "Videos",
      "Secrets kept apart",
    ]) {
      expect(html).toContain(tile);
    }
    expect(html).toContain("Not made yet");
    expect(html).toContain("See the files");
    expect(html).toContain("/projects/cast-story/script?channel=series");
    expect(html).toContain("Export package");
    expect(html).not.toContain("expected files are missing");
    expect(html).not.toContain("hand this package to Muse Code");
  });

  it("notes the coming game agent on a game channel", () => {
    const noop = () => {};
    const base = worldWithCast();
    const world = {
      ...base,
      channels: [
        {
          id: "game",
          name: "Game",
          kind: "game",
          title: "The Game",
          tagline: "",
          pitch: "",
          secret: "",
          imagePath: "",
        },
      ],
    } satisfies World;
    const html = renderToString(
      <PackDrawer world={world} open onClose={noop} />,
    );
    expect(html).toContain(
      "hand this package to Muse Code",
    );
  });
});
