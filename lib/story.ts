import type { ReadModelOutput } from "@/lib/read";
import type { PlanBeat, PlanChannel, PlanSecret } from "@/lib/plan";
import { WorldSchema, type World } from "@/lib/world/schemas";

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
      sheet: character.sheet.map((view) => ({
        ...view,
        imagePath: clean(view.imagePath) ?? "",
        cutoutPath: view.cutoutPath ? clean(view.cutoutPath) : undefined,
      })),
      lines: (character.lines ?? []).map((line) => ({
        ...line,
        audioPath: clean(line.audioPath) ?? "",
      })),
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

