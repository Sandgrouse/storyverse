import { z } from "zod";
import {
  PackSchema,
  WorldSchema,
  type StoryPack,
  type World,
} from "@/lib/world/schemas";

/**
 * Story Pack model contract. Pure: no key, no fetch, so routes, client
 * components and tests can all import it.
 */

export const PACK_INSTRUCTIONS =
  "You write production material for one piece of a story told across channels. Use only the canon. Reveal only what this channel may reveal: a secret whose knownThrough excludes this channel must not appear or be hinted at beyond what the canon's scenes already show. Never rename anyone or change an established detail. Any new detail you add is labelled in additions.";

export const PACK_SCHEMA_NAME = "story_pack";

export const PACK_JSON_SCHEMA = {
  type: "object",
  properties: {
    script: { type: "string" },
    shots: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 5,
    },
    posts: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 3,
    },
    reveals: { type: "array", items: { type: "string" } },
    additions: { type: "array", items: { type: "string" } },
  },
  required: ["script", "shots", "posts", "reveals", "additions"],
  additionalProperties: false,
} as const;

export const PackModelOutputSchema = PackSchema.omit({
  partId: true,
  channelId: true,
});

export type PackModelOutput = z.infer<typeof PackModelOutputSchema>;

export const PackRequestSchema = z.object({
  world: WorldSchema,
  partId: z.string().min(1),
  channelId: z.string().min(1),
});

export type PackRequest = z.infer<typeof PackRequestSchema>;

/** Plain message when the server has no key to write with. */
export const PACK_NO_KEY_MESSAGE =
  "Scene notes are not available on this server.";

/** The script form each channel kind asks for. */
export function scriptFormForKind(kind: string): string {
  if (kind === "game") return "a level brief";
  if (kind === "shorts") return "a first-person monologue";
  if (kind === "press") return "a short article";
  return "a scene script";
}

/** Channels with at least one beat on this part. */
export function channelsForPart(
  world: World,
  partId: string,
): World["channels"] {
  const ids = new Set(
    world.beats
      .filter((beat) => beat.partId === partId)
      .map((beat) => beat.channelId),
  );
  return world.channels.filter((channel) => ids.has(channel.id));
}

/**
 * Canon text for one channel's take on one part: the channel, the part,
 * that channel's beats here, the part's characters, and every secret with
 * the channels that may know it, so the model can hold back the rest.
 */
export function packModelInput(
  world: World,
  partId: string,
  channelId: string,
): string {
  const channel = world.channels.find((c) => c.id === channelId);
  const part = world.parts.find((p) => p.id === partId);
  const lines: string[] = [
    `Write ${scriptFormForKind(channel?.kind ?? "series")} for ${channel?.name ?? channelId}, ${channel?.title ?? ""}.`.replace(
      /, \.$/,
      ".",
    ),
    `Part: ${part?.title ?? partId} — ${part?.summary ?? ""}`,
  ];
  if (part?.excerpt) lines.push(`Excerpt: ${part.excerpt}`);
  lines.push("", "This channel's beats on this part:");
  const beats = world.beats.filter(
    (beat) => beat.partId === partId && beat.channelId === channelId,
  );
  if (beats.length === 0) {
    lines.push("- None yet.");
  } else {
    for (const beat of [...beats].sort((a, b) => a.order - b.order)) {
      lines.push(`- ${beat.title} (${beat.unitLabel}): ${beat.content}`);
    }
  }
  lines.push("", "Characters in this part:");
  for (const id of part?.characterIds ?? []) {
    const character = world.characters.find((c) => c.id === id);
    if (character) lines.push(`- ${character.name}: ${character.canon}`);
  }
  lines.push("", "Secrets (and the channels that may know them):");
  const names = new Map(world.channels.map((c) => [c.id, c.name]));
  for (const secret of world.secrets) {
    const known =
      secret.knownThrough.length > 0
        ? secret.knownThrough.map((id) => names.get(id) ?? id).join(", ")
        : "no channel yet";
    lines.push(`- ${secret.text} (known through: ${known}). ${secret.note}`);
  }
  return lines.join("\n");
}

/** One stored pack for this part and channel, if the world holds it. */
export function packForPart(
  world: World,
  partId: string,
  channelId: string,
): StoryPack | undefined {
  return world.packs.find(
    (pack) => pack.partId === partId && pack.channelId === channelId,
  );
}

/** Add or replace one pack in the world. Pure. */
export function upsertPack(world: World, pack: StoryPack): World {
  const rest = world.packs.filter(
    (entry) =>
      !(entry.partId === pack.partId && entry.channelId === pack.channelId),
  );
  return { ...world, packs: [...rest, pack] };
}

/** The downloadable/displayed markdown for one pack. Pure. */
export function packToMarkdown(
  world: World,
  pack: StoryPack,
): string {
  const channel = world.channels.find((c) => c.id === pack.channelId);
  const part = world.parts.find((p) => p.id === pack.partId);
  const lines = [
    `# ${part?.title ?? pack.partId} · ${channel?.name ?? pack.channelId}`,
    "",
    `Channel: ${channel?.name ?? pack.channelId} (${channel?.kind ?? "series"}). Part ${part?.order ?? ""}: ${part?.title ?? pack.partId}.`,
    "",
    `## Script (${scriptFormForKind(channel?.kind ?? "series")})`,
    "",
    pack.script,
    "",
    "## Shots",
    "",
    ...pack.shots.map((shot) => `- ${shot}`),
    "",
    "## Posts",
    "",
    ...pack.posts.map((post) => `- ${post}`),
    "",
    "## Reveals",
    "",
    ...(pack.reveals.length > 0
      ? pack.reveals.map((reveal) => `- ${reveal}`)
      : ["- Nothing new is revealed in this piece."]),
    "",
    "## Additions",
    "",
    ...(pack.additions.length > 0
      ? pack.additions.map((addition) => `- ${addition} (suggested addition)`)
      : ["- Nothing invented: everything above is canon."]),
    "",
  ];
  return lines.join("\n");
}
