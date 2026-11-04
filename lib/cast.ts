import type { World } from "@/lib/world/schemas";

/**
 * Characters drawer helpers. Pure: no key, no fetch, so the drawer and
 * tests can both import them. The chosen character lives in the URL as
 * `?c=<character-id>` so it survives reloads and other pages can link
 * to one character directly.
 */

/** The character the URL names, or the first character as the default. */
export function resolveCharacterId(
  world: World,
  param: string | null | undefined,
): string | undefined {
  if (param && world.characters.some((c) => c.id === param)) return param;
  return world.characters[0]?.id;
}

/**
 * The list filter. Case-insensitive substring on the name; an empty
 * query keeps everyone. Plain enough to hold 30 characters.
 */
export function filterCharacters<T extends { name: string }>(
  characters: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return characters;
  return characters.filter((c) => c.name.toLowerCase().includes(q));
}

/** One "Appears in" chip: a scene this character is in, linked to Script. */
export type CharacterScene = {
  channelId: string;
  partId: string;
  label: string;
  href: string;
};

/**
 * One chip per scene (a channel's take on a part), in story order.
 * Each links to the Script page that writes it.
 */
export function scenesForCharacter(
  world: World,
  projectId: string,
  characterId: string,
): CharacterScene[] {
  const seen = new Set<string>();
  const scenes: CharacterScene[] = [];
  const beats = [...world.beats].sort((a, b) => a.order - b.order);
  for (const beat of beats) {
    if (!beat.characterIds.includes(characterId)) continue;
    const key = `${beat.channelId}::${beat.partId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const channel = world.channels.find((c) => c.id === beat.channelId);
    const part = world.parts.find((p) => p.id === beat.partId);
    const label = `${channel?.name ?? beat.channelId} · ${part?.title ?? beat.unitLabel}`;
    scenes.push({
      channelId: beat.channelId,
      partId: beat.partId,
      label,
      href: `/projects/${projectId}/script?channel=${beat.channelId}&part=${beat.partId}`,
    });
  }
  return scenes;
}
