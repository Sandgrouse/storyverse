import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorldSchema } from "@/lib/world/schemas";
import { createLocalStorage } from "@/lib/storage/local";
import seed from "@/data/seed/anukili.json";

describe("local storage adapter", () => {
  it("falls back to the seed world when nothing is saved", async () => {
    const dir = await mkdtemp(join(tmpdir(), "storyverse-"));
    try {
      const store = createLocalStorage(dir);
      const world = await store.getWorld();
      expect(world).toEqual(WorldSchema.parse(seed));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("round-trips a saved world", async () => {
    const dir = await mkdtemp(join(tmpdir(), "storyverse-"));
    try {
      const store = createLocalStorage(dir);
      const world = WorldSchema.parse(seed);
      const edited = { ...world, title: "Anukili (edited)" };
      await store.saveWorld(edited);
      expect(await store.getWorld()).toEqual(edited);
      const onDisk = JSON.parse(
        await readFile(join(dir, "world.json"), "utf-8"),
      );
      expect(WorldSchema.parse(onDisk)).toEqual(edited);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stores files and returns a url", async () => {
    const dir = await mkdtemp(join(tmpdir(), "storyverse-"));
    try {
      const store = createLocalStorage(dir);
      await store.putFile("sheets/anukili/front.png", new Uint8Array([1, 2, 3]));
      const url = await store.getFileUrl("sheets/anukili/front.png");
      expect(url).toContain("sheets/anukili/front.png");
      const bytes = await readFile(join(dir, "files", "sheets/anukili/front.png"));
      expect(Array.from(bytes)).toEqual([1, 2, 3]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
