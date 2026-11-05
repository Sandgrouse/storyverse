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

/** Shortest and longest a storyboard-cut shot may run, in seconds. */
export const BOARD_SHOT_MIN_SEC = 3;
export const BOARD_SHOT_MAX_SEC = 6;

/** Frames shared between two shots for the crossfade. */
export const VIDEO_CROSSFADE_FRAMES = 12;

/** Shortest and longest a plan shot may run, in seconds. */
export const PLAN_SHOT_MIN_SEC = 3;
export const PLAN_SHOT_MAX_SEC = 7;

/** Shortest and longest the editor slider allows, in seconds. */
export const EDIT_SHOT_MIN_SEC = 2;
export const EDIT_SHOT_MAX_SEC = 12;

export const VIDEO_PLAN_INSTRUCTIONS =
  "You cut a short vertical-or-wide video from one scene of a story told across several channels. Use only the canon and the secrets this channel may know, listed below. A secret that belongs to another channel must never appear or be hinted at. Pick each shot's image only from the numbered list of available art, returning its exact path. Write one caption per shot of under 90 characters in the scene's own voice. Keep each shot 3 to 7 seconds long. Optionally give one shot a spoken line: the id of a character who is in the scene and the exact words they say, using their real name's voice. Use the world's real names and details exactly. Never rename anyone or change an established detail. Return at least 4 shots. Return only the shots.";

export const VIDEO_PLAN_SCHEMA_NAME = "video_plan";

export const VIDEO_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          imagePath: { type: "string" },
          caption: { type: "string" },
          durationSec: { type: "number" },
          motion: { type: "string", enum: ["push", "pan", "still"] },
          voice: {
            anyOf: [
              {
                type: "object",
                properties: {
                  characterId: { type: "string" },
                  text: { type: "string" },
                },
                required: ["characterId", "text"],
                additionalProperties: false,
              },
              { type: "null" },
            ],
          },
        },
        required: ["imagePath", "caption", "durationSec", "motion", "voice"],
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

/**
 * The model always sends every key (strict structured output), so voice
 * arrives as an object or null. Limits are validated in code, not here,
 * so one long caption or slow shot never fails the whole plan.
 */
export const VideoPlanVoiceSchema = z.object({
  characterId: z.string(),
  text: z.string(),
});

export const VideoPlanShotSchema = z.object({
  imagePath: z.string(),
  caption: z.string(),
  durationSec: z.number(),
  motion: z.enum(["push", "pan", "still"]),
  voice: VideoPlanVoiceSchema.nullable().optional(),
});

export const VideoPlanModelOutputSchema = z.object({
  title: z.string().min(1).max(80),
  shots: z.array(VideoPlanShotSchema),
});

export type VideoPlanModelOutput = z.infer<typeof VideoPlanModelOutputSchema>;

export const VIDEO_PLAN_NO_KEY_MESSAGE =
  "Shot plans aren't available on this server.";

export const VIDEO_PLAN_FAILED_MESSAGE =
  "Muse couldn't plan this scene. Try again, or add shots with +.";

/** Longest caption a shot keeps, in characters. */
export const PLAN_CAPTION_MAX = 90;

/** Most shots one plan keeps. */
export const VIDEO_PLAN_MAX_SHOTS = 6;

/**
 * Fewest usable shots for a plan to succeed. A short plan asks for at
 * least 4 shots, but when fewer come back the cut keeps them without
 * complaint; only a plan with nothing usable fails.
 */
export const VIDEO_PLAN_MIN_USABLE_SHOTS = 1;

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
 * The storyboard's frames as plain text guidance, if this scene has
 * a board: one line per frame with its framing, action and spoken
 * line. Frames carry no secrets, only the scene's own staging.
 */
export function storyboardGuidance(
  world: World,
  channelId: string,
  partId: string,
): string[] {
  const board = (world.storyboards ?? []).find(
    (entry) => entry.channelId === channelId && entry.partId === partId,
  );
  const frames = board?.frames ?? [];
  if (frames.length === 0) return [];
  return frames.map((frame, index) => {
    const said =
      frame.dialogue && frame.dialogue.trim().length > 0
        ? ` Says: "${frame.dialogue.trim()}".`
        : "";
    const action =
      frame.action.trim().length > 0 ? frame.action.trim() : "No action noted.";
    return `Frame ${index + 1} (${frame.framing}): ${action}.${said}`;
  });
}

/**
 * Plan prompt: the channel, the part, the saved script when there is
 * one (otherwise this channel's beats here), the storyboard frames as
 * guidance when there is a board, the numbered art list, and only the
 * secrets this channel may know.
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
  const guidance = storyboardGuidance(world, channelId, partId);
  if (guidance.length > 0) {
    lines.push("", "Storyboard guidance (follow these frames):", ...guidance);
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
  /** Null from the model means no voice, same as missing. */
  voice?: { characterId: string; text: string } | null;
};

/** How long a storyboard-cut shot holds: longer text holds longer. */
export function storyboardShotDuration(
  action: string,
  dialogue?: string,
): number {
  const said = dialogue?.trim() ?? "";
  const length = `${action.trim()}${said.length > 0 ? ` ${said}` : ""}`.length;
  if (length <= 60) return BOARD_SHOT_MIN_SEC;
  if (length <= 110) return BOARD_SHOT_MIN_SEC + 1;
  if (length <= 160) return BOARD_SHOT_MIN_SEC + 2;
  return BOARD_SHOT_MAX_SEC;
}

/** One storyboard frame as cut input: only sketched frames cut. */
export type BoardFrameShotSource = {
  imagePath?: string;
  action: string;
  dialogue?: string;
  characterIds: string[];
};

