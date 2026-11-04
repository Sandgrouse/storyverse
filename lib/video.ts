import { z } from "zod";
import { allowedSecrets, scriptForScene } from "@/lib/script";
import {
  ShortSchema,
  WorldSchema,
  type Short,
  type ShortShot,
  type World,
} from "@/lib/world/schemas";

/**
 * Short video planning contract. Pure: no key, no fetch, so routes,
 * client components and tests can all import it.
 */

export const VIDEO_FPS = 30;

/** Frames shared between two shots for the crossfade. */
export const VIDEO_CROSSFADE_FRAMES = 12;

/** Shortest and longest a plan shot may run, in seconds. */
export const PLAN_SHOT_MIN_SEC = 3;
export const PLAN_SHOT_MAX_SEC = 7;

/** Shortest and longest the editor slider allows, in seconds. */
export const EDIT_SHOT_MIN_SEC = 2;
export const EDIT_SHOT_MAX_SEC = 12;

export const VIDEO_PLAN_INSTRUCTIONS =
  "You cut a short vertical-or-wide video from one scene of a story told across several channels. Use only the canon and the secrets this channel may know, listed below. A secret that belongs to another channel must never appear or be hinted at. Pick each shot's image only from the numbered list of available art, returning its exact path. Write one caption per shot of under 90 characters in the scene's own voice. Keep each shot 3 to 7 seconds long. Optionally give one shot a spoken line: the id of a character who is in the scene and the exact words they say, using their real name's voice. Use the world's real names and details exactly. Never rename anyone or change an established detail. Return only the shots.";

export const VIDEO_PLAN_SCHEMA_NAME = "video_plan";

export const VIDEO_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    shots: {
      type: "array",
      minItems: 4,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          imagePath: { type: "string" },
          caption: { type: "string" },
          durationSec: { type: "number" },
          motion: { type: "string", enum: ["push", "pan", "still"] },
          voice: {
            type: "object",
            properties: {
              characterId: { type: "string" },
              text: { type: "string" },
            },
            required: ["characterId", "text"],
            additionalProperties: false,
          },
        },
        required: ["imagePath", "caption", "durationSec", "motion"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "shots"],
  additionalProperties: false,
} as const;

export const VideoPlanRequestSchema = z.object({
  world: WorldSchema,
  channelId: z.string().min(1),
  partId: z.string().min(1),
});

export type VideoPlanRequest = z.infer<typeof VideoPlanRequestSchema>;

export const VideoPlanVoiceSchema = z.object({
  characterId: z.string().min(1),
  text: z.string().min(1).max(160),
});

export const VideoPlanShotSchema = z.object({
  imagePath: z.string().min(1),
  caption: z.string().min(1).max(90),
  durationSec: z.number().min(PLAN_SHOT_MIN_SEC).max(PLAN_SHOT_MAX_SEC),
  motion: z.enum(["push", "pan", "still"]),
  voice: VideoPlanVoiceSchema.optional(),
});

export const VideoPlanModelOutputSchema = z.object({
  title: z.string().min(1).max(80),
  shots: z.array(VideoPlanShotSchema).min(4).max(6),
});

export type VideoPlanModelOutput = z.infer<typeof VideoPlanModelOutputSchema>;

export const VIDEO_PLAN_NO_KEY_MESSAGE =
  "Shot plans aren't available on this server.";

export const VIDEO_PLAN_FAILED_MESSAGE = "Planning the shots failed.";

/**
 * Every non-empty art path in the world: part art, beat art, then
 * character art. The model must pick from this list; anything else
 * falls back to the part's own art.
 */
export function availableArtPaths(world: World): string[] {
  const paths: string[] = [];
  const push = (path: string | undefined) => {
    if (typeof path === "string" && path.length > 0 && !paths.includes(path)) {
      paths.push(path);
    }
  };
  for (const part of [...world.parts].sort((a, b) => a.order - b.order)) {
    push(part.imagePath);
  }
  for (const beat of [...world.beats].sort((a, b) => a.order - b.order)) {
    push(beat.imagePath);
  }
  for (const character of world.characters) {
    push(character.artPath);
    for (const view of character.sheet) push(view.imagePath);
  }
  return paths;
}

/**
 * Plan prompt: the channel, the part, the saved script when there is
 * one (otherwise this channel's beats here), the numbered art list,
 * and only the secrets this channel may know.
 */
