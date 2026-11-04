import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorldSchema } from "@/lib/world/schemas";

/** Every image path named by the seed must exist under public/. */
describe("seed art paths", () => {
  it("resolves every seed path to a file under public/", async () => {
    const raw = await readFile(
      join(process.cwd(), "data", "seed", "anukili.json"),
      "utf-8",
    );
    const world = WorldSchema.parse(JSON.parse(raw));
    const paths = new Set<string>();
    for (const character of world.characters) {
      if (character.artPath) paths.add(character.artPath);
      for (const view of character.sheet) {
        paths.add(view.imagePath);
        if (view.cutoutPath) paths.add(view.cutoutPath);
      }
    }
    for (const part of world.parts) {
      if (part.imagePath) paths.add(part.imagePath);
    }
    for (const channel of world.channels) {
      if (channel.imagePath) paths.add(channel.imagePath);
    }
    for (const beat of world.beats) {
      if (beat.imagePath) paths.add(beat.imagePath);
    }
    expect(paths.size).toBeGreaterThan(0);
    for (const imagePath of paths) {
      expect(imagePath.startsWith("/"), imagePath).toBe(true);
      const file = join(process.cwd(), "public", imagePath);
      const info = await stat(file).catch(() => null);
      expect(info?.isFile() ?? false, `missing: ${imagePath}`).toBe(true);
    }
  });
});

/** The browser bundle must never see the model key or a public key. */
describe("no key in the client bundle", () => {
  async function filesUnder(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const found: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) found.push(...(await filesUnder(full)));
      else if (/\.(tsx?|jsx?|css)$/.test(entry.name)) found.push(full);
    }
    return found;
  }

  it("greps clean under components/", async () => {
    const dir = join(process.cwd(), "components");
    const files = await filesUnder(dir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = await readFile(file, "utf-8");
      expect(
        text.includes("MODEL_API_KEY"),
        `${file} must not reference MODEL_API_KEY`,
      ).toBe(false);
      expect(
        text.includes("ELEVENLABS_API_KEY"),
        `${file} must not reference ELEVENLABS_API_KEY`,
      ).toBe(false);
      expect(
        text.includes("VOICE_OWNER_CODE"),
        `${file} must not reference VOICE_OWNER_CODE`,
      ).toBe(false);
      expect(
        /NEXT_PUBLIC_/.test(text),
        `${file} must not reference a NEXT_PUBLIC_ key`,
      ).toBe(false);
    }
  });
});
