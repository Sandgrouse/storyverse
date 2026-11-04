import { hasFullSheet } from "@/lib/readiness";
import type { World } from "@/lib/world/schemas";

/**
 * Grouped readiness rows for the Agent package dashboard. One row per
 * scene (its title and channel) with Script, Storyboard, Video and Art
 * chips; one row per character with Sheet, Cutouts and Voice chips.
 * Pure, so tests import it directly.
 */

export type SceneChipKind = "script" | "storyboard" | "video" | "art";

export type SceneChip = {
  kind: SceneChipKind;
  label: string;
  made: boolean;
  href: string;
};

export type SceneRow = {
  partId: string;
  title: string;
  channelName: string;
  chips: SceneChip[];
};

export type CharacterChipKind = "sheet" | "cutouts" | "voice";

export type CharacterChip = {
  kind: CharacterChipKind;
  label: string;
  made: boolean;
  href: string;
};

export type CharacterRow = {
  characterId: string;
  name: string;
  chips: CharacterChip[];
};

/** Covered parts of one channel in story order, with per-scene chips. */
export function sceneRows(
  world: World,
  projectId: string,
  channelId: string,
): SceneRow[] {
  const channel = world.channels.find((c) => c.id === channelId);
  const covered = new Set(
    world.beats
      .filter((beat) => beat.channelId === channelId)
      .map((beat) => beat.partId),
  );
  return [...world.parts]
    .filter((part) => covered.has(part.id))
    .sort((a, b) => a.order - b.order)
    .map((part) => ({
      partId: part.id,
      title: part.title,
      channelName: channel?.name ?? channelId,
      chips: [
        {
          kind: "script",
          label: "Script",
          made: world.scripts.some(
            (entry) => entry.channelId === channelId && entry.partId === part.id,
          ),
          href: `/projects/${projectId}/script?channel=${channelId}&part=${part.id}`,
        },
        {
          kind: "storyboard",
          label: "Storyboard",
          made: (world.storyboards ?? []).some(
            (board) => board.channelId === channelId && board.partId === part.id,
          ),
          href: `/projects/${projectId}/storyboard?channel=${channelId}&part=${part.id}`,
        },
        {
          kind: "video",
          label: "Video",
          made: (world.shorts ?? []).some(
            (short) => short.channelId === channelId && short.partId === part.id,
          ),
          href: `/projects/${projectId}/video?channel=${channelId}&part=${part.id}`,
        },
        {
          kind: "art",
          label: "Art",
          made: part.imagePath.length > 0,
          href: `/projects/${projectId}/story`,
        },
      ] satisfies SceneChip[],
    }));
}

/** One row per character with sheet, cutout and voice chips. */
export function characterRows(world: World, projectId: string): CharacterRow[] {
  return world.characters.map((character) => ({
    characterId: character.id,
    name: character.name,
    chips: [
      {
        kind: "sheet",
        label: "Sheet",
        made: hasFullSheet(character),
        href: `/projects/${projectId}/characters?c=${character.id}`,
      },
      {
        kind: "cutouts",
        label: "Cutouts",
        made: character.sheet.some(
          (view) => (view.cutoutPath ?? "").length > 0,
        ),
        href: `/projects/${projectId}/characters?c=${character.id}`,
      },
      {
        kind: "voice",
        label: "Voice",
        made: character.voice !== undefined,
        href: `/projects/${projectId}/characters?c=${character.id}`,
      },
    ] satisfies CharacterChip[],
  }));
}

/** Only rows with unfinished work left. */
export function unfinishedSceneRows(rows: SceneRow[]): SceneRow[] {
  return rows.filter((row) => row.chips.some((chip) => !chip.made));
}

/** Only characters with unfinished work left. */
export function unfinishedCharacterRows(rows: CharacterRow[]): CharacterRow[] {
  return rows.filter((row) => row.chips.some((chip) => !chip.made));
}
