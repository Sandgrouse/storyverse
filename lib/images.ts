import type { World } from "@/lib/world/schemas";

/**
 * Generated images are too large for sessionStorage. They live here:
 * keyed by world and image name in IndexedDB, with an in-memory mirror
 * so the app keeps working when IndexedDB fails. The world holds tiny
 * `idb:<name>` refs; data URLs only live in memory and this store.
 */

const REF_PREFIX = "idb:";

export function isStoredRef(path: string | undefined): boolean {
  return typeof path === "string" && path.startsWith(REF_PREFIX);
}

export function refName(path: string): string {
  return path.slice(REF_PREFIX.length);
}

export function refFor(name: string): string {
  return `${REF_PREFIX}${name}`;
}

export type ImageEntry = { name: string; dataUrl: string };

function entryName(kind: string, id: string, extra?: string): string {
  return extra ? `${kind}-${id}-${extra}` : `${kind}-${id}`;
}

function swap(path: string | undefined, name: string, entries: ImageEntry[]): string {
  if (!path) return path ?? "";
  if (isStoredRef(path)) return path;
  if (path.startsWith("blob:")) return "";
  if (path.startsWith("data:")) {
    entries.push({ name, dataUrl: path });
    return refFor(name);
  }
  return path;
}

/**
 * Pull data URLs out of a world into entries, replacing them with refs.
 * Pure: the caller saves entries and persists the returned world.
 */
export function extractImageEntries(world: World): {
  world: World;
  entries: ImageEntry[];
} {
  const entries: ImageEntry[] = [];
  return {
    world: {
      ...world,
      characters: world.characters.map((character) => ({
        ...character,
        artPath: swap(character.artPath, entryName("art", character.id), entries),
        sheet: character.sheet.map((view) => ({
          ...view,
          imagePath: swap(
            view.imagePath,
            entryName("sheet", character.id, view.view),
            entries,
          ),
        })),
      })),
      channels: world.channels.map((channel) => ({
        ...channel,
        imagePath: swap(channel.imagePath, entryName("channel", channel.id), entries),
      })),
      parts: world.parts.map((part) => ({
        ...part,
        imagePath: swap(part.imagePath, entryName("scene", part.id), entries),
      })),
      beats: world.beats.map((beat) => ({
        ...beat,
        imagePath: swap(beat.imagePath, entryName("beat", beat.id), entries),
      })),
    },
    entries,
  };
}

/** Put stored data URLs back into a world's refs. Pure. */
export function restoreImageRefs(
  world: World,
  images: Record<string, string>,
): World {
  if (Object.keys(images).length === 0) return world;
  const fill = (path: string | undefined): string => {
    if (!path) return path ?? "";
    if (!isStoredRef(path)) return path;
    return images[refName(path)] ?? path;
  };
  return {
    ...world,
    characters: world.characters.map((character) => ({
      ...character,
      artPath: fill(character.artPath),
      sheet: character.sheet.map((view) => ({
        ...view,
        imagePath: fill(view.imagePath),
      })),
    })),
    channels: world.channels.map((channel) => ({
      ...channel,
      imagePath: fill(channel.imagePath) ?? "",
    })),
    parts: world.parts.map((part) => ({
      ...part,
      imagePath: fill(part.imagePath) ?? "",
    })),
    beats: world.beats.map((beat) => ({
      ...beat,
      imagePath: fill(beat.imagePath),
    })),
  };
}

/** True when any path in the world is a stored ref waiting to load. */
export function hasStoredRefs(world: World): boolean {
  const paths: Array<string | undefined> = [];
  for (const character of world.characters) {
    paths.push(character.artPath);
    for (const view of character.sheet) paths.push(view.imagePath);
  }
  for (const channel of world.channels) paths.push(channel.imagePath);
  for (const part of world.parts) paths.push(part.imagePath);
  for (const beat of world.beats) paths.push(beat.imagePath);
  return paths.some(isStoredRef);
}

const memory = new Map<string, string>();

function keyFor(worldId: string, name: string): string {
  return `${worldId}::${name}`;
}

function idbFactory(): IDBFactory | null {
  try {
    if (typeof indexedDB === "undefined") return null;
    return indexedDB;
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  const factory = idbFactory();
  if (!factory) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = factory.open("storyverse", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("images");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbPut(key: string, dataUrl: string): void {
  void openDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction("images", "readwrite");
      tx.objectStore("images").put(dataUrl, key);
    } catch {
      // Memory already holds it; IndexedDB is only the reload copy.
    }
  });
}

function idbLoadAll(worldId: string): Promise<Record<string, string>> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve({});
          return;
        }
        try {
          const tx = db.transaction("images", "readonly");
          const store = tx.objectStore("images");
          const request = store.getAllKeys();
          const found: Record<string, string> = {};
          request.onsuccess = () => {
            const keys = (request.result as unknown[]).filter(
              (k): k is string => typeof k === "string",
            );
            const wanted = keys.filter((k) =>
              k.startsWith(`${worldId}::`),
            );
            if (wanted.length === 0) {
              resolve({});
              return;
            }
            let pending = wanted.length;
            for (const full of wanted) {
              const get = store.get(full);
              get.onsuccess = () => {
                if (typeof get.result === "string") {
                  found[full.slice(worldId.length + 2)] = get.result;
                }
                pending -= 1;
                if (pending === 0) resolve(found);
              };
              get.onerror = () => {
                pending -= 1;
                if (pending === 0) resolve(found);
              };
            }
          };
          request.onerror = () => resolve({});
        } catch {
          resolve({});
        }
      }),
  );
}

function idbClear(worldId: string): void {
  void openDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction("images", "readwrite");
      const store = tx.objectStore("images");
      const request = store.getAllKeys();
      request.onsuccess = () => {
        const keys = (request.result as unknown[]).filter(
          (k): k is string => typeof k === "string",
        );
        for (const full of keys) {
          if (full.startsWith(`${worldId}::`)) {
            try {
              store.delete(full);
            } catch {
              // Keep clearing the rest.
            }
          }
        }
      };
    } catch {
      // Memory is already cleared; IndexedDB is only the reload copy.
    }
  });
}

/**
 * Remember one generated image. The memory copy lands at once; the
 * IndexedDB copy follows when it can. Never throws.
 */
export async function saveImage(
  worldId: string,
  name: string,
  dataUrl: string,
): Promise<void> {
  memory.set(keyFor(worldId, name), dataUrl);
  idbPut(keyFor(worldId, name), dataUrl);
}

/** Every stored image for a world, memory first, then IndexedDB. */
export async function loadImages(
  worldId: string,
): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  const prefix = `${worldId}::`;
  for (const [key, value] of memory) {
    if (key.startsWith(prefix)) found[key.slice(prefix.length)] = value;
  }
  try {
    const stored = await idbLoadAll(worldId);
    for (const [name, value] of Object.entries(stored)) {
      if (!(name in found)) found[name] = value;
    }
  } catch {
    // Memory still holds this session's images.
  }
  return found;
}

/** Forget a world's images, in memory and in IndexedDB. Never throws. */
export async function clearImages(worldId: string): Promise<void> {
  const prefix = `${worldId}::`;
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  idbClear(worldId);
}

/** Turn a stored or remote art path into a sendable data URL, or null. */
export async function artToDataUrl(src: string): Promise<string | null> {
  try {
    if (src.startsWith("data:")) return src;
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
