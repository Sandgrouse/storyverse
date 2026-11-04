import { WorldSchema, type World } from "@/lib/world/schemas";
import { slugForTitle } from "@/lib/story";
import {
  clearImages,
  dropStoredRefs,
  extractImageEntries,
  loadImages,
  restoreImageRefs,
  saveImage,
} from "@/lib/images";

/**
 * Many-projects store. The index lives in localStorage under one key;
 * each world lives under its own key with image data stripped (data URLs
 * move to the image store, keyed by world id). Every access is guarded
 * so a corrupt entry is discarded, never a crash.
 */

export const SAMPLE_ID = "anukili";
export const SAMPLE_TITLE = "Anukili Ugama";

const INDEX_KEY = "storyverse-projects-v1";
const worldKeyFor = (id: string) => `storyverse-project-${id}`;

export type ProjectEntry = {
  id: string;
  title: string;
  updatedAt: number;
  sample: boolean;
  cover: string;
  channelsConfirmed: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isEntry(value: unknown): value is ProjectEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.updatedAt === "number" &&
    typeof value.sample === "boolean" &&
    typeof value.cover === "string" &&
    typeof value.channelsConfirmed === "boolean"
  );
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Short random suffix so two stories with the same title never collide. */
export function randomSuffix(): string {
  try {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return (bytes[0] ?? Math.floor(Math.random() * 36 ** 6))
      .toString(36)
      .slice(-6)
      .padStart(6, "0")
      .slice(0, 6);
  } catch {
    return Math.floor(Math.random() * 36 ** 6)
      .toString(36)
      .padStart(6, "0")
      .slice(0, 6);
  }
}

/** Unique id: a slug of the title plus a short random suffix. */
export function createProjectId(title: string): string {
  return `${slugForTitle(title)}-${randomSuffix()}`;
}

/** Read the index, discarding anything that is not a valid entry. */
export function listEntries(): ProjectEntry[] {
  try {
    const store = storage();
    if (!store) return [];
    const raw = store.getItem(INDEX_KEY);
    if (!raw) return [];
    const json: unknown = JSON.parse(raw);
    if (!Array.isArray(json)) return [];
    return json.filter(isEntry);
  } catch {
    return [];
  }
}

export function getEntry(id: string): ProjectEntry | null {
  return listEntries().find((entry) => entry.id === id) ?? null;
}

function writeEntries(entries: ProjectEntry[]): void {
  try {
    storage()?.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    // Memory state still holds; the reload copy is best effort.
  }
}

function upsertEntry(entry: ProjectEntry): void {
  const entries = listEntries().filter((e) => e.id !== entry.id);
  entries.push(entry);
  writeEntries(entries);
}

/** First usable art ref for a card, or "" for a tint fallback. */
export function coverFor(world: World): string {
  const paths = [
    ...world.parts.map((p) => p.imagePath),
    ...world.characters.map((c) => c.artPath ?? ""),
    ...world.channels.map((c) => c.imagePath),
  ];
  const found = paths.find(
    (path) => typeof path === "string" && path.length > 0 && !path.startsWith("data:"),
  );
  return found ?? "";
}

/**
 * Persist a world under its own key (image data stripped into the image
 * store) and refresh its index entry. Never throws.
 */
export function saveProject(
  world: World,
  options?: { sample?: boolean; channelsConfirmed?: boolean; title?: string },
): void {
  try {
    const existing = getEntry(world.id);
    const sample = options?.sample ?? existing?.sample ?? world.id === SAMPLE_ID;
    const { world: refs, entries } = extractImageEntries(world);
    for (const entry of entries) {
      void saveImage(world.id, entry.name, entry.dataUrl).catch(() => {
        // Memory already holds it; the reload copy is best effort.
      });
    }
    try {
      storage()?.setItem(worldKeyFor(world.id), JSON.stringify(refs));
    } catch {
      // Index still refreshes below when the world will not fit.
    }
    upsertEntry({
      id: world.id,
      title:
        options?.title ??
        (sample ? SAMPLE_TITLE : (world.title || "Untitled story")),
      updatedAt: Date.now(),
      sample,
      cover: coverFor(refs),
      channelsConfirmed:
        options?.channelsConfirmed ?? existing?.channelsConfirmed ?? false,
    });
  } catch {
    // Ignore quota and serialization failures; memory state still holds.
  }
}

