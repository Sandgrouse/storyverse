import React from "react";
import { renderToString } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorldSchema, type World } from "@/lib/world/schemas";
import WorldScene from "@/components/experience/WorldScene";

async function loadWorld(): Promise<World> {
  const raw = await readFile(
    join(process.cwd(), "data", "seed", "anukili.json"),
    "utf-8",
  );
  return WorldSchema.parse(JSON.parse(raw));
}

function render(node: React.ReactElement): string {
  const original = console.error;
  console.error = () => {};
  try {
    return renderToString(node);
  } finally {
    console.error = original;
  }
}

describe("Story Timeline/Book switch", () => {
  it("defaults to Timeline with the change bar and no Canon button", async () => {
    const world = await loadWorld();
    const html = render(
      <WorldScene active world={world} onWorld={() => {}} />,
    );
    expect(html).toContain("Timeline");
    expect(html).toContain("Book");
    expect(html).toContain("Follow the change");
    expect(html).toContain("Scene notes");
    expect(html).not.toContain("/canon");
    expect(html).not.toContain("Contents");
  });

  it("shows the Canon book in the Book view without the change bar", async () => {
    const world = await loadWorld();
    const html = render(
      <WorldScene active world={world} onWorld={() => {}} view="book" />,
    );
    expect(html).toContain("Timeline");
    expect(html).toContain("Book");
    expect(html).toContain("Contents");
    expect(html).toContain("Characters");
    expect(html).toContain("Places");
    for (const part of world.parts) {
      expect(html).toContain(part.title);
    }
    expect(html).not.toContain("Follow the change");
    // The drawers stay mounted but closed (aria-hidden); opening Scene
    // notes navigates to a section that always shows the timeline.
  });

  it("hides the switch while a drawer is open", async () => {
    const world = await loadWorld();
    const html = render(
      <WorldScene
        active
        world={world}
        onWorld={() => {}}
        drawer="cast"
        onDrawer={() => {}}
      />,
    );
    expect(html).not.toContain("viewswitch");
  });
});
