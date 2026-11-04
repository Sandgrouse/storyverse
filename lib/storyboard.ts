import { z } from "zod";
import { allowedSecrets, foreignSecretTexts, scriptForScene } from "@/lib/script";
import {
  StoryboardFramingSchema,
  StoryboardSchema,
  WorldSchema,
  type Storyboard,
  type StoryboardFrame,
  type StoryboardFraming,
  type World,
} from "@/lib/world/schemas";

/**
 * Storyboard planning contract. Pure: no key, no fetch, so routes,
 * client components and tests can all import it.
 */

export const STORYBOARD_FRAMINGS = [
  "wide",
  "medium",
  "close",
  "over-shoulder",
  "overhead",
] as const;

export const STORYBOARD_PLAN_INSTRUCTIONS =
  "You plan a storyboard for one scene of a story told across several channels: a row of pencil-sketch shots. Use only the canon and the secrets this channel may know, listed below. A secret that belongs to another channel must never appear or be hinted at in any frame. Plan each frame's framing, what happens in it in at most 160 characters, a spoken line in at most 120 characters or null when no one speaks, a camera note in at most 80 characters or null, and the ids of the characters who appear, chosen only from the characters in the scene. Use the world's real names and details exactly. Never rename anyone or change an established detail. Return 4 to 8 frames.";

export const STORYBOARD_PLAN_SCHEMA_NAME = "storyboard_plan";