/**
 * Build planned shots directly from storyboard frames, in order, with
 * no model call: one slow push-in per sketched frame. Frames without a
 * picture are skipped. The caption is the frame's action; the spoken
 * line is the frame's dialogue, spoken by its first character, only
 * when voices are on.
 */
export function shotsFromStoryboard(
  frames: BoardFrameShotSource[],
  options: { voices: boolean },
): PlannedShot[] {
  const shots: PlannedShot[] = [];
  for (const frame of frames) {
    const imagePath = frame.imagePath ?? "";
    if (imagePath.length === 0) continue;
    const caption = truncateCaption(frame.action ?? "");
    if (caption.length === 0) continue;
    const durationSec = storyboardShotDuration(
      frame.action ?? "",
      frame.dialogue,
    );
    const said = frame.dialogue?.trim() ?? "";
    const characterId = frame.characterIds[0]?.trim() ?? "";
    const voice =
      options.voices && said.length > 0 && characterId.length > 0
        ? { characterId, text: said }
        : undefined;
    shots.push({
      imagePath,
      caption,
      durationSec,
      motion: "push",
      ...(voice ? { voice } : {}),
    });
  }
  return shots;
}

/** Shorten a caption to 90 characters, cutting at a word boundary. */
export function truncateCaption(caption: string): string {
  const text = caption.trim();
  if (text.length <= PLAN_CAPTION_MAX) return text;
  const cut = text.slice(0, PLAN_CAPTION_MAX);
  const space = cut.lastIndexOf(" ");
  const kept = (space > 0 ? cut.slice(0, space) : cut).trimEnd();
  return kept.length > 0 ? kept : cut.trimEnd();
}

/** Clamp a shot duration to 3 to 7 seconds. Null when it is no number. */
export function clampShotDuration(durationSec: number): number | null {
  if (typeof durationSec !== "number" || !Number.isFinite(durationSec)) {
    return null;
  }
  return Math.min(
    PLAN_SHOT_MAX_SEC,
    Math.max(PLAN_SHOT_MIN_SEC, durationSec),
  );
}

/**
 * Turn raw model shots into usable planned shots: drop empty captions
 * and bad durations, clamp the rest, map null voice to no voice, keep
 * at most 6. The caller fails the plan only when nothing remains.
 */
export function sanitizePlannedShots(
  modelShots: Array<{
    imagePath: string;
    caption: string;
    durationSec: number;
    motion: ShortShot["motion"];
    voice?: { characterId: string; text: string } | null;
  }>,
): PlannedShot[] {
  const usable: PlannedShot[] = [];
  for (const shot of modelShots) {
    const caption = truncateCaption(shot.caption ?? "");
    const durationSec = clampShotDuration(shot.durationSec);
    if (caption.length === 0 || durationSec === null) continue;
    const voice =
      shot.voice &&
      shot.voice.characterId.trim().length > 0 &&
      shot.voice.text.trim().length > 0
        ? { characterId: shot.voice.characterId, text: shot.voice.text }
        : undefined;
    usable.push({
      imagePath: shot.imagePath ?? "",
      caption,
      durationSec,
      motion: shot.motion,
      ...(voice ? { voice } : {}),
    });
    if (usable.length >= VIDEO_PLAN_MAX_SHOTS) break;
  }
  return usable;
}

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

/**
 * The video page's left list: every channel that has at least one
 * beat, with that channel's beats in story order. Channels with no
 * beats are left out. Pure, so the page and tests share it.
 */
export function scenesByChannel(
  world: World,
): Array<{ channel: World["channels"][number]; beats: World["beats"] }> {
  const beats = [...world.beats].sort((a, b) => a.order - b.order);
  return world.channels.flatMap((channel) => {
    const here = beats.filter((beat) => beat.channelId === channel.id);
    return here.length > 0 ? [{ channel, beats: here }] : [];
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

/**
 * Fit the player inside the stage box without covering the transport
 * or the timeline: start from the stage's height, keep the 16:9 or 9:16
 * ratio, and shrink to the stage's width only when that still overflows.
 * Pure so tests can check both shapes at real viewport sizes.
 */
export function fitPlayer(
  stageWidth: number,
  stageHeight: number,
  tall: boolean,
): { width: number; height: number } {
  const ratio = tall ? 9 / 16 : 16 / 9;
  let height = Math.max(0, stageHeight);
  let width = height * ratio;
  if (width > stageWidth) {
    width = Math.max(0, stageWidth);
    height = width / ratio;
  }
  return { width: Math.floor(width), height: Math.floor(height) };
}

/** True when an image's natural size is portrait: taller than wide. */
export function isPortraitArt(
  naturalWidth: number,
  naturalHeight: number,
): boolean {
  return naturalHeight > naturalWidth;
}

/**
 * Where a shot's image sits in the frame. Portrait art in a wide cut
 * anchors near the top so heads stay in frame instead of torsos; a
 * tall cut and landscape art stay centred. Plain CSS keywords and
 * percentages only, so the web renderer supports them.
 */
export function shotObjectPosition(portrait: boolean, tall: boolean): string {
  return !tall && portrait ? "50% 12%" : "50% 50%";
}

/** Audio for one shot: the saved line's data URL, if it is playable. */
export function audioForShot(world: World, shot: ShortShot): string | undefined {
  const lineId = shot.voice?.lineId;
  if (!lineId) return undefined;
  const character = world.characters.find(
    (entry) => entry.id === shot.voice?.characterId,
  );
  const audioPath = character?.lines?.find(
    (line) => line.id === lineId,
  )?.audioPath;
  if (!audioPath || audioPath.startsWith("idb:")) return undefined;
  return audioPath;
}
