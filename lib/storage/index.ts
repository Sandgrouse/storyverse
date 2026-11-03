import type { World } from "@/lib/world/schemas";

export interface WorldStorage {
  getWorld(): Promise<World>;
  saveWorld(world: World): Promise<void>;
  putFile(path: string, data: Uint8Array): Promise<void>;
  getFileUrl(path: string): Promise<string>;
}
