import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { WorldSchema, type World } from "@/lib/world/schemas";
import type { WorldStorage } from "@/lib/storage/index";

const SEED_PATH = join(process.cwd(), "data", "seed", "anukili.json");

async function readSeedWorld(): Promise<World> {
  const raw = await readFile(SEED_PATH, "utf-8");
  return WorldSchema.parse(JSON.parse(raw));
}

export function createLocalStorage(rootDir?: string): WorldStorage {
  const root = rootDir ?? join(process.cwd(), "data", "local");
  const worldPath = join(root, "world.json");

  return {
    async getWorld(): Promise<World> {
      if (existsSync(worldPath)) {
        const raw = await readFile(worldPath, "utf-8");
        return WorldSchema.parse(JSON.parse(raw));
      }
      return readSeedWorld();
    },

    async saveWorld(world: World): Promise<void> {
      const parsed = WorldSchema.parse(world);
      await mkdir(root, { recursive: true });
      await writeFile(worldPath, JSON.stringify(parsed, null, 2), "utf-8");
    },

    async putFile(path: string, data: Uint8Array): Promise<void> {
      const full = join(root, "files", path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, data);
    },

    async getFileUrl(path: string): Promise<string> {
      return `/local-files/${path}`;
    },
  };
}

export const localStorage = createLocalStorage();
