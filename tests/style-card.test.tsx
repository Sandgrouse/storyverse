import React from "react";
import { renderToString } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorldSchema, type World } from "@/lib/world/schemas";
import UnderstoodScene from "@/components/experience/UnderstoodScene";

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

function scene(world: World): string {
  return render(
    <UnderstoodScene
      active
      world={world}
      onWorld={() => {}}
      onAddMaterial={() => {}}
      onOpen={() => {}}
    />,
  );
}

describe("Understood visual style card", () => {
  it("shows the sample style with its art provenance", async () => {
    const html = scene(await loadWorld());
    expect(html).toContain("Visual style");
    expect(html).toContain("Painterly 2D");
    expect(html).toContain("Dark, mythic, painterly digital art");
    expect(html).toContain("From your art");
  });

  it("shows the dashed card when no style is set yet", async () => {
    const world: World = {
      ...(await loadWorld()),
      visualStyle: { preset: "", notes: "" },
      visualStyleSource: "",
    };
    const html = scene(world);
    expect(html).toContain("Choose a style");
    expect(html).toContain("No visual style yet");
    expect(html).not.toContain("Painterly 2D");
  });

  it("shows the model's reading when the text implied the style", async () => {
    const world: World = {
      ...(await loadWorld()),
      visualStyle: { preset: "Anime", notes: "" },
      visualStyleSource: "muse",
    };
    const html = scene(world);
    expect(html).toContain("Anime");
    expect(html).toContain("My reading");
  });

  it("shows the owner's choice once they pick one", async () => {
    const world: World = {
      ...(await loadWorld()),
      visualStyle: { preset: "Custom", notes: "Clay figures." },
      visualStyleSource: "you",
    };
    const html = scene(world);
    expect(html).toContain("Custom");
    expect(html).toContain("Clay figures.");
    expect(html).toContain("You chose this");
  });
});
