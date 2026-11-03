import { z } from "zod";
import {
  RippleFixKindSchema,
  RippleFixSchema,
  WorldSchema,
  type RippleFix,
  type World,
} from "@/lib/world/schemas";

export const RIPPLE_INSTRUCTIONS =
  "You are a continuity editor for a story told across several channels. Given the canon and a proposed change, walk through every part and every channel, and report each place the change touches, in three kinds: a contradiction (the scene is now false), a shift in meaning (the scene still holds but now reads differently), or a missing setup (a channel needs a planted clue so the change feels earned when fans compare channels). Only report what the change really touches. A harmless change touches nothing, so return no fixes for it. Respect what each channel may reveal: a secret that belongs to one channel must not leak into another, and a clue may hint without revealing. Never rename anyone or change established details. Propose the smallest fix per scene, in plain language.";

export const APPLY_INSTRUCTIONS =
  "Rewrite this scene as little as possible so it carries out the proposal. Keep every name and established detail, reveal nothing that belongs only to another channel, and return only the scene.";

export const CHECK_INSTRUCTIONS =
  "You are a continuity editor for a story told across several channels. Given the canon and the proposed change, decide whether the canon is now consistent with the change. Scenes the creator approved are already rewritten in the canon; scenes kept as is were deliberately left alone. Return consistent true only if every channel now agrees with the change, with a short note saying so in plain language. Otherwise return consistent false with a short note saying what still breaks, in plain language.";

/** Readable canon text for model input. */
export function serializeCanon(world: World): string {
  const channels = new Map(world.channels.map((c) => [c.id, c]));
  const parts = new Map(world.parts.map((p) => [p.id, p]));
  const lines: string[] = [];
  lines.push(`Canon: ${world.title}`);
  lines.push(`Premise: ${world.premise}`);
  lines.push("");
  lines.push("Characters:");
  for (const character of world.characters) {
    lines.push(`- ${character.name}: ${character.canon}`);
  }
  lines.push("");
  lines.push("Parts:");
  const orderedParts = [...world.parts].sort((a, b) => a.order - b.order);
  for (const part of orderedParts) {
    lines.push(`- Part ${part.order} (${part.id}): ${part.title} — ${part.summary}`);
  }
  lines.push("");
  lines.push("Beats:");
  const orderedBeats = [...world.beats].sort((a, b) => a.order - b.order);
  for (const beat of orderedBeats) {
    const channel = channels.get(beat.channelId)?.name ?? beat.channelId;
    const part = parts.get(beat.partId)?.title ?? beat.partId;
    lines.push(
      `- [${beat.id}] ${beat.title} (channel: ${channel}, part: ${part}, ${beat.unitLabel}): ${beat.content}`,
    );
  }
  lines.push("");
  lines.push("Secrets (and the channels that may know them):");
  for (const secret of world.secrets) {
    const known =
      secret.knownThrough.length > 0
        ? secret.knownThrough
            .map((id) => channels.get(id)?.name ?? id)
            .join(", ")
        : "no channel yet";
    lines.push(`- ${secret.text} (known through: ${known}). ${secret.note}`);
  }
  return lines.join("\n");
}

/** Fix shape the model returns. beatId is an enum of this world's beat ids. */
export function buildRippleModelFixSchema(world: World) {
  const ids = world.beats.map((b) => b.id);
  const beatIds = (ids.length > 0 ? ids : ["no-beats"]) as [string, ...string[]];
  return z.object({
    beatId: z.enum(beatIds),
    kind: RippleFixKindSchema,
    title: z.string().min(1),
    problem: z.string().min(1),
    proposal: z.string().min(1),
    quote: z.string().min(1),
    regeneratesImage: z.boolean(),
  });
}

export function rippleModelInput(change: string, world: World): string {
  return `Proposed change: ${change}\n\n${serializeCanon(world)}`;
}

