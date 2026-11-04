import { SHEET_VIEW_IDS } from "@/lib/art";
import { storyboardForScene } from "@/lib/storyboard";
import { scriptForScene } from "@/lib/script";
import { shortForScene } from "@/lib/video";
import type { Character, World } from "@/lib/world/schemas";

/**
 * Agent package dashboard numbers. Pure: no key, no fetch, so the
 * drawer and tests can both import them.
 *
 * Vocabulary: an item the owner has not made yet (no sheet, no art,
 * no script...) is unfinished work, never a missing file. It belongs
 * in the "Not made yet" list, not in a warning line.
 */

/** True when every sheet view holds an image: the sheet is complete. */
export function hasFullSheet(character: Character): boolean {
  return SHEET_VIEW_IDS.every((view) =>
    character.sheet.some((entry) => entry.view === view && entry.imagePath),
  );
}

export type SummaryCounts = {
  characters: number;
  fullSheets: number;
  voices: number;
  scenes: number;
  coveredScenes: number;
  scriptsWritten: number;
  storyboards: number;
  sceneArt: number;
  videos: number;
  secretsKeptApart: number;
  secretsTotal: number;
  /** Covered (channel, part) pairs: the denominator scripts, boards, videos share. */
  plannedPairs: number;
};

/** Every tile on the dashboard reads from here. */
export function summaryCounts(world: World): SummaryCounts {
  const pairs = plannedPairs(world);
  return {
    characters: world.characters.length,
    fullSheets: world.characters.filter(hasFullSheet).length,
    voices: world.characters.filter((c) => c.voice).length,
    scenes: world.parts.length,
    coveredScenes: new Set(
      world.beats.map((beat) => `${beat.channelId}::${beat.partId}`),
    ).size,
    scriptsWritten: world.scripts.length,
    storyboards: (world.storyboards ?? []).length,
    sceneArt: world.parts.filter((part) => part.imagePath).length,
    videos: (world.shorts ?? []).length,
    secretsKeptApart: world.secrets.filter((s) => s.knownThrough.length === 0)
      .length,
    secretsTotal: world.secrets.length,
    plannedPairs: pairs.length,
  };
}

/** Every (channel, part) pair with at least one beat: work to be done. */
export function plannedPairs(world: World): Array<{
  channelId: string;
  partId: string;
}> {
  const seen = new Set<string>();
  const pairs: Array<{ channelId: string; partId: string }> = [];
  for (const beat of world.beats) {
    const key = `${beat.channelId}::${beat.partId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ channelId: beat.channelId, partId: beat.partId });
  }
  return pairs;
}

export type ReadinessItem = {
  kind: "sheets" | "art" | "script" | "design" | "copy" | "storyboard" | "video";
  label: string;
  href: string;
  done: boolean;
};

/**
 * The readiness word a channel kind uses for its written work: games
 * are designed, copy kinds are written as copy, screen kinds as
 * scripts. Pure, so readiness rows, the map and the dashboard agree.
 */
export function writtenKindForChannelKind(kind: string): "design" | "copy" | "script" {
  if (kind === "game") return "design";
  if (kind === "website" || kind === "press" || kind === "ad" || kind === "other") {
    return "copy";
  }
  return "script";
}

/** True for channels whose written work is copy, not screenplay. */
export function isCopyChannelKind(kind: string): boolean {
  return writtenKindForChannelKind(kind) === "copy";
}

/** A game does not need storyboards or video: both stay unlisted. */
export function isGameChannelKind(kind: string): boolean {
  return kind === "game";
}

/** Capitalized readiness label for the written work, e.g. "Design". */
export function writtenLabelForChannelKind(kind: string): string {
  const written = writtenKindForChannelKind(kind);
  return written === "design" ? "Design" : written === "copy" ? "Copy" : "Script";
}

export type ChannelReadiness = {
  channelId: string;
  made: number;
  total: number;
  items: ReadinessItem[];
};

/**
 * One card per channel: what is made and what is not. Every unfinished
 * item names the page that makes it, deep-linked to the scene.
 */
export function channelReadiness(
  world: World,
  projectId: string,
  channelId: string,
): ChannelReadiness {
  const items: ReadinessItem[] = [];
  const missingSheets = world.characters.filter((c) => !hasFullSheet(c));
  const firstMissing = missingSheets[0];
  items.push({
    kind: "sheets",
    label:
      missingSheets.length === 0
        ? `Character sheets (${world.characters.length} of ${world.characters.length})`
        : `Character sheets (${world.characters.length - missingSheets.length} of ${world.characters.length})`,
    href:
      firstMissing !== undefined
        ? `/projects/${projectId}/characters?c=${firstMissing.id}`
        : `/projects/${projectId}/characters`,
    done: world.characters.length > 0 && missingSheets.length === 0,
  });
  const kind = world.channels.find((c) => c.id === channelId)?.kind ?? "series";
  const written = writtenKindForChannelKind(kind);
  const writtenLabel = writtenLabelForChannelKind(kind);
  const pairs = plannedPairs(world).filter((p) => p.channelId === channelId);
  const orderedParts = [...world.parts].sort((a, b) => a.order - b.order);
  for (const pair of pairs) {
    const part = orderedParts.find((p) => p.id === pair.partId);
    const partLabel = part?.title ?? pair.partId;
    const artDone = (part?.imagePath?.length ?? 0) > 0;
    items.push({
      kind: "art",
      label: `Scene art: ${partLabel}`,
      href: `/projects/${projectId}/story`,
      done: artDone,
    });
    items.push({
      kind: written,
      label: `${writtenLabel}: ${partLabel}`,
      href: `/projects/${projectId}/script?channel=${channelId}&part=${pair.partId}`,
      done: scriptForScene(world, channelId, pair.partId) !== undefined,
    });
    // A game does not need storyboards or video: neither is listed,
    // made or not, so the Readiness view and the ZIP agree.
    if (isGameChannelKind(kind)) continue;
    items.push({
      kind: "storyboard",
      label: `Storyboard: ${partLabel}`,
      href: `/projects/${projectId}/storyboard?channel=${channelId}&part=${pair.partId}`,
      done: storyboardForScene(world, channelId, pair.partId) !== undefined,
    });
    items.push({
      kind: "video",
      label: `Video: ${partLabel}`,
      href: `/projects/${projectId}/video?channel=${channelId}&part=${pair.partId}`,
      done: shortForScene(world, channelId, pair.partId) !== undefined,
    });
  }
  const made = items.filter((item) => item.done).length;
  return { channelId, made, total: items.length, items };
}

/** The unfinished items across every channel: the dashboard's work list. */
export function notMadeYet(world: World, projectId: string): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  for (const channel of world.channels) {
    for (const item of channelReadiness(world, projectId, channel.id).items) {
      if (!item.done) items.push(item);
    }
  }
  return items;
}
