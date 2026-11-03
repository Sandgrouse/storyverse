import { z } from "zod";
import type { ReadModelOutput } from "@/lib/read";

export const PLAN_INSTRUCTIONS =
  "You plan how one story spreads across channels. Propose three channels unless the material names others. Give each channel its own piece of the story, so that each holds at least one secret the others don't, and fans must follow several to get the whole truth. Every part must appear in at least one channel. Beat content is two to four sentences. Invented secrets are additions: keep them consistent with the canon, and never change a name or an established detail.";

export const PlanChannelKindSchema = z.enum(["series", "game", "press"]);

export const PlanChannelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: PlanChannelKindSchema,
  title: z.string().min(1),
  pitch: z.string().default(""),
});

export type PlanChannel = z.infer<typeof PlanChannelSchema>;

export const PlanBeatSchema = z.object({
  id: z.string().min(1),
  partId: z.string().min(1),
  channelId: z.string().min(1),
  unitLabel: z.string().default(""),
  title: z.string().min(1),
  content: z.string().min(1),
  characterIds: z.array(z.string()).default([]),
});

export type PlanBeat = z.infer<typeof PlanBeatSchema>;

export const PlanSecretSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  knownThrough: z.array(z.string()).default([]),
  note: z.string().default(""),
});

export type PlanSecret = z.infer<typeof PlanSecretSchema>;

export const PlanModelOutputSchema = z.object({
  channels: z.array(z.unknown()).default([]),
  beats: z.array(z.unknown()).default([]),
  secrets: z.array(z.unknown()).default([]),
});

export const PlanCanonSchema = z.object({
  title: z.string().min(1),
  logline: z.string().default(""),
  characters: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        canon: z.string().default(""),
      }),
    )
    .default([]),
  locations: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().default(""),
      }),
    )
    .default([]),
  parts: z
    .array(
      z.object({
        id: z.string().min(1),
        order: z.number().int().positive(),
        title: z.string().min(1),
        summary: z.string().default(""),
        excerpt: z.string().default(""),
      }),
    )
    .default([]),
  gaps: z
    .array(z.object({ id: z.string().min(1), question: z.string().min(1) }))
    .default([]),
});

export const PlanRequestSchema = z.object({
  canon: PlanCanonSchema,
});

function nonEmptyIds(ids: string[]): [string, ...string[]] {
  return (ids.length > 0 ? ids : ["no-ids"]) as [string, ...string[]];
}

function buildBeatItemSchema(
  partIds: string[],
  channelIds: string[],
  characterIds: string[],
) {
  return z.object({
    id: z.string().min(1),
    partId: z.enum(nonEmptyIds(partIds)),
    channelId: z.enum(nonEmptyIds(channelIds)),
    unitLabel: z.string().default(""),
    title: z.string().min(1),
    content: z.string().min(1),
    characterIds: z.array(z.enum(nonEmptyIds(characterIds))).default([]),
  });
}

function buildSecretItemSchema(channelIds: string[]) {
  return z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    knownThrough: z.array(z.enum(nonEmptyIds(channelIds))).default([]),
    note: z.string().default(""),
  });
}