export const STORYBOARD_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    frames: {
      type: "array",
      items: {
        type: "object",
        properties: {
          framing: {
            type: "string",
            enum: ["wide", "medium", "close", "over-shoulder", "overhead"],
          },
          action: { type: "string" },
          dialogue: { anyOf: [{ type: "string" }, { type: "null" }] },
          camera: { anyOf: [{ type: "string" }, { type: "null" }] },
          characterIds: { type: "array", items: { type: "string" } },
        },
        required: ["framing", "action", "dialogue", "camera", "characterIds"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "frames"],
  additionalProperties: false,
} as const;

export const StoryboardPlanRequestSchema = z.object({
  world: WorldSchema,
  channelId: z.string().min(1),
  partId: z.string().min(1),
});

export type StoryboardPlanRequest = z.infer<typeof StoryboardPlanRequestSchema>;

/**
 * The model always sends every key (strict structured output), so
 * dialogue and camera arrive as strings or null. Length limits are
 * validated in code, not here, so one long line never fails the plan.
 */
export const StoryboardPlanFrameSchema = z.object({
  framing: StoryboardFramingSchema,
  action: z.string(),
  dialogue: z.string().nullable().optional(),
  camera: z.string().nullable().optional(),
  characterIds: z.array(z.string()),
});

export const StoryboardPlanModelOutputSchema = z.object({
  title: z.string().min(1).max(80),
  frames: z.array(StoryboardPlanFrameSchema),
});

export type StoryboardPlanModelOutput = z.infer<
  typeof StoryboardPlanModelOutputSchema
>;

export const STORYBOARD_PLAN_NO_KEY_MESSAGE =
  "Storyboard plans aren't available on this server.";

export const STORYBOARD_PLAN_FAILED_MESSAGE =
  "Muse couldn't plan this scene. Try again, or add frames with +.";

/** Longest text a frame keeps, in characters. */
export const PLAN_ACTION_MAX = 160;
export const PLAN_DIALOGUE_MAX = 120;
export const PLAN_CAMERA_MAX = 80;

/** Most frames one plan keeps. */
export const STORYBOARD_PLAN_MAX_FRAMES = 8;

/**
 * Fewest usable frames for a plan to succeed. A plan asks for 4 to 8
 * frames, but when fewer come back the board keeps them without
 * complaint; only a plan with nothing usable fails.
 */
export const STORYBOARD_PLAN_MIN_USABLE_FRAMES = 1;

/** Characters in this scene: this channel's beats here plus the part. */
export function sceneCharacterIds(
  world: World,
  channelId: string,
  partId: string,
): string[] {
  const ids: string[] = [];
  const push = (id: string) => {
    if (!ids.includes(id)) ids.push(id);
  };
  for (const beat of world.beats) {
    if (beat.partId === partId && beat.channelId === channelId) {
      for (const id of beat.characterIds) push(id);
    }
  }
  const part = world.parts.find((p) => p.id === partId);
  for (const id of part?.characterIds ?? []) push(id);
  return ids;
}

/**
 * Plan prompt: the channel, the part, the saved script when there is
 * one (otherwise this channel's beats here), the characters in the
 * scene, and only the secrets this channel may know.
 */
export function storyboardPlanInput(
  world: World,
  channelId: string,
  partId: string,
): string {
  const channel = world.channels.find((c) => c.id === channelId);
  const part = world.parts.find((p) => p.id === partId);
  const lines: string[] = [
    `Plan a storyboard for ${channel?.name ?? channelId}, ${channel?.title ?? ""}.`.replace(
      /, \.$/,
      ".",
    ),
    `Part: ${part?.title ?? partId} — ${part?.summary ?? ""}`,
  ];
  if (part?.excerpt) lines.push(`Excerpt: ${part.excerpt}`);
  const saved = scriptForScene(world, channelId, partId);
  if (saved && saved.text.trim().length > 0) {
    lines.push("", "The scene's script:", saved.text);
  } else {
    lines.push("", "This channel's beats on this part:");
    const beats = world.beats
      .filter((beat) => beat.partId === partId && beat.channelId === channelId)
      .sort((a, b) => a.order - b.order);
    if (beats.length === 0) {
      lines.push("- None yet.");
    } else {
      for (const beat of beats) {
        lines.push(`- ${beat.title} (${beat.unitLabel}): ${beat.content}`);
      }
    }
  }
  lines.push("", "Characters in this scene:");
  const ids = sceneCharacterIds(world, channelId, partId);
  if (ids.length === 0) {
    lines.push("- None named yet.");
  } else {
    for (const id of ids) {
      const character = world.characters.find((c) => c.id === id);
      if (character) lines.push(`- ${character.name} (id: ${character.id})`);
    }
  }
  lines.push("", "Secrets this channel may know:");
  const { channelSecret, secrets } = allowedSecrets(world, channelId);
  if (channelSecret) lines.push(`- ${channelSecret} (this channel's own secret)`);
  for (const secret of secrets) lines.push(`- ${secret.text}. ${secret.note}`);
  if (!channelSecret && secrets.length === 0) {
    lines.push("- None yet: everything this channel shows is on the surface.");
  }
  return lines.join("\n");
}

export type PlannedFrame = {
  framing: StoryboardFraming;
  action: string;
  dialogue?: string;
  camera?: string;
  characterIds: string[];
};

/** Shorten text to a limit, cutting at a word boundary when it has one. */
export function truncateToLimit(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  const cut = trimmed.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  const kept = (space > 0 ? cut.slice(0, space) : cut).trimEnd();
  return kept.length > 0 ? kept : cut.trimEnd();
}

/**
 * Turn raw model frames into usable planned frames: drop empty
 * actions, truncate long lines, map null dialogue and camera to no
 * line, keep at most 8. The caller fails the plan only when nothing
 * remains.
 */
export function sanitizePlannedFrames(
  modelFrames: Array<{
    framing: StoryboardFraming;
    action: string;
    dialogue?: string | null;
    camera?: string | null;
    characterIds: string[];
  }>,
): PlannedFrame[] {
  const usable: PlannedFrame[] = [];
  for (const frame of modelFrames) {
    const action = truncateToLimit(frame.action ?? "", PLAN_ACTION_MAX);
    if (action.length === 0) continue;
    const dialogue =
      frame.dialogue && frame.dialogue.trim().length > 0
        ? truncateToLimit(frame.dialogue, PLAN_DIALOGUE_MAX)
        : undefined;
    const camera =
      frame.camera && frame.camera.trim().length > 0
        ? truncateToLimit(frame.camera, PLAN_CAMERA_MAX)
        : undefined;
    usable.push({
      framing: frame.framing,
      action,
      ...(dialogue ? { dialogue } : {}),
      ...(camera ? { camera } : {}),
      characterIds: [...(frame.characterIds ?? [])],
    });
    if (usable.length >= STORYBOARD_PLAN_MAX_FRAMES) break;
  }
  return usable;
}

/**
 * Turn validated model frames into stored frames. A characterId the
 * world does not know is rejected and dropped from the frame. A frame
 * that repeats a secret from another channel is dropped whole.
 */
export function toPlannedFrames(
  modelFrames: PlannedFrame[],
  world: World,
  channelId: string,
): StoryboardFrame[] {
  const known = new Set(world.characters.map((c) => c.id));
  const foreign = foreignSecretTexts(world, channelId);
  const kept: StoryboardFrame[] = [];
  modelFrames.forEach((frame, index) => {
    const says = [frame.action, frame.dialogue ?? "", frame.camera ?? ""].join(
      "\n",
    );
    if (
      foreign.some(
        (secret) => secret.length > 0 && says.includes(secret),
      )
    ) {
      return;
    }
    kept.push({
      id: `frame-${index + 1}`,
      framing: frame.framing,
      action: frame.action,
      ...(frame.dialogue ? { dialogue: frame.dialogue } : {}),
      ...(frame.camera ? { camera: frame.camera } : {}),
      characterIds: frame.characterIds.filter((id) => known.has(id)),
    });
  });
  return kept;
}

/** One storyboard per channel and part: the id is the pair. */
export function storyboardIdFor(channelId: string, partId: string): string {
  return `${channelId}::${partId}`;
}

/** Build a stored storyboard from planned frames, in plan order. */
export function planToStoryboard(options: {
  channelId: string;
  partId: string;
  title: string;
  frames: StoryboardFrame[];
}): Storyboard {
  return StoryboardSchema.parse({
    id: storyboardIdFor(options.channelId, options.partId),
    channelId: options.channelId,
    partId: options.partId,
    title: options.title,
    frames: options.frames,
  });
}

/** The stored storyboard for one channel's take on one part, if any. */
export function storyboardForScene(
  world: World,
  channelId: string,
  partId: string,
): Storyboard | undefined {
  return (world.storyboards ?? []).find(
    (board) =>
      board.channelId === channelId && board.partId === partId,
  );
}

/** Add or replace the storyboard for its channel and part. Pure. */
export function upsertStoryboard(world: World, board: Storyboard): World {
  const rest = (world.storyboards ?? []).filter(
    (entry) =>
      !(entry.channelId === board.channelId && entry.partId === board.partId),
  );
  return { ...world, storyboards: [...rest, board] };
}

/** Move one frame to a new index, keeping the rest in order. Pure. */
export function moveFrame<T>(frames: T[], from: number, to: number): T[] {
  if (from < 0 || from >= frames.length) return frames;
  const clamped = Math.max(0, Math.min(frames.length - 1, to));
  if (clamped === from) return frames;
  const next = frames.slice();
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return frames;
  next.splice(clamped, 0, moved);
  return next;
}