/** Raw stored world for a project, validated, without image hydration. */
export function loadStoredWorld(id: string): World | null {
  try {
    const store = storage();
    if (!store) return null;
    const raw = store.getItem(worldKeyFor(id));
    if (!raw) return null;
    const parsed = WorldSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) {
      try {
        store.removeItem(worldKeyFor(id));
      } catch {
        // The next load retries the discard.
      }
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/** A project with its images filled back in. Null when unknown or invalid. */
export async function loadProject(
  id: string,
): Promise<{ entry: ProjectEntry; world: World } | null> {
  const entry = getEntry(id);
  if (!entry) return null;
  const stored = loadStoredWorld(id);
  if (!stored) return null;
  try {
    const images = await loadImages(id);
    return { entry, world: restoreImageRefs(stored, images) };
  } catch {
    return { entry, world: dropStoredRefs(stored) };
  }
}

/**
 * Make sure the sample appears in the index, persisting the seed the
 * first time. Returns the sample's entry.
 */
export function ensureSample(seed: World): ProjectEntry {
  const existing = getEntry(SAMPLE_ID);
  if (existing && loadStoredWorld(SAMPLE_ID)) return existing;
  saveProject({ ...seed, id: SAMPLE_ID }, { sample: true, title: SAMPLE_TITLE });
  return (
    getEntry(SAMPLE_ID) ?? {
      id: SAMPLE_ID,
      title: SAMPLE_TITLE,
      updatedAt: Date.now(),
      sample: true,
      cover: coverFor(seed),
      channelsConfirmed: false,
    }
  );
}

/** Delete a project, its world, and its images. Never throws. */
export function deleteProject(id: string): void {
  try {
    writeEntries(listEntries().filter((entry) => entry.id !== id));
    try {
      storage()?.removeItem(worldKeyFor(id));
    } catch {
      // The index is already updated; the orphaned world is harmless.
    }
    void clearImages(id).catch(() => {
      // Memory is already dropped with the index entry.
    });
  } catch {
    // The index read failed; nothing to remove.
  }
}

/** Restore the sample to the seed, keeping its id. Never throws. */
export function resetSample(seed: World): void {
  try {
    void clearImages(SAMPLE_ID).catch(() => {
      // The seed art below replaces whatever survives.
    });
    saveProject(
      { ...seed, id: SAMPLE_ID },
      { sample: true, title: SAMPLE_TITLE, channelsConfirmed: false },
    );
  } catch {
    // The next open retries the reset.
  }
}

/** "Edited" line for a card, e.g. "Edited 3h ago". Pure. */
export function timeAgo(updatedAt: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (seconds < 60) return "Edited just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Edited ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Edited ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Edited ${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Edited ${months}mo ago`;
  return `Edited ${Math.floor(months / 12)}y ago`;
}

/**
 * One generated text file holding the current canon, sent with new
 * material so the model returns the whole story with the new material
 * merged in.
 */
export function canonTextFor(world: World): string {
  const lines: string[] = [
    `Title: ${world.title}`,
    `Logline: ${world.logline}`,
    "",
    "Parts:",
    ...world.parts
      .slice()
      .sort((a, b) => a.order - b.order)
      .flatMap((part) => [
        `Part ${part.order}: ${part.title}`,
        part.summary,
        part.excerpt,
        "",
      ]),
    "Characters:",
    ...world.characters.map(
      (character) => `${character.name}: ${character.canon}`,
    ),
    "",
    "Locations:",
    ...world.locations.map(
      (location) => `${location.name}: ${location.description}`,
    ),
  ];
  return lines.join("\n");
}

export const MERGE_INSTRUCTION =
  "Merge the new material into the current story in current-story.txt. " +
  "Return the whole story with the new material merged in: keep every part, " +
  "character and location that still holds, and add what is new. " +
  "Use only what the files say. Never rename anyone.";

const lower = (value: string) => value.toLowerCase();

/**
 * Keep existing sheets, cutouts, art and images for characters and parts
 * whose names or titles match, case-insensitively. Pure.
 */
export function mergeWorldAssets(oldWorld: World, nextWorld: World): World {
  const charactersByName = new Map<string, World["characters"][number]>();
  for (const character of oldWorld.characters) {
    if (!charactersByName.has(lower(character.name))) {
      charactersByName.set(lower(character.name), character);
    }
  }
  const partsByTitle = new Map<string, World["parts"][number]>();
  for (const part of oldWorld.parts) {
    if (!partsByTitle.has(lower(part.title))) {
      partsByTitle.set(lower(part.title), part);
    }
  }
  const beatsById = new Map(oldWorld.beats.map((beat) => [beat.id, beat]));
  return {
    ...nextWorld,
    characters: nextWorld.characters.map((character) => {
      const old = charactersByName.get(lower(character.name));
      if (!old) return character;
      return {
        ...character,
        artPath: character.artPath ? character.artPath : old.artPath,
        sheet:
          character.sheet.length > 0
            ? character.sheet.map((view) => {
                const oldView = old.sheet.find((v) => v.view === view.view);
                if (!oldView) return view;
                return {
                  ...view,
                  imagePath: view.imagePath ? view.imagePath : oldView.imagePath,
                  cutoutPath: view.cutoutPath
                    ? view.cutoutPath
                    : oldView.cutoutPath,
                };
              })
            : old.sheet,
      };
    }),
    parts: nextWorld.parts.map((part) => {
      const old = partsByTitle.get(lower(part.title));
      if (!old) return part;
      return {
        ...part,
        imagePath: part.imagePath ? part.imagePath : old.imagePath,
        imagePosition: part.imagePosition
          ? part.imagePosition
          : old.imagePosition,
      };
    }),
    beats: nextWorld.beats.map((beat) => {
      const old = beatsById.get(beat.id);
      if (!old?.imagePath) return beat;
      return {
        ...beat,
        imagePath: beat.imagePath ? beat.imagePath : old.imagePath,
      };
    }),
  };
}