/** Validate channels on their own; the kind enum drops anything else. */
export function toPlanChannels(modelChannels: unknown[]): PlanChannel[] {
  const seen = new Set<string>();
  const channels: PlanChannel[] = [];
  for (const raw of modelChannels) {
    const parsed = PlanChannelSchema.safeParse(raw);
    if (!parsed.success) continue;
    if (seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    channels.push(parsed.data);
  }
  return channels;
}

/**
 * Validate each beat against part, channel and character enums. Drops any
 * beat whose partId or channelId does not resolve; unknown characterIds
 * are dropped from the beat instead of dropping the whole beat.
 */
export function toPlanBeats(
  modelBeats: unknown[],
  canon: { parts: Array<{ id: string }>; characters: Array<{ id: string }> },
  channelIds: string[],
): PlanBeat[] {
  const partIds = canon.parts.map((part) => part.id);
  const characterIds = canon.characters.map((character) => character.id);
  const seen = new Set<string>();
  const beats: PlanBeat[] = [];
  for (const raw of modelBeats) {
    if (raw === null || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const candidate = {
      ...(record as object),
      characterIds: Array.isArray(record.characterIds)
        ? (record.characterIds as unknown[]).filter(
            (id): id is string =>
              typeof id === "string" && characterIds.includes(id),
          )
        : [],
    };
    const parsed = buildBeatItemSchema(
      partIds,
      channelIds,
      characterIds.length > 0 ? characterIds : ["no-characters"],
    ).safeParse(candidate);
    if (!parsed.success) continue;
    if (seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    beats.push(parsed.data);
  }
  return beats;
}

/**
 * Validate each secret against the channel enum. Unknown channel ids are
 * dropped from knownThrough; the secret stays, possibly unrevealed.
 */
export function toPlanSecrets(
  modelSecrets: unknown[],
  channelIds: string[],
): PlanSecret[] {
  const seen = new Set<string>();
  const secrets: PlanSecret[] = [];
  const itemSchema = buildSecretItemSchema(channelIds);
  for (const raw of modelSecrets) {
    if (raw === null || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const candidate = {
      ...(record as object),
      knownThrough: Array.isArray(record.knownThrough)
        ? (record.knownThrough as unknown[]).filter(
            (id): id is string =>
              typeof id === "string" && channelIds.includes(id),
          )
        : [],
    };
    // If the model named channels but none resolve, drop the secret when it
    // claimed to be known somewhere; an explicitly empty knownThrough stays.
    if (
      Array.isArray(record.knownThrough) &&
      record.knownThrough.length > 0 &&
      (candidate.knownThrough as string[]).length === 0
    ) {
      continue;
    }
    const parsed = itemSchema.safeParse(candidate);
    if (!parsed.success) continue;
    if (seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    secrets.push(parsed.data);
  }
  return secrets;
}

/** Readable canon text for the planning model. */
export function planModelInput(canon: ReadModelOutput): string {
  const lines: string[] = [];
  lines.push(`Canon: ${canon.title}`);
  lines.push(`Logline: ${canon.logline}`);
  lines.push("");
  lines.push("Characters:");
  for (const character of canon.characters) {
    lines.push(`- ${character.name} (${character.id}): ${character.canon}`);
  }
  lines.push("");
  lines.push("Locations:");
  for (const location of canon.locations) {
    lines.push(`- ${location.name} (${location.id}): ${location.description}`);
  }
  lines.push("");
  lines.push("Parts:");
  const ordered = [...canon.parts].sort((a, b) => a.order - b.order);
  for (const part of ordered) {
    lines.push(
      `- ${part.title} (${part.id}, part ${part.order}): ${part.summary} ${part.excerpt}`,
    );
  }
  lines.push("");
  lines.push("Gaps:");
  for (const gap of canon.gaps) {
    lines.push(`- ${gap.question}`);
  }
  return lines.join("\n");
}

/** JSON Schema twin of the plan model output, sent as the response format. */
export function planModelJsonSchema(canon: ReadModelOutput): Record<string, unknown> {
  const partIds =
    canon.parts.length > 0 ? canon.parts.map((part) => part.id) : ["no-parts"];
  const characterIds =
    canon.characters.length > 0
      ? canon.characters.map((character) => character.id)
      : ["no-characters"];
  return {
    type: "object",
    properties: {
      channels: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            kind: { type: "string", enum: ["series", "game", "press"] },
            title: { type: "string" },
            pitch: { type: "string" },
          },
          required: ["id", "name", "kind", "title", "pitch"],
          additionalProperties: false,
        },
      },
      beats: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            partId: { type: "string", enum: partIds },
            channelId: { type: "string" },
            unitLabel: { type: "string" },
            title: { type: "string" },
            content: { type: "string" },
            characterIds: {
              type: "array",
              items: { type: "string", enum: characterIds },
            },
          },
          required: [
            "id",
            "partId",
            "channelId",
            "unitLabel",
            "title",
            "content",
            "characterIds",
          ],
          additionalProperties: false,
        },
      },
      secrets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            text: { type: "string" },
            knownThrough: { type: "array", items: { type: "string" } },
            note: { type: "string" },
          },
          required: ["id", "text", "knownThrough", "note"],
          additionalProperties: false,
        },
      },
    },
    required: ["channels", "beats", "secrets"],
    additionalProperties: false,
  };
}
