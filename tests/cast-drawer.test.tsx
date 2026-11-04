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
    // Only the four views without images say so; the stored two render.
    expect(html.match(/No image yet/g)).toHaveLength(4);
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
    expect(html).toContain("No image yet");
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
