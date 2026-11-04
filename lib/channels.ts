import type { ChannelKind, World } from "@/lib/world/schemas";

/**
 * Channel card editing. Pure helpers so the channels page saves as it
 * types and tests can cover the world updates without a browser.
 */

/** Plain label per channel kind, in the add-screen order. */
export const CHANNEL_KIND_LABELS: Record<ChannelKind, string> = {
  game: "Game",
  series: "Series",
  shorts: "Shorts",
  press: "Press",
  film: "Film",
  website: "Website",
  ad: "Ad",
  other: "Other",
};

export type ChannelPatch = {
  title?: string;
  pitch?: string;
  kind?: ChannelKind;
  /** The name follows the kind (Series, Game, …). */
  name?: string;
  secret?: string;
};

/** Apply one screen's edits, leaving every other channel alone. */
export function updateChannel(
  world: World,
  channelId: string,
  patch: ChannelPatch,
): World {
  return {
    ...world,
    channels: world.channels.map((channel) =>
      channel.id === channelId ? { ...channel, ...patch } : channel,
    ),
  };
}

/**
 * Remove one screen and everything told only through it: its beats,
 * packs, scripts, shorts and storyboards. Secrets it revealed stay,
 * but no longer name it — a secret with nowhere left to be known
 * reads as "Nobody knows yet", like the seed's unrevealed secret.
 */
export function removeChannel(world: World, channelId: string): World {
  return {
    ...world,
    channels: world.channels.filter((channel) => channel.id !== channelId),
    beats: world.beats.filter((beat) => beat.channelId !== channelId),
    packs: world.packs.filter((pack) => pack.channelId !== channelId),
    scripts: (world.scripts ?? []).filter(
      (script) => script.channelId !== channelId,
    ),
    shorts: (world.shorts ?? []).filter(
      (short) => short.channelId !== channelId,
    ),
    storyboards: (world.storyboards ?? []).filter(
      (board) => board.channelId !== channelId,
    ),
    secrets: world.secrets.map((secret) => ({
      ...secret,
      knownThrough: secret.knownThrough.filter((id) => id !== channelId),
    })),
  };
}
