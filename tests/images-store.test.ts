import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorldSchema, type World } from "@/lib/world/schemas";
import {
  artToDataUrl,
  clearImages,
  extractImageEntries,
  hasStoredRefs,
  loadImages,
  refFor,
  restoreImageRefs,
  saveImage,
} from "@/lib/images";

async function loadWorld(): Promise<World> {
  const raw = await readFile(
    join(process.cwd(), "data", "seed", "anukili.json"),
    "utf-8",
  );
  return WorldSchema.parse(JSON.parse(raw));
}

const DATA = "data:image/webp;base64,QUJD";

describe("image refs", () => {
  it("extracts data URLs into named refs and restores them", async () => {
    const world = await loadWorld();
    const withData: World = {
      ...world,
      characters: world.characters.map((c, i) => ({
        ...c,
        artPath: DATA,
        sheet: [{ view: "front", imagePath: i === 0 ? DATA : "" }],
      })),
      parts: world.parts.map((p, i) => ({
        ...p,
        imagePath: i === 0 ? DATA : p.imagePath,
      })),
    };
    const { world: refs, entries } = extractImageEntries(withData);
    expect(entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(refs)).not.toContain("data:image");
    expect(hasStoredRefs(refs)).toBe(true);
    expect(hasStoredRefs(withData)).toBe(false);

    const images: Record<string, string> = {};
    for (const entry of entries) images[entry.name] = entry.dataUrl;
    const restored = restoreImageRefs(refs, images);
    expect(restored.characters[0].artPath).toBe(DATA);
    expect(restored.characters[0].sheet[0].imagePath).toBe(DATA);
    expect(restored.parts[0].imagePath).toBe(DATA);
    // Seed file paths pass through untouched.
    expect(restored.parts[1].imagePath).toBe(withData.parts[1].imagePath);
  });

  it("drops blob URLs and keeps plain paths", async () => {
    const world = await loadWorld();
    const withBlob: World = {
      ...world,
      characters: world.characters.map((c) => ({
        ...c,
        artPath: "blob:temporary",
      })),
    };
    const { world: refs, entries } = extractImageEntries(withBlob);
    expect(entries).toEqual([]);
    expect(refs.characters[0].artPath).toBe("");
    expect(refFor("scene-p1")).toBe("idb:scene-p1");
  });

  it("leaves known refs alone when the store is empty", async () => {
    const world = await loadWorld();
    expect(restoreImageRefs(world, {})).toBe(world);
  });
});

describe("image store", () => {
  it("round-trips through the memory fallback without IndexedDB", async () => {
    await saveImage("w1", "scene-p1", DATA);
    await saveImage("w1", "art-c1", "data:image/webp;base64,EFGH");
    const images = await loadImages("w1");
    expect(images["scene-p1"]).toBe(DATA);
    expect(images["art-c1"]).toBe("data:image/webp;base64,EFGH");
    await clearImages("w1");
    expect(await loadImages("w1")).toEqual({});
  });

  it("keeps worlds apart", async () => {
    await saveImage("wa", "scene-p1", DATA);
    await clearImages("wb");
    expect(await loadImages("wa")).toEqual({ "scene-p1": DATA });
    await clearImages("wa");
  });

  it("passes data URLs straight through", async () => {
    await expect(artToDataUrl(DATA)).resolves.toBe(DATA);
  });
});
