import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripImageData } from "@/lib/story";
import { WorldSchema, type World } from "@/lib/world/schemas";

async function loadWorld(): Promise<World> {
  const raw = await readFile(
    join(process.cwd(), "data", "seed", "anukili.json"),
    "utf-8",
  );
  return WorldSchema.parse(JSON.parse(raw));
}

describe("stripImageData", () => {
  it("strips in-memory image data so ripple requests stay small", async () => {
    const world = await loadWorld();
    const dataUrl = "data:image/webp;base64,AAAA";
    const withData: World = {
      ...world,
      characters: world.characters.map((c) => ({ ...c, artPath: dataUrl })),
      channels: world.channels.map((c) => ({ ...c, imagePath: dataUrl })),
      parts: world.parts.map((p) => ({ ...p, imagePath: dataUrl })),
      beats: world.beats.map((b) => ({ ...b, imagePath: dataUrl })),
    };
    const stripped = stripImageData(withData);
    for (const c of stripped.characters) expect(c.artPath ?? "").toBe("");
    for (const c of stripped.channels) expect(c.imagePath).toBe("");
    for (const p of stripped.parts) expect(p.imagePath).toBe("");
    for (const b of stripped.beats) expect(b.imagePath ?? "").toBe("");
    expect(JSON.stringify(stripped)).not.toContain("data:image");
  });

  it("keeps file paths and leaves the input alone", async () => {
    const world = await loadWorld();
    const stripped = stripImageData(world);
    expect(stripped.channels.map((c) => c.imagePath)).toEqual(
      world.channels.map((c) => c.imagePath),
    );
    expect(world.characters[0]?.artPath?.startsWith("data:") ?? false).toBe(
      false,
    );
  });
});
