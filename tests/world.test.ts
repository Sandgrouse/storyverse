import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RippleResultSchema,
  WorldSchema,
} from "@/lib/world/schemas";

async function readSeed(name: string) {
  const raw = await readFile(join(process.cwd(), "data", "seed", name), "utf-8");
  return JSON.parse(raw);
}

describe("seed world", () => {
  it("parses against the World schema", async () => {
    const world = WorldSchema.parse(await readSeed("saltlight.json"));
    expect(world.beats.length).toBeGreaterThan(0);
    expect(world.characters.length).toBe(4);
    for (const beat of world.beats) {
      expect(
        beat.content.split(/(?<=[.!?])\s+/).filter(Boolean).length,
        `${beat.id} content should be 2 to 4 sentences`,
      ).toBeGreaterThanOrEqual(2);
      expect(
        beat.content.split(/(?<=[.!?])\s+/).filter(Boolean).length,
        `${beat.id} content should be 2 to 4 sentences`,
      ).toBeLessThanOrEqual(4);
    }
  });

  it("resolves every beat channelId and characterId", async () => {
    const world = WorldSchema.parse(await readSeed("saltlight.json"));
    const channelIds = new Set(world.channels.map((c) => c.id));
    const characterIds = new Set(world.characters.map((c) => c.id));
    for (const beat of world.beats) {
      expect(channelIds.has(beat.channelId), `${beat.id} channelId`).toBe(true);
      for (const id of beat.characterIds) {
        expect(characterIds.has(id), `${beat.id} character ${id}`).toBe(true);
      }
    }
    for (const secret of world.secrets) {
      for (const id of secret.knownThrough) {
        expect(channelIds.has(id), `secret ${secret.id} channel ${id}`).toBe(true);
      }
    }
  });
});

describe("ripple fixture", () => {
  it("parses against the RippleResult schema and resolves beatIds", async () => {
    const world = WorldSchema.parse(await readSeed("saltlight.json"));
    const ripple = RippleResultSchema.parse(await readSeed("saltlight-ripple.json"));
    const beatIds = new Set(world.beats.map((b) => b.id));
    expect(ripple.fixes.length).toBe(3);
    for (const fix of ripple.fixes) {
      expect(beatIds.has(fix.beatId), `fix ${fix.id} beatId`).toBe(true);
      expect(fix.status).toBe("pending");
    }
  });
});
