import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RippleResultSchema,
  WorldSchema,
} from "@/lib/world/schemas";

describe("anukili seed world", () => {
  it("parses against the world schema", async () => {
    const raw = await readFile(
      join(process.cwd(), "data", "seed", "anukili.json"),
      "utf-8",
    );
    const world = WorldSchema.parse(JSON.parse(raw));
    expect(world.id).toBe("anukili");
    expect(world.parts).toHaveLength(5);
    expect(world.channels).toHaveLength(3);
    expect(world.gaps.length).toBeGreaterThan(0);
  });

  it("resolves every id reference", async () => {
    const raw = await readFile(
      join(process.cwd(), "data", "seed", "anukili.json"),
      "utf-8",
    );
    const world = WorldSchema.parse(JSON.parse(raw));
    const characters = new Set(world.characters.map((c) => c.id));
    const channels = new Set(world.channels.map((c) => c.id));
    const parts = new Set(world.parts.map((p) => p.id));
    const beats = new Set(world.beats.map((b) => b.id));

    for (const part of world.parts) {
      for (const id of part.characterIds) {
        expect(characters.has(id), `part ${part.id} character ${id}`).toBe(true);
      }
    }
    for (const beat of world.beats) {
      expect(channels.has(beat.channelId), `beat ${beat.id} channel`).toBe(true);
      expect(parts.has(beat.partId), `beat ${beat.id} part`).toBe(true);
      for (const id of beat.characterIds) {
        expect(characters.has(id), `beat ${beat.id} character ${id}`).toBe(true);
      }
    }
    for (const secret of world.secrets) {
      for (const id of secret.knownThrough) {
        expect(channels.has(id), `secret ${secret.id} channel ${id}`).toBe(true);
      }
    }
    expect(beats.size).toBeGreaterThan(0);

    const rippleRaw = await readFile(
      join(process.cwd(), "data", "seed", "anukili-ripple.json"),
      "utf-8",
    );
    const ripple = RippleResultSchema.parse(JSON.parse(rippleRaw));
    expect(ripple.sample ?? false).toBe(false);
    for (const fix of ripple.fixes) {
      expect(channels.has(fix.channelId), `fix ${fix.id} channel`).toBe(true);
      expect(parts.has(fix.partId), `fix ${fix.id} part`).toBe(true);
      expect(beats.has(fix.beatId), `fix ${fix.id} beat`).toBe(true);
      expect(["contradiction", "meaning", "setup"]).toContain(fix.kind);
      expect(fix.quote.length).toBeGreaterThan(0);
      expect("appliedMessage" in fix).toBe(false);
      const beat = world.beats.find((b) => b.id === fix.beatId);
      expect(beat?.channelId, `fix ${fix.id} beat channel`).toBe(fix.channelId);
      expect(beat?.partId, `fix ${fix.id} beat part`).toBe(fix.partId);
      expect(beat?.content, `fix ${fix.id} quote in beat`).toContain(fix.quote);
    }
    const secretsById = new Map(world.secrets.map((s) => [s.id, s]));
    expect(ripple.secretUpdates.length).toBeGreaterThan(0);
    for (const update of ripple.secretUpdates) {
      expect(
        secretsById.has(update.secretId),
        `secret update ${update.secretId} resolves`,
      ).toBe(true);
    }
  });

  it("does not state that Enyinyi gave them the plan", async () => {
    const raw = await readFile(
      join(process.cwd(), "data", "seed", "anukili.json"),
      "utf-8",
    );
    const lowered = raw.toLowerCase();
    for (const phrase of [
      "told them how to kill him",
      "gave them the plan",
      "gives them the plan",
      "give them the plan",
    ]) {
      expect(
        lowered.includes(phrase),
        `seed world must not contain: ${phrase}`,
      ).toBe(false);
    }
  });

  it("covers every channel secret from the treatment", async () => {
    const raw = await readFile(
      join(process.cwd(), "data", "seed", "anukili.json"),
      "utf-8",
    );
    const world = WorldSchema.parse(JSON.parse(raw));
    for (const channel of world.channels) {
      const revealed = world.secrets.some((s) =>
        s.knownThrough.includes(channel.id),
      );
      expect(revealed, `channel ${channel.id} reveals a secret`).toBe(true);
    }
  });
});