export function videoPlanInput(
  world: World,
  channelId: string,
  partId: string,
): string {
  const channel = world.channels.find((c) => c.id === channelId);
  const part = world.parts.find((p) => p.id === partId);
  const lines: string[] = [
    `Cut a short video for ${channel?.name ?? channelId}, ${channel?.title ?? ""}.`.replace(
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
  lines.push("", "Available art (return the exact path):");
  const art = availableArtPaths(world);
  if (art.length === 0) {
    lines.push("- None yet.");
  } else {
    art.forEach((path, index) => lines.push(`${index + 1}. ${path}`));
  }
  lines.push("", "Characters in this scene:");
  const characterIds = new Set<string>();
  for (const beat of world.beats) {
    if (beat.partId === partId && beat.channelId === channelId) {
      for (const id of beat.characterIds) characterIds.add(id);
    }
  }
  const partEntry = world.parts.find((p) => p.id === partId);
  for (const id of partEntry?.characterIds ?? []) characterIds.add(id);
  if (characterIds.size === 0) {
    lines.push("- None named yet.");
  } else {
    for (const id of characterIds) {
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

export type PlannedShot = {
  imagePath: string;
  caption: string;
  durationSec: number;
  motion: ShortShot["motion"];
  voice?: { characterId: string; text: string };
};

/**
 * Turn validated model shots into stored shots. An image that is not
 * on the available-art list is rejected and replaced with the part's
 * own art. A voice line for an unknown character is dropped.
 */
export function toPlannedShots(
  modelShots: PlannedShot[],
  world: World,
  partId: string,
): ShortShot[] {
  const art = new Set(availableArtPaths(world));
  const partArt = world.parts.find((p) => p.id === partId)?.imagePath ?? "";
  const knownCharacters = new Set(world.characters.map((c) => c.id));
  return modelShots.map((shot, index) => {
    const voice =
      shot.voice && knownCharacters.has(shot.voice.characterId)
        ? shot.voice
        : undefined;
    return {
      id: `shot-${index + 1}`,
      imagePath: art.has(shot.imagePath) ? shot.imagePath : partArt,
      caption: shot.caption,
      durationSec: shot.durationSec,
      motion: shot.motion,
      ...(voice
        ? {
            voice: {
              characterId: voice.characterId,
              lineId: "",
              text: voice.text,
            },
          }
        : {}),
    };
  });
}

/** One short per channel and part: the id is the pair. */
export function shortIdFor(channelId: string, partId: string): string {
  return `${channelId}::${partId}`;
}

/** Build a stored short from planned shots, in plan order. */
export function planToShort(options: {
  channelId: string;
  partId: string;
  title: string;
  shots: ShortShot[];
  aspect?: Short["aspect"];
}): Short {
  return ShortSchema.parse({
    id: shortIdFor(options.channelId, options.partId),
    channelId: options.channelId,
    partId: options.partId,
    title: options.title,
    aspect: options.aspect ?? "16:9",
    shots: options.shots,
  });
}

/** The stored short for one channel's take on one part, if any. */
export function shortForScene(
  world: World,
  channelId: string,
  partId: string,
): Short | undefined {
  return (world.shorts ?? []).find(
    (short) => short.channelId === channelId && short.partId === partId,
  );
}

/** Add or replace the short for its channel and part. Pure. */
export function upsertShort(world: World, short: Short): World {
  const rest = (world.shorts ?? []).filter(
    (entry) =>
      !(entry.channelId === short.channelId && entry.partId === short.partId),
  );
  return { ...world, shorts: [...rest, short] };
}

/** Frames one shot holds on screen, at 30 fps. */
export function shotFrames(durationSec: number): number {
  return Math.max(1, Math.round(durationSec * VIDEO_FPS));
}

/**
 * Where each shot starts, in frames: the first at 0, each next
 * overlapping the last by the 12-frame crossfade.
 */
export function shotStartFrames(
  shots: Array<{ durationSec: number }>,
): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const shot of shots) {
    starts.push(at);
    at += Math.max(0, shotFrames(shot.durationSec) - VIDEO_CROSSFADE_FRAMES);
  }
  return starts;
}

/** Total frames of the cut, with crossfades overlapped. */
export function totalFrames(shots: Array<{ durationSec: number }>): number {
  if (shots.length === 0) return 0;
  const starts = shotStartFrames(shots);
  return (
    (starts[starts.length - 1] ?? 0) +
    shotFrames(shots[shots.length - 1]?.durationSec ?? 0)
  );
}

/** Total seconds of the cut, for the transport time. */
export function totalSeconds(shots: Array<{ durationSec: number }>): number {
  return totalFrames(shots) / VIDEO_FPS;
}

/** Move one shot to a new index, keeping the rest in order. Pure. */
export function moveShot<T>(shots: T[], from: number, to: number): T[] {
  if (from < 0 || from >= shots.length) return shots;
  const clamped = Math.max(0, Math.min(shots.length - 1, to));
  if (clamped === from) return shots;
  const next = shots.slice();
  const [moved] = next.splice(from, 1);
  if (!moved) return shots;
  next.splice(clamped, 0, moved);
  return next;
}

/** Clock label, `0:05 / 0:23`. */
export function clockLabel(currentSec: number, totalSec: number): string {
  const format = (value: number): string => {
    const clamped = Math.max(0, Math.floor(value));
    return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, "0")}`;
  };
  return `${format(currentSec)} / ${format(totalSec)}`;
}