/** JSON Schema twin of the model fix schema, sent as the response format. */
export function rippleModelJsonSchema(world: World): Record<string, unknown> {
  const beatIds = world.beats.map((b) => b.id);
  return {
    type: "object",
    properties: {
      summary: { type: "string" },
      fixes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            beatId: { type: "string", enum: beatIds },
            kind: { type: "string", enum: ["contradiction", "meaning", "setup"] },
            title: { type: "string" },
            problem: { type: "string" },
            proposal: { type: "string" },
            quote: { type: "string" },
            regeneratesImage: { type: "boolean" },
          },
          required: [
            "beatId",
            "kind",
            "title",
            "problem",
            "proposal",
            "quote",
            "regeneratesImage",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "fixes"],
    additionalProperties: false,
  };
}

export const RippleModelOutputSchema = z.object({
  summary: z.string(),
  fixes: z.array(z.unknown()),
});

export type RippleModelFix = z.infer<ReturnType<typeof buildRippleModelFixSchema>>;

/**
 * Validate each model fix on its own against the beat-id enum, then derive
 * channelId and partId from the beat. Drops any fix whose beatId is unknown
 * or does not resolve, instead of failing the whole ripple.
 */
export function toRippleFixes(
  modelFixes: unknown[],
  world: World,
): RippleFix[] {
  const fixSchema = buildRippleModelFixSchema(world);
  const beats = new Map(world.beats.map((b) => [b.id, b]));
  const seen = new Set<string>();
  const fixes: RippleFix[] = [];
  modelFixes.forEach((raw, index) => {
    const parsed = fixSchema.safeParse(raw);
    if (!parsed.success) return;
    const beat = beats.get(parsed.data.beatId);
    if (!beat) return;
    let id = beat.id;
    if (seen.has(id)) id = `${beat.id}-${index + 1}`;
    seen.add(id);
    fixes.push(
      RippleFixSchema.parse({
        id,
        beatId: beat.id,
        channelId: beat.channelId,
        partId: beat.partId,
        kind: parsed.data.kind,
        title: parsed.data.title,
        problem: parsed.data.problem,
        proposal: parsed.data.proposal,
        quote: parsed.data.quote,
        regeneratesImage: parsed.data.regeneratesImage,
        status: "pending",
      }),
    );
  });
  return fixes;
}

export const RippleRequestSchema = z.object({
  change: z.string().min(1).max(1000),
  world: WorldSchema,
});

export const ApplyRequestSchema = z.object({
  change: z.string().min(1).max(1000),
  fix: RippleFixSchema,
  world: WorldSchema,
});

export const ApplyResponseSchema = z.object({
  content: z.string(),
  sample: z.boolean().optional(),
});

export const ApplyModelOutputSchema = z.object({
  content: z.string().min(1),
});

export function applyModelInput(
  change: string,
  fix: RippleFix,
  world: World,
): string {
  const beat = world.beats.find((b) => b.id === fix.beatId);
  const channel =
    world.channels.find((c) => c.id === fix.channelId)?.name ?? fix.channelId;
  const part = world.parts.find((p) => p.id === fix.partId)?.title ?? fix.partId;
  return [
    `Proposed change: ${change}`,
    `Scene to rewrite: ${fix.title} (channel: ${channel}, part: ${part})`,
    `Current text: ${beat?.content ?? ""}`,
    `Problem: ${fix.problem}`,
    `Proposal: ${fix.proposal}`,
    "",
    serializeCanon(world),
    "",
    "Rewrite the scene now.",
  ].join("\n");
}

export const CheckRequestSchema = z.object({
  change: z.string().min(1).max(1000),
  world: WorldSchema,
});

export const CheckResponseSchema = z.object({
  consistent: z.boolean(),
  note: z.string(),
  sample: z.boolean().optional(),
});

export const CheckModelOutputSchema = z.object({
  consistent: z.boolean(),
  note: z.string().min(1),
});

export function checkModelInput(change: string, world: World): string {
  return `Proposed change: ${change}\n\nThe canon already reflects every fix the creator approved:\n\n${serializeCanon(world)}`;
}
