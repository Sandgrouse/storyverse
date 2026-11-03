import type { ReadModelOutput } from "@/lib/read";
import type { PlanBeat, PlanChannel, PlanSecret } from "@/lib/plan";
import { WorldSchema, type World } from "@/lib/world/schemas";
import {
  clearImages,
  extractImageEntries,
  loadImages,
  restoreImageRefs,
  saveImage,
} from "@/lib/images";

export const PART_TINTS = [
  "#e9e0ce",
  "#e5dccf",
  "#dbe4e0",
  "#ecd9c9",
  "#e8d6c6",
];

export function tintForPart(order: number): string {
  return PART_TINTS[(order - 1) % PART_TINTS.length] ?? "#e9e0ce";
}

const CHANNEL_COLORS = ["var(--series)", "var(--game)", "var(--shorts)"];

/** Colour by position, so three channels always read as distinct. */
export function channelColorByIndex(index: number): string {
  return CHANNEL_COLORS[index % CHANNEL_COLORS.length] ?? "#6f675a";
}

/** Gap note written from the result, in code, from which kinds are present. */
export function gapNoteForKinds(kinds: Set<string>): string {
  const hasStory = kinds.has("story");
  const hasArt = kinds.has("character_art") || kinds.has("scene_art");
  if (hasStory && hasArt) {
    return "You have a story and some art. You don't have character sheets or a channel plan yet. I can make both.";
  }
  if (hasStory) {
    return "You have a story. You don't have art, character sheets or a channel plan yet. I can make them.";
  }
  if (hasArt) {
    return "You have some art. Tell me the story and I can make the rest.";
  }
  return "Bring a little more and I can make the rest.";
}

/** Character ids whose names appear in the part text. */
export function characterIdsForPartText(
  summary: string,
  excerpt: string,
  characters: Array<{ id: string; name: string }>,
): string[] {
  const haystack = `${summary} ${excerpt}`.toLowerCase();
  const ids: string[] = [];
  for (const character of characters) {
    if (character.name.length > 0 && haystack.includes(character.name.toLowerCase())) {
      ids.push(character.id);
    }
  }
  return ids;
}

export function slugForTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "user-story";
}

/**
 * Combine the read canon and the channel plan into a World. imageForFile
 * maps a sent file name to the display URL kept in client state.
 */
export function buildWorld(
  canon: ReadModelOutput,
  plan: { channels: PlanChannel[]; beats: PlanBeat[]; secrets: PlanSecret[] },
  imageForFile: (file: string) => string,
): World {
  const orderedParts = [...canon.parts].sort((a, b) => a.order - b.order);
  const beatsByPart = new Map<string, string[]>();
  for (const beat of plan.beats) {
    const list = beatsByPart.get(beat.partId) ?? [];
    for (const id of beat.characterIds) {
      if (!list.includes(id)) list.push(id);
    }
    beatsByPart.set(beat.partId, list);
  }
  return WorldSchema.parse({
    id: slugForTitle(canon.title),
    title: canon.title,
    premise: canon.logline,
    logline: canon.logline,
    characters: canon.characters.map((character) => ({
      id: character.id,
      name: character.name,
      canon: character.canon,
      artPath: character.artFile ? imageForFile(character.artFile) : undefined,
      sheet: [],
    })),
    locations: canon.locations.map((location) => ({
      id: location.id,
      name: location.name,
      description: location.description,
    })),
    channels: plan.channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      kind: channel.kind,
      title: channel.title,
      tagline: "",
      pitch: channel.pitch,
      secret: "",
      imagePath: "",
    })),
    parts: orderedParts.map((part) => {
      const fromBeats = beatsByPart.get(part.id) ?? [];
      const fromText = characterIdsForPartText(
        part.summary,
        part.excerpt,
        canon.characters,
      );
      const characterIds = Array.from(new Set([...fromBeats, ...fromText]));
      return {
        id: part.id,
        order: part.order,
        title: part.title,
        summary: part.summary,
        excerpt: part.excerpt,
        imagePath: part.artFile ? imageForFile(part.artFile) : "",
        tint: tintForPart(part.order),
        characterIds,
      };
    }),
    beats: plan.beats.map((beat, index) => {
      const part = orderedParts.find((p) => p.id === beat.partId);
      return {
        id: beat.id,
        order: index + 1,
        timeLabel: part ? `Part ${part.order}` : "Part 1",
        title: beat.title,
        channelId: beat.channelId,
        partId: beat.partId,
        unitLabel: beat.unitLabel,
        content: beat.content,
        characterIds: beat.characterIds,
      };
    }),
    secrets: plan.secrets.map((secret) => ({
      id: secret.id,
      text: secret.text,
      knownThrough: secret.knownThrough,
      note: secret.note,
      suggested: true,
    })),
    gaps: canon.gaps.map((gap) => ({ id: gap.id, question: gap.question })),
    canonChanges: [],
  });
}

/** Strip image data so the persisted world fits; ignore failures upstream. */
export function stripImageData(world: World): World {
  const clean = (path: string | undefined): string | undefined => {
    if (!path) return path;
    if (path.startsWith("data:") || path.startsWith("blob:")) return "";
    return path;
  };
  return {
    ...world,
    characters: world.characters.map((character) => ({
      ...character,
      artPath: clean(character.artPath),
    })),
    channels: world.channels.map((channel) => ({
      ...channel,
      imagePath: clean(channel.imagePath) ?? "",
    })),
    parts: world.parts.map((part) => ({
      ...part,
      imagePath: clean(part.imagePath) ?? "",
    })),
    beats: world.beats.map((beat) => ({
      ...beat,
      imagePath: clean(beat.imagePath),
    })),
  };
}

const STORAGE_KEY = "storyverse-world-v1";

export function loadPersistedWorld(): { world: World; sample: boolean } | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const json: unknown = JSON.parse(raw);
    if (json === null || typeof json !== "object") return null;
    const record = json as Record<string, unknown>;
    const world = WorldSchema.safeParse(record.world);
    if (!world.success) return null;
    return {
      world: world.data,
      sample: record.sample === true,
    };
  } catch {
    return null;
  }
}

export function persistWorld(world: World, sample: boolean): void {
  try {
    if (typeof window === "undefined") return;
    // Data URLs move to the image store; only tiny refs persist.
    const { world: refs, entries } = extractImageEntries(world);
    for (const entry of entries) {
      void saveImage(world.id, entry.name, entry.dataUrl).catch(() => {
        // Memory already holds it; the reload copy is best effort.
      });
    }
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ world: refs, sample }),
    );
  } catch {
    // Ignore quota and serialization failures; memory state still holds.
  }
}

/** Fill a persisted world's image refs back in from the image store. */
export async function hydrateWorld(world: World): Promise<World> {
  try {
    if (typeof window === "undefined") return world;
    const images = await loadImages(world.id);
    return restoreImageRefs(world, images);
  } catch {
    return world;
  }
}

export function clearPersistedWorld(worldId?: string): void {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(STORAGE_KEY);
    if (worldId) {
      void clearImages(worldId).catch(() => {
        // Memory is already dropped with the session state.
      });
    }
  } catch {
    // Ignore failures; in-memory state still resets.
  }
}
