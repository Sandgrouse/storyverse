import JSZip from "jszip";
import { visualStyleLine } from "@/lib/style";
import { packToMarkdown } from "@/lib/pack";
import {
  RAEA_GAME_EDIT,
  raeaGameReadme,
  raeaStoryTs,
  type RaeaGameScene,
} from "@/lib/raea-game";
import {
  RAEA_VIDEO_EDIT,
  imageIsPortrait,
  mediaExtension,
  raeaShotsTs,
  raeaVideoReadme,
  type RaeaShot,
} from "@/lib/raea-video";
import { hasFullSheet } from "@/lib/readiness";
import { audioForShot } from "@/lib/video";
import type { Storyboard, World } from "@/lib/world/schemas";

/**
 * Agent package: a per-channel ZIP an outside coding agent can build
 * from. The secret rule is structural: every file is generated from a
 * filtered copy of the world that holds only this channel's beats,
 * packs and secrets, no character secrets, and no other channel's
 * secret. Anything unscoped is left out rather than guessed at.
 */

export type PackageFileType =
  | "brief"
  | "manifest"
  | "world"
  | "timeline"
  | "secrets"
  | "character-canon"
  | "sheet"
  | "cutout"
  | "voice"
  | "voice-audio"
  | "scene-art"
  | "scene-brief"
  | "script"
  | "storyboard"
  | "storyboard-sketch"
  | "pack"
  | "studio-rules"
  | "studio-project"
  | "studio-readme"
  | "studio-notice"
  | "game-concept"
  | "narrative"
  | "character-doc"
  | "art-bible"
  | "entities"
  | "story-doc"
  | "engine-reference"
  | "stage"
  | "gitkeep"
  | "agents-readme"
  | "setup-script"
  | "raea-readme"
  | "raea-edit"
  | "raea-data"
  | "raea-media";

export type PackageFile = {
  /** Path inside the ZIP, starting with `<story>-<channel>/`. */
  path: string;
  type: PackageFileType;
  character?: string;
  part?: string;
  /** True when the file is a suggested addition. */
  suggested: boolean;
  /** Expected but absent: left out of the ZIP, noted in the manifest. */
  missing: boolean;
  content?: string | Uint8Array;
};

export type ManifestEntry = {
  path: string;
  type: PackageFileType;
  character?: string;
  part?: string;
  suggested: boolean;
  missing: boolean;
};

/** Root folder of the package. */
export function packageRoot(world: World, channelId: string): string {
  return `${world.id}-${channelId}`;
}

/**
 * The world as this channel may see it: its own beats, packs and
 * secrets only. Character secrets and other channels' secrets are
 * unscoped or foreign, so they are stripped, never guessed at.
 */
export function channelWorld(world: World, channelId: string): World {
  return {
    ...world,
    secrets: world.secrets.filter((secret) =>
      secret.knownThrough.includes(channelId),
    ),
    beats: world.beats.filter((beat) => beat.channelId === channelId),
    packs: world.packs.filter((pack) => pack.channelId === channelId),
    scripts: world.scripts.filter((script) => script.channelId === channelId),
    storyboards: (world.storyboards ?? []).filter(
      (board) => board.channelId === channelId,
    ),
    characters: world.characters.map((character) => ({
      ...character,
      secret: undefined,
    })),
    channels: world.channels.map((channel) => ({
      ...channel,
      secret: channel.id === channelId ? channel.secret : "",
    })),
  };
}

/** Secrets the channel's players or viewers may learn, in plain words. */
export function learnableSecrets(filtered: World): string[] {
  const own = filtered.channels
    .map((c) => c.secret)
    .filter((secret) => secret.length > 0);
  return [...own, ...filtered.secrets.map((secret) => secret.text)];
}

function channelOf(world: World, channelId: string) {
  return world.channels.find((c) => c.id === channelId);
}

/** What this channel's players or viewers may learn, and nothing else. */
export function agentBrief(filtered: World, channelId: string): string {
  const channel = channelOf(filtered, channelId);
  const secrets = learnableSecrets(filtered);
  const lines = [
    `# Agent brief — ${channel?.name ?? channelId} (${filtered.title})`,
    "",
    `You are building the ${channel?.kind ?? "series"} channel${channel?.title ? ` "${channel.title}"` : ""} of "${filtered.title}". Build only from the files in this package.`,
    "",
    "The players or viewers may learn:",
  ];
  if (secrets.length === 0) {
    lines.push(
      "- Nothing hidden yet: everything they meet is on the surface.",
    );
  } else {
    for (const secret of secrets) lines.push(`- ${secret}`);
  }
  lines.push(
    "",
    "Everything else in the wider story is deliberately absent from this package. Do not invent it, import it, or hint at it.",
    "",
    'Files marked "suggested addition" are model suggestions the creator has not confirmed; canon files are not.',
    "Files listed as missing in manifest.json do not exist yet and are not in this ZIP.",
    "",
  );
  return lines.join("\n");
}

/** Canon overview without secrets; those live in canon/secrets.json. */
export function worldMarkdown(filtered: World, channelId: string): string {
  const lines = [`# ${filtered.title}`, "", filtered.premise, ""];
  lines.push("## Channels", "");
  for (const channel of filtered.channels) {
    const mine = channel.id === channelId ? " (this package)" : "";
    const pitch = [channel.title, channel.tagline, channel.pitch]
      .filter((part) => part.length > 0)
      .join(" ");
    lines.push(`- ${channel.name} (${channel.kind})${mine}${pitch ? `: ${pitch}` : ""}`);
    if (channel.id === channelId && channel.secret) {
      lines.push(`  Reveals: ${channel.secret}`);
    }
  }
  lines.push("", "## Characters", "");
  for (const character of filtered.characters) {
    lines.push(`- ${character.name}: ${character.canon}`);
  }
  lines.push("", "## Locations", "");
  if (filtered.locations.length === 0) {
    lines.push("- None named yet.");
  } else {
    for (const location of filtered.locations) {
      lines.push(`- ${location.name}: ${location.description}`);
    }
  }
  lines.push("", "## Parts", "");
  for (const part of [...filtered.parts].sort((a, b) => a.order - b.order)) {
    lines.push(`- Part ${part.order} (${part.id}): ${part.title} — ${part.summary}`);
  }
  lines.push("", "Secrets this channel may know live in canon/secrets.json.", "");
  return lines.join("\n");
}

/** This channel's beats in story order. */
export function timelineJson(filtered: World): string {
  const parts = new Map(filtered.parts.map((p) => [p.id, p]));
  const beats = [...filtered.beats]
    .sort((a, b) => a.order - b.order)
    .map((beat) => ({
      id: beat.id,
      part: parts.get(beat.partId)?.title ?? beat.partId,
      unit: beat.unitLabel,
      title: beat.title,
      content: beat.content,
      characters: beat.characterIds,
    }));
  return `${JSON.stringify(beats, null, 2)}\n`;
}

/** Only secrets this channel may know, with their suggested flags. */
export function secretsJson(filtered: World): string {
  const secrets = filtered.secrets.map((secret) => ({
    id: secret.id,
    text: secret.text,
    note: secret.note,
    suggested: secret.suggested,
  }));
  return `${JSON.stringify(secrets, null, 2)}\n`;
}

/** One part's brief for this channel: canon summary plus its beats. */
export function sceneBrief(
  filtered: World,
  channelId: string,
  partId: string,
): string {
  const part = filtered.parts.find((p) => p.id === partId);
  const channel = channelOf(filtered, channelId);
  const beats = filtered.beats
    .filter((beat) => beat.partId === partId)
    .sort((a, b) => a.order - b.order);
  const lines = [
    `# ${part?.title ?? partId} (${channel?.name ?? channelId})`,
    "",
    part ? `Part ${part.order}: ${part.summary}` : "",
    "",
    "## Beats",
    "",
  ];
  if (beats.length === 0) {
    lines.push("- None yet.");
  } else {
    for (const beat of beats) {
      lines.push(`- ${beat.unitLabel}: ${beat.title} — ${beat.content}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** A storyboard's frames in order, text only: no sketch bytes. */
export function storyboardJson(board: Storyboard): string {
  const frames = board.frames.map((frame) => ({
    id: frame.id,
    framing: frame.framing,
    action: frame.action,
    ...(frame.dialogue !== undefined ? { dialogue: frame.dialogue } : {}),
    ...(frame.camera !== undefined ? { camera: frame.camera } : {}),
    characterIds: frame.characterIds,
  }));
  return `${JSON.stringify(frames, null, 2)}\n`;
}

/** A character's voice index: which voice speaks, and each saved line. */
export function voiceIndexJson(character: {
  id: string;
  name: string;
  voice?: { id: string; name: string };
  lines?: Array<{ id: string; text: string }>;
}): string {
  return (
    `${JSON.stringify(
      {
        character: character.id,
        name: character.name,
        voiceId: character.voice?.id ?? null,
        voiceName: character.voice?.name ?? null,
        lines: (character.lines ?? []).map((line) => ({
          id: line.id,
          text: line.text,
        })),
      },
      null,
      2,
    )}\n`
  );
}

/** Decode a `data:<mime>;base64,...` URL to bytes. Null when not one. */
export function dataUrlToBytes(
  dataUrl: string,
): { bytes: Uint8Array; mime: string } | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(
    dataUrl.trim(),
  );
  if (!match) return null;
  try {
    const binary = atob(match[2].replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { bytes, mime: match[1] ?? "" };
  } catch {
    return null;
  }
}

/** A shipped art path: exactly one leading `/`, so not `//`. */
function isPublicArtPath(value: string | undefined): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
  );
}

/**
 * Replace shipped public art paths (`/anukili/fire.webp`) with the data
 * URLs `load` fetches. The pure planners below only decode data URLs,
 * so they would drop every public path; inlining first keeps that art
 * in the package. Covers sheets, cut-outs, part art, storyboard frames
 * and short shots. A path `load` cannot return as a `data:image/` URL
 * keeps its value and is left out as it is today. Returns the same
 * world object when no field needs replacing.
 */
export async function inlinePublicArt(
  world: World,
  load: (path: string) => Promise<string | null>,
): Promise<World> {
  const paths: string[] = [];
  const seen = new Set<string>();
  const want = (value: string | undefined): void => {
    if (isPublicArtPath(value) && !seen.has(value)) {
      seen.add(value);
      paths.push(value);
    }
  };
  for (const character of world.characters) {
    for (const view of character.sheet) {
      want(view.imagePath);
      want(view.cutoutPath);
    }
  }
  for (const part of world.parts) {
    want(part.imagePath);
  }
  for (const board of world.storyboards ?? []) {
    for (const frame of board.frames) {
      want(frame.imagePath);
    }
  }
  for (const short of world.shorts ?? []) {
    for (const shot of short.shots) {
      want(shot.imagePath);
    }
  }
  if (paths.length === 0) return world;
  const inlined = new Map<string, string>();
  await Promise.all(
    paths.map(async (path) => {
      let dataUrl: string | null;
      try {
        dataUrl = await load(path);
      } catch {
        return;
      }
      if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) {
        inlined.set(path, dataUrl);
      }
    }),
  );
  if (inlined.size === 0) return world;
  const imagePathOf = (value: string): string => inlined.get(value) ?? value;
  return {
    ...world,
    characters: world.characters.map((character) => ({
      ...character,
      sheet: character.sheet.map((view) => ({
        ...view,
        imagePath: imagePathOf(view.imagePath),
        ...(view.cutoutPath === undefined
          ? {}
          : { cutoutPath: imagePathOf(view.cutoutPath) }),
      })),
    })),
    parts: world.parts.map((part) => ({
      ...part,
      imagePath: imagePathOf(part.imagePath),
    })),
    storyboards: (world.storyboards ?? []).map((board) => ({
      ...board,
      frames: board.frames.map((frame) => ({
        ...frame,
        ...(frame.imagePath === undefined
          ? {}
          : { imagePath: imagePathOf(frame.imagePath) }),
      })),
    })),
    shorts: (world.shorts ?? []).map((short) => ({
      ...short,
      shots: short.shots.map((shot) => ({
        ...shot,
        imagePath: imagePathOf(shot.imagePath),
      })),
    })),
  };
}

/**
 * One image file, or null when there is nothing to put in it. An image
 * the owner has not made yet is unfinished work, not a missing file:
 * it is left out of the file list entirely (the dashboard's "Not made
 * yet" list reports it) instead of becoming a `missing: true` entry
 * with a warning line. This was the "N expected files are missing"
 * cause: every ungenerated sheet view, cutout, scene artwork, sketch
 * and voice line used to report as a missing file.
 */
function imageEntry(
  root: string,
  path: string,
  type: PackageFileType,
  dataUrl: string | undefined,
  extra: { character?: string; part?: string },
): PackageFile | null {
  const decoded = dataUrl ? dataUrlToBytes(dataUrl) : null;
  if (!decoded) return null;
  return {
    path: root ? `${root}/${path}` : path,
    type,
    ...extra,
    suggested: false,
    missing: false,
    content: decoded.bytes,
  };
}

/** Push a file unless it is null (nothing made yet). */
function pushFile(files: PackageFile[], file: PackageFile | null): void {
  if (file) files.push(file);
}

export type ChannelTile = {
  label: string;
  value: string;
  sub: string;
  made: number;
  total: number;
};

/** The six design sections a game channel's design entries fill. */
export const GAME_DESIGN_SECTIONS = [
  "Game type",
  "Camera and view",
  "Core mechanics",
  "Goal and ending",
  "Controls",
  "Progression",
] as const;

function channelKindOf(world: World, channelId: string): string {
  return world.channels.find((c) => c.id === channelId)?.kind ?? "series";
}

/**
 * The six design sections with the owner's saved text, if any. Design
 * entries (`ScriptEntry.form === "design"`) hold one-line blocks such
 * as `Game type: Platformer. ...`; the text after the prefix is the
 * section's short text, null when the owner has not decided it yet.
 * Pure, so the dashboard and tests share it.
 */
export function gameDesignSections(
  world: World,
  channelId: string,
): Array<{ label: string; text: string | null }> {
  const combined = world.scripts
    .filter(
      (script) => script.channelId === channelId && script.form === "design",
    )
    .map((script) => script.text)
    .join("\n");
  const lines = combined.split("\n").map((line) => line.trim());
  return GAME_DESIGN_SECTIONS.map((label) => {
    const line = lines.find((entry) => entry.startsWith(`${label}:`));
    const rest = line ? line.slice(label.length + 1).trim() : "";
    return { label, text: rest.length > 0 ? rest : null };
  });
}

/**
 * Stat tiles for the selected channel only: screen kinds
 * (series/shorts/film) count scripts, storyboards and videos;
 * the game counts places and filled design sections instead of
 * storyboards and videos; copy kinds (website/press/ad/other)
 * count copy. Pure, so the dashboard and tests share it.
 */
export function packageChannelTiles(
  world: World,
  channelId: string,
): ChannelTile[] {
  const kind = channelKindOf(world, channelId);
  const fullSheets = world.characters.filter(hasFullSheet).length;
  const voices = world.characters.filter((c) => c.voice).length;
  const characters: ChannelTile = {
    label: "Characters",
    value: `${world.characters.length}`,
    sub: `${fullSheets} full sheets · ${voices} voices`,
    made: fullSheets,
    total: world.characters.length,
  };
  const keptApart = world.secrets.filter(
    (secret) => secret.knownThrough.length === 0,
  ).length;
  const secrets: ChannelTile = {
    label: "Secrets kept apart",
    value: `${keptApart}`,
    sub: `of ${world.secrets.length} secrets`,
    made: keptApart,
    total: world.secrets.length,
  };
  if (kind === "game") {
    const filled = gameDesignSections(world, channelId).filter(
      (section) => section.text !== null,
    ).length;
    const places =
      world.locations.length === 1
        ? "1 place in the canon"
        : `${world.locations.length} places in the canon`;
    return [
      characters,
      {
        label: "Places",
        value: `${world.locations.length}`,
        sub: places,
        made: world.locations.length,
        total: world.locations.length,
      },
      {
        label: "Game design",
        value: `${filled} of 6`,
        sub:
          filled === 6
            ? "sections filled"
            : "sections filled · rest not decided",
        made: filled,
        total: 6,
      },
      {
        label: "Character art ready",
        value: `${fullSheets}`,
        sub: `of ${world.characters.length} characters`,
        made: fullSheets,
        total: world.characters.length,
      },
      secrets,
    ];
  }
  const covered = new Set(
    world.beats
      .filter((beat) => beat.channelId === channelId)
      .map((beat) => beat.partId),
  );
  const scenes: ChannelTile = {
    label: "Scenes told",
    value: `${covered.size}`,
    sub: `of ${world.parts.length} scenes`,
    made: covered.size,
    total: world.parts.length,
  };
  const scriptsWritten = world.scripts.filter(
    (script) => script.channelId === channelId,
  ).length;
  const artMade = world.parts.filter(
    (part) => covered.has(part.id) && part.imagePath.length > 0,
  ).length;
  const art: ChannelTile = {
    label: "Scene art",
    value: `${artMade}`,
    sub:
      covered.size === 0 ? "no scenes told yet" : `of ${covered.size} told`,
    made: artMade,
    total: covered.size,
  };
  if (kind === "website" || kind === "press" || kind === "ad" || kind === "other") {
    return [
      characters,
      scenes,
      {
        label: "Copy written",
        value: `${scriptsWritten}`,
        sub:
          covered.size === 0
            ? "no scenes told yet"
            : `of ${covered.size} planned`,
        made: scriptsWritten,
        total: covered.size,
      },
      art,
      secrets,
    ];
  }
  const boards = (world.storyboards ?? []).filter(
    (board) => board.channelId === channelId,
  ).length;
  const videos = (world.shorts ?? []).filter(
    (short) => short.channelId === channelId,
  ).length;
  const planned = (sub: string) =>
    covered.size === 0 ? "no scenes told yet" : `of ${covered.size} ${sub}`;
  return [
    characters,
    scenes,
    {
      label: "Scripts written",
      value: `${scriptsWritten}`,
      sub: planned("planned"),
      made: scriptsWritten,
      total: covered.size,
    },
    {
      label: "Storyboards",
      value: `${boards}`,
      sub: planned("planned"),
      made: boards,
      total: covered.size,
    },
    {
      label: "Videos",
      value: `${videos}`,
      sub: planned("planned"),
      made: videos,
      total: covered.size,
    },
    art,
    secrets,
  ];
}

/**
 * An raea render folder per short of this non-game channel: `edit.tsx`,
 * `shots.ts`, a README and the shot art and voice lines under `media/`.
 * Only shorts of this channel are read, so another channel's captions
 * never appear. A shot whose image doesn't decode, or has an unknown
 * image type, is left out and named in the README; a short with no
 * usable shots gets no folder. Shots sharing one imagePath share one
 * media file, numbered by first use.
 */
function planRaeaFiles(
  world: World,
  channelId: string,
  root: string,
): PackageFile[] {
  const files: PackageFile[] = [];
  for (const short of world.shorts ?? []) {
    if (short.channelId !== channelId) continue;
    const base = `${root}/raea/${short.partId}`;
    const mediaByPath = new Map<string, string>();
    const media: PackageFile[] = [];
    const shots: RaeaShot[] = [];
    const leftOut: number[] = [];
    short.shots.forEach((shot, index) => {
      const decoded = shot.imagePath ? dataUrlToBytes(shot.imagePath) : null;
      const ext = decoded ? mediaExtension(decoded.mime) : null;
      const imageExt = ext === "webp" || ext === "png" || ext === "jpg" ? ext : null;
      if (!decoded || !imageExt) {
        leftOut.push(index + 1);
        return;
      }
      let image = mediaByPath.get(shot.imagePath);
      if (!image) {
        image = `shot-${String(mediaByPath.size + 1).padStart(2, "0")}.${imageExt}`;
        mediaByPath.set(shot.imagePath, image);
        media.push({
          path: `${base}/media/${image}`,
          type: "raea-media",
          part: short.partId,
          suggested: false,
          missing: false,
          content: decoded.bytes,
        });
      }
      let audio: string | undefined;
      const line = audioForShot(world, shot);
      if (line) {
        const voice = dataUrlToBytes(line);
        const voiceExt = voice ? mediaExtension(voice.mime) : null;
        if (voice && (voiceExt === "mp3" || voiceExt === "wav")) {
          audio = `line-${String(index + 1).padStart(2, "0")}.${voiceExt}`;
          media.push({
            path: `${base}/media/${audio}`,
            type: "raea-media",
            part: short.partId,
            suggested: false,
            missing: false,
            content: voice.bytes,
          });
        }
      }
      shots.push({
        image,
        caption: shot.caption,
        durationSec: shot.durationSec,
        motion: shot.motion,
        portrait: imageIsPortrait(decoded.bytes),
        ...(audio ? { audio } : {}),
      });
    });
    if (shots.length === 0) continue;
    files.push({
      path: `${base}/README.md`,
      type: "raea-readme",
      part: short.partId,
      suggested: false,
      missing: false,
      content: raeaVideoReadme(short.title, leftOut),
    });
    files.push({
      path: `${base}/edit.tsx`,
      type: "raea-edit",
      part: short.partId,
      suggested: false,
      missing: false,
      content: RAEA_VIDEO_EDIT,
    });
    files.push({
      path: `${base}/shots.ts`,
      type: "raea-data",
      part: short.partId,
      suggested: false,
      missing: false,
      content: raeaShotsTs(shots, short.aspect),
    });
    files.push(...media);
  }
  return files;
}

/**
 * Every file the package should hold, including expected-but-missing
 * ones (no content, missing: true). Pure and fully testable.
 */
export function planAgentFiles(world: World, channelId: string): PackageFile[] {
  const filtered = channelWorld(world, channelId);
  const root = packageRoot(world, channelId);
  const channel = channelOf(world, channelId);
  if (!channel) return [];
  if (channel.kind === "game") return planGameFiles(world, channelId);
  const files: PackageFile[] = [];

  const brief = agentBrief(filtered, channelId);
  files.push({
    path: `${root}/AGENT_BRIEF.md`,
    type: "brief",
    suggested: false,
    missing: false,
    content: brief,
  });

  files.push({
    path: `${root}/canon/world.md`,
    type: "world",
    suggested: false,
    missing: false,
    content: worldMarkdown(filtered, channelId),
  });
  files.push({
    path: `${root}/canon/timeline.json`,
    type: "timeline",
    suggested: false,
    missing: false,
    content: timelineJson(filtered),
  });
  files.push({
    path: `${root}/canon/secrets.json`,
    type: "secrets",
    suggested: false,
    missing: false,
    content: secretsJson(filtered),
  });

  for (const character of filtered.characters) {
    files.push({
      path: `${root}/characters/${character.id}/canon.md`,
      type: "character-canon",
      character: character.id,
      suggested: false,
      missing: false,
      content: `# ${character.name}\n\n${character.canon}\n`,
    });
    const source = world.characters.find((c) => c.id === character.id);
    for (const view of source?.sheet ?? []) {
      pushFile(
        files,
        imageEntry(root, `characters/${character.id}/sheet/${view.view}.webp`, "sheet", view.imagePath, {
          character: character.id,
        }),
      );
      pushFile(
        files,
        imageEntry(
          root,
          `characters/${character.id}/cutouts/${view.view}.png`,
          "cutout",
          view.cutoutPath,
          { character: character.id },
        ),
      );
    }
    const voiceLines = source?.lines ?? [];
    if (source && (source.voice || voiceLines.length > 0)) {
      files.push({
        path: `${root}/characters/${character.id}/voice.json`,
        type: "voice",
        character: character.id,
        suggested: false,
        missing: false,
        content: voiceIndexJson(source),
      });
      for (const line of voiceLines) {
        const decoded = line.audioPath ? dataUrlToBytes(line.audioPath) : null;
        if (!decoded) continue;
        files.push({
          path: `${root}/characters/${character.id}/voice/${line.id}.mp3`,
          type: "voice-audio",
          character: character.id,
          suggested: false,
          missing: false,
          content: decoded.bytes,
        });
      }
    }
  }

  const covered = new Set(filtered.beats.map((beat) => beat.partId));
  for (const part of [...filtered.parts].sort((a, b) => a.order - b.order)) {
    if (!covered.has(part.id)) continue;
    pushFile(
      files,
      imageEntry(root, `scenes/${part.id}/art.webp`, "scene-art", part.imagePath, {
        part: part.id,
      }),
    );
    files.push({
      path: `${root}/scenes/${part.id}/brief.md`,
      type: "scene-brief",
      part: part.id,
      suggested: false,
      missing: false,
      content: sceneBrief(filtered, channelId, part.id),
    });
    const pack = filtered.packs.find((p) => p.partId === part.id);
    if (pack) {
      files.push({
        path: `${root}/packs/${part.id}.md`,
        type: "pack",
        part: part.id,
        suggested: true,
        missing: false,
        content: packToMarkdown(filtered, pack),
      });
    }
  }

  for (const script of filtered.scripts) {
    files.push({
      path: `${root}/scripts/${script.partId}.txt`,
      type: "script",
      part: script.partId,
      suggested: false,
      missing: false,
      content: script.text,
    });
  }

  for (const board of filtered.storyboards) {
    if (!covered.has(board.partId)) continue;
    files.push({
      path: `${root}/scenes/${board.partId}/storyboard.json`,
      type: "storyboard",
      part: board.partId,
      suggested: false,
      missing: false,
      content: storyboardJson(board),
    });
    for (const frame of board.frames) {
      pushFile(
        files,
        imageEntry(
          root,
          `scenes/${board.partId}/storyboard/${frame.id}.webp`,
          "storyboard-sketch",
          frame.imagePath,
          { part: board.partId },
        ),
      );
    }
  }

  files.push(...planRaeaFiles(world, channelId, root));

  const manifest: ManifestEntry[] = files.map((file) => ({
    path: file.path,
    type: file.type,
    ...(file.character ? { character: file.character } : {}),
    ...(file.part ? { part: file.part } : {}),
    suggested: file.suggested,
    missing: file.missing,
  }));
  files.splice(1, 0, {
    path: `${root}/manifest.json`,
    type: "manifest",
    suggested: false,
    missing: false,
    content: `${JSON.stringify({ story: world.id, channel: channelId, files: manifest }, null, 2)}\n`,
  });

  return files;
}

/** The drawer's tree preview: what will really be in the ZIP. */
export function packageTree(files: PackageFile[]): string {
  const included = files.filter((file) => !file.missing);
  const missing = files.length - included.length;
  const lines = included.map((file) =>
    file.path.replace(/^[^/]+\//, "  "),
  );
  const root = files[0]?.path.split("/")[0] ?? "package";
  const out = [`${root}/`, ...lines];
  if (missing > 0) {
    out.push(
      `(${missing} expected ${missing === 1 ? "file is" : "files are"} missing; see manifest.json)`,
    );
  }
  return out.join("\n");
}

/** Build the real ZIP: included files only. */
export async function buildAgentZip(
  world: World,
  channelId: string,
): Promise<{ blob: Blob; files: PackageFile[] }> {
  const files = planAgentFiles(world, channelId);
  const zip = new JSZip();
  for (const file of files) {
    if (file.missing || file.content === undefined) continue;
    zip.file(
      file.path,
      file.content,
      file.path.endsWith("setup-studio.sh")
        ? { unixPermissions: 0o100755 }
        : undefined,
    );
  }
  // UNIX platform so executable bits survive the round trip.
  const blob = await zip.generateAsync({ type: "blob", platform: "UNIX" });
  return { blob, files };
}

/** Byte size of a planned file, for the dashboard's folder tree. */
export function fileSizeOf(file: PackageFile): number {
  if (file.content === undefined) return 0;
  if (typeof file.content === "string") {
    return new TextEncoder().encode(file.content).length;
  }
  return file.content.byteLength;
}

/** Short human size: `412 B`, `3.2 KB`, `1.1 MB`. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export const STUDIO_TEMPLATE_URL =
  "https://github.com/Donchitos/Claude-Code-Game-Studios";

/** Minimal YAML escaping for names and descriptions we generate. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

function gameOf(world: World, channelId: string) {
  return world.channels.find((c) => c.id === channelId);
}

/**
 * Project rules for Muse Code: the game's name, engine, language, the
 * secret rule (this game may know only its own secret), real names
 * only, and pointers to design/, docs/ and production/.
 */
export function gameAgentsMd(filtered: World, channelId: string): string {
  const channel = gameOf(filtered, channelId);
  const secrets = learnableSecrets(filtered);
  const lines = [
    `# ${channel?.title || channel?.name || channelId} — agent rules (Muse Code)`,
    ``,
    `You are building the game channel of "${filtered.title}". Build only from the files in this package, in Godot 4 with GDScript.`,
    ``,
    `- Game: ${channel?.title || channel?.name || channelId}`,
    `- Engine: Godot 4`,
    `- Language: GDScript`,
    `- Secrets: this game may know only its own secret.`,
  ];
  if (secrets.length === 0) {
    lines.push(`- Nothing hidden yet: everything the player meets is on the surface.`);
  } else {
    lines.push(`- The player may learn:`);
    for (const secret of secrets) lines.push(`  - ${secret}`);
  }
  lines.push(
    ``,
    `Use real names only: never rename anyone or change an established detail.`,
    `Everything else in the wider story is deliberately absent from this package. Do not invent it, import it, or hint at it.`,
    ``,
    `Work from \`design/\` (what the game is), \`docs/\` (how each scene plays), and \`production/\` (what is made and what is next).`,
  );
  if (gameHasRaeaStarter(filtered)) {
    lines.push(
      `\`raea/\` holds an optional starter for the raea engine. Use it only if the owner asks to build in raea; otherwise build in Godot 4.`,
    );
  }
  lines.push(``);
  return lines.join("\n");
}

/** Machine-readable project pointer: schema, engine, names. */
export function gameProjectYaml(filtered: World, channelId: string): string {
  const channel = gameOf(filtered, channelId);
  return [
    `schema_version: 1`,
    `engine: godot`,
    `project: ${yamlString(filtered.title)}`,
    `channel: ${yamlString(channelId)}`,
    `channel_title: ${yamlString(channel?.title || channel?.name || channelId)}`,
    ``,
  ].join("\n");
}

/** What this package is and how to open it. */
export function gameReadmeMd(filtered: World, channelId: string): string {
  const channel = gameOf(filtered, channelId);
  const lines = [
    `# ${filtered.title} — ${channel?.title || channel?.name || channelId} game package`,
    ``,
    `An agent package: everything a coding agent needs to build the game channel of "${filtered.title}" in Godot 4 with GDScript. It holds only this channel's secret.`,
    ``,
  ];
  if (gameHasRaeaStarter(filtered)) {
    lines.push(
      `An optional starter for building this game in raea instead of Godot is in \`raea/\`; see \`raea/README.md\`.`,
      ``,
    );
  }
  lines.push(
    `## Opening it`,
    ``,
    `Step 1. Unzip this package and open the folder.`,
    `Step 2. Run \`sh scripts/setup-studio.sh\` from the package root to fetch the studio template's shared files.`,
    `Step 3. Hand the folder to Muse Code and point it at AGENTS.md.`,
    ``,
    `See STUDIO-NOTICE.md for the template this layout follows.`,
    ``,
  );
  return lines.join("\n");
}

/**
 * The game-design script entry for this channel when the owner has
 * written one (the earliest part's), otherwise a concept built from
 * the canon.
 */
export function gameConceptMd(filtered: World, channelId: string): string {
  const channel = gameOf(filtered, channelId);
  const scripts = filtered.scripts
    .filter((script) => script.channelId === channelId)
    .sort((a, b) => {
      const orderOf = (partId: string) =>
        filtered.parts.find((p) => p.id === partId)?.order ?? 0;
      return orderOf(a.partId) - orderOf(b.partId);
    });
  const saved = scripts[0];
  if (saved) {
    const part = filtered.parts.find((p) => p.id === saved.partId);
    return [
      `# Game concept — ${channel?.title || channel?.name || channelId}`,
      ``,
      `Saved game-design script (${part?.title ?? saved.partId}), written for this channel:`,
      ``,
      saved.text,
      ``,
    ].join("\n");
  }
  const lines = [
    `# Game concept — ${channel?.title || channel?.name || channelId}`,
    ``,
    `Concept built from the canon (no game-design script written yet):`,
    ``,
    filtered.premise,
    ``,
    `## Parts`,
    ``,
  ];
  for (const part of [...filtered.parts].sort((a, b) => a.order - b.order)) {
    lines.push(`- Part ${part.order} (${part.title}): ${part.summary}`);
  }
  lines.push(
    ``,
    `## Cast`,
    ``,
  );
  for (const character of filtered.characters) {
    lines.push(`- ${character.name}: ${character.canon}`);
  }
  lines.push(``);
  return lines.join("\n");
}

/** The story as parts, with this channel's beats under each. */
export function gameStoryMd(filtered: World, channelId: string): string {
  const lines = [`# Story — ${filtered.title}`, ``, filtered.premise, ``];
  for (const part of [...filtered.parts].sort((a, b) => a.order - b.order)) {
    lines.push(`## Part ${part.order}: ${part.title}`, ``, part.summary, ``);
    if (part.excerpt) lines.push(`> ${part.excerpt}`, ``);
    const beats = filtered.beats
      .filter((beat) => beat.partId === part.id)
      .sort((a, b) => a.order - b.order);
    if (beats.length > 0) {
      for (const beat of beats) {
        lines.push(`- ${beat.unitLabel}: ${beat.title} — ${beat.content}`);
      }
      lines.push(``);
    }
  }
  return lines.join("\n");
}

/** One character file: canon text, voice, and saved lines. */
export function gameCharacterMd(character: {
  id: string;
  name: string;
  canon: string;
  voice?: { name: string };
  lines?: Array<{ text: string }>;
}): string {
  const lines = [`# ${character.name}`, ``, character.canon, ``, `## Voice`, ``];
  lines.push(character.voice ? character.voice.name : `No voice yet.`, ``);
  lines.push(`## Lines`, ``);
  if (character.lines && character.lines.length > 0) {
    for (const line of character.lines) lines.push(`- ${line.text}`);
  } else {
    lines.push(`No recorded lines yet.`);
  }
  lines.push(``);
  return lines.join("\n");
}

/**
 * Art direction: the palette from the project's part tints, the style
 * notes, and the character sheets and scene art on file.
 */
export function gameArtBibleMd(
  filtered: World,
  assets: { sheets: string[]; scenes: string[] },
): string {
  const tints = [...new Set(filtered.parts.map((p) => p.tint).filter(Boolean))];
  const styleLine = visualStyleLine(filtered.visualStyle);
  const lines = [
    `# Art bible — ${filtered.title}`,
    ``,
    `## Visual style`,
    ``,
    styleLine.length > 0 ? styleLine : `No visual style chosen yet.`,
    ``,
    `## Palette`,
    ``,
  ];
  if (tints.length === 0) {
    lines.push(`No palette set yet.`, ``);
  } else {
    for (const tint of tints) lines.push(`- ${tint}`);
    lines.push(``);
  }
  lines.push(
    `## Style notes`,
    ``,
    `Characters stay on-model: same face, build, clothing and carried items in every view. Scenes keep each character exactly as in their reference, with no text, letters, logos or watermarks.`,
    ``,
    `## Character sheets`,
    ``,
  );
  if (assets.sheets.length === 0) {
    lines.push(`No sheets made yet.`, ``);
  } else {
    for (const path of assets.sheets) lines.push(`- ${path}`);
    lines.push(``);
  }
  lines.push(`## Scene art`, ``);
  if (assets.scenes.length === 0) {
    lines.push(`No scene art made yet.`, ``);
  } else {
    for (const path of assets.scenes) lines.push(`- ${path}`);
    lines.push(``);
  }
  return lines.join("\n");
}

/** Characters and places registry both Muse Code and Godot can read. */
export function gameEntitiesYaml(filtered: World): string {
  const lines = [`characters:`];
  for (const character of filtered.characters) {
    lines.push(
      `  - id: ${yamlString(character.id)}`,
      `    name: ${yamlString(character.name)}`,
    );
  }
  lines.push(`places:`);
  for (const location of filtered.locations) {
    lines.push(
      `  - id: ${yamlString(location.id)}`,
      `    name: ${yamlString(location.name)}`,
      `    description: ${yamlString(location.description)}`,
    );
  }
  lines.push(``);
  return lines.join("\n");
}

/** Where the engine reference comes from: the studio template. */
export function gameEngineReferenceMd(): string {
  return [
    `# Godot engine reference`,
    ``,
    `The full Godot reference ships with the Claude Code Game Studios template, fetched by \`scripts/setup-studio.sh\`.`,
    ``,
    `Online copy: ${STUDIO_TEMPLATE_URL}`,
    ``,
  ].join("\n");
}

/** What the studio's agents are and how they install. */
export function gameAgentsReadmeMd(): string {
  return [
    `# Studio agents`,
    ``,
    `The studio's agents and skills are not vendored here. They install through \`scripts/setup-studio.sh\`, which copies the template's \`.claude/\` directory into \`.agents/\` (renamed for Muse Code) without overwriting this package's files.`,
    ``,
    `Run once from the package root:`,
    ``,
    `    sh scripts/setup-studio.sh`,
    ``,
  ].join("\n");
}

/**
 * Fetch the template, rename it for Muse Code, copy without
 * overwriting. Text replacements never touch LICENSE.
 */
export function gameSetupScript(): string {
  return [
    `#!/usr/bin/env bash`,
    `# Install the Claude Code Game Studios template's shared files into`,
    `# this package, renamed for Muse Code. Run from the package root:`,
    `#`,
    `#     sh scripts/setup-studio.sh`,
    `set -euo pipefail`,
    ``,
    `if ! command -v git >/dev/null 2>&1; then`,
    `  echo "setup-studio.sh: git is required but was not found. Install git, then run again." >&2`,
    `  exit 1`,
    `fi`,
    ``,
    `TEMPLATE_URL="${STUDIO_TEMPLATE_URL}.git"`,
    `WORK="$(mktemp -d)"`,
    `trap 'rm -rf "$WORK"' EXIT INT TERM`,
    ``,
    `echo "setup-studio.sh: cloning $TEMPLATE_URL ..."`,
    `git clone --depth 1 "$TEMPLATE_URL" "$WORK/template"`,
    ``,
    `cd "$WORK/template"`,
    `RENAMED=0`,
    `while IFS= read -r CLAUDE_FILE; do`,
    `  [ -n "$CLAUDE_FILE" ] || continue`,
    `  mv "$CLAUDE_FILE" "$(dirname "$CLAUDE_FILE")/AGENTS.md"`,
    `  echo "setup-studio.sh: renamed $CLAUDE_FILE to AGENTS.md"`,
    `  RENAMED=$((RENAMED + 1))`,
    `done <<EOF`,
    `$(find . -name 'CLAUDE.md' | sort)`,
    `EOF`,
    `echo "setup-studio.sh: renamed $RENAMED CLAUDE.md file(s) to AGENTS.md"`,
    ``,
    `CHANGED=0`,
    `while IFS= read -r TEXT_FILE; do`,
    `  [ -n "$TEXT_FILE" ] || continue`,
    `  case "$TEXT_FILE" in *LICENSE*) continue;; esac`,
    `  if grep -Iq 'Claude' "$TEXT_FILE"; then`,
    `    sed 's/Claude Code/Muse Code/g; s/Claude/Muse/g' "$TEXT_FILE" > "$TEXT_FILE.muse"`,
    `    mv "$TEXT_FILE.muse" "$TEXT_FILE"`,
    `    CHANGED=$((CHANGED + 1))`,
    `  fi`,
    `done <<EOF`,
    `$(find . -type f | sort)`,
    `EOF`,
    `echo "setup-studio.sh: replaced Claude names with Muse in $CHANGED text file(s), never in LICENSE"`,
    ``,
    `cd - >/dev/null`,
    `if [ -d "$WORK/template/.claude" ]; then`,
    `  mkdir -p .agents`,
    `  cp -Rn "$WORK/template/.claude/." .agents/`,
    `  echo "setup-studio.sh: installed the studio agents into .agents/ (from the template's .claude/)"`,
    `fi`,
    `tar -cf - -C "$WORK/template" --exclude=.git --exclude=.claude . | tar -xkf - -C .`,
    `echo "setup-studio.sh: copied the template's other files without overwriting this package"`,
    `echo "setup-studio.sh: done. The studio agents and skills are ready under .agents/"`,
    ``,
  ].join("\n");
}

/** Template credit, MIT license note, and the Muse Code caveat. */
export function gameStudioNoticeMd(): string {
  return [
    `# Studio template notice`,
    ``,
    `This game package follows the open-source "Claude Code Game Studios" template (${STUDIO_TEMPLATE_URL}), MIT license.`,
    ``,
    `Copyright notice and license text: See LICENSE in the template, copied by setup-studio.sh.`,
    ``,
    `The renamed agents and skills under \`.agents/\` have not been tested with Muse Code.`,
    ``,
  ].join("\n");
}

/** production/stage.md: Concept, plus what is made and not made yet. */
export function gameStageMd(
  made: string[],
  notMade: string[],
): string {
  const lines = [`# Stage: Concept`, ``];
  lines.push(`## Made`, ``);
  if (made.length === 0) {
    lines.push(`- Nothing yet.`, ``);
  } else {
    for (const item of made) lines.push(`- ${item}`);
    lines.push(``);
  }
  lines.push(`## Not made yet`, ``);
  if (notMade.length === 0) {
    lines.push(`- Everything planned is made.`, ``);
  } else {
    for (const item of notMade) lines.push(`- ${item}`);
    lines.push(``);
  }
  return lines.join("\n");
}

/**
 * True when this game channel covers at least one part, so the
 * package holds the optional `raea/` starter folder.
 */
function gameHasRaeaStarter(filtered: World): boolean {
  return filtered.parts.some((part) =>
    filtered.beats.some((beat) => beat.partId === part.id),
  );
}

/** Image extensions the starter can ship: anything else is left out. */
const RAEA_GAME_IMAGE_EXTS = new Set(["webp", "png", "jpg"]);

/**
 * One image the starter can ship, or null when there is nothing to
 * put in it: no data URL, not decodable, or an unknown type (as if
 * it had not been made).
 */
function raeaGameImage(
  dataUrl: string | undefined,
): { bytes: Uint8Array; ext: string } | null {
  const decoded = dataUrl ? dataUrlToBytes(dataUrl) : null;
  if (!decoded) return null;
  const ext = mediaExtension(decoded.mime);
  if (!ext || !RAEA_GAME_IMAGE_EXTS.has(ext)) return null;
  return { bytes: decoded.bytes, ext };
}

/**
 * The hero image: the first character with any usable image. A
 * cut-out beats a sheet image, and the `front` view beats other
 * views. Null when no character has one; the starter then draws a
 * plain block.
 */
function raeaGameHero(
  filtered: World,
  world: World,
): { bytes: Uint8Array; ext: string } | null {
  for (const character of filtered.characters) {
    const source = world.characters.find((c) => c.id === character.id);
    const views = source?.sheet ?? [];
    const ranked: Array<string | undefined> = [];
    for (const view of views) {
      if (view.view === "front") ranked.push(view.cutoutPath);
    }
    for (const view of views) {
      if (view.view !== "front") ranked.push(view.cutoutPath);
    }
    for (const view of views) {
      if (view.view === "front") ranked.push(view.imagePath);
    }
    for (const view of views) {
      if (view.view !== "front") ranked.push(view.imagePath);
    }
    for (const candidate of ranked) {
      const usable = raeaGameImage(candidate);
      if (usable) return usable;
    }
  }
  return null;
}

/**
 * An optional `raea/` starter at the package root: the character
 * walks through the scenes this channel covers, in `order`. Only the
 * filtered channel world is read, so an uncovered part never appears
 * and no secret text of any channel is in any file.
 */
function planRaeaGameFiles(world: World, channelId: string): PackageFile[] {
  const filtered = channelWorld(world, channelId);
  const channel = channelOf(filtered, channelId);
  if (!channel) return [];
  const covered = [...filtered.parts]
    .sort((a, b) => a.order - b.order)
    .filter((part) =>
      filtered.beats.some((beat) => beat.partId === part.id),
    );
  if (covered.length === 0) return [];
  const title = channel.title || channel.name || channelId;
  const files: PackageFile[] = [];
  const hero = raeaGameHero(filtered, world);
  const heroFile = hero ? `hero.${hero.ext}` : null;
  const scenes: RaeaGameScene[] = [];
  const media: PackageFile[] = [];
  if (hero) {
    media.push({
      path: `raea/media/${heroFile}`,
      type: "raea-media",
      suggested: false,
      missing: false,
      content: hero.bytes,
    });
  }
  covered.forEach((part, index) => {
    const image = raeaGameImage(part.imagePath);
    let art: string | null = null;
    if (image) {
      art = `scene-${String(index + 1).padStart(2, "0")}.${image.ext}`;
      media.push({
        path: `raea/media/${art}`,
        type: "raea-media",
        suggested: false,
        missing: false,
        content: image.bytes,
      });
    }
    scenes.push({ title: part.title, art });
  });
  files.push({
    path: "raea/README.md",
    type: "raea-readme",
    suggested: false,
    missing: false,
    content: raeaGameReadme(title),
  });
  files.push({
    path: "raea/edit.tsx",
    type: "raea-edit",
    suggested: false,
    missing: false,
    content: RAEA_GAME_EDIT,
  });
  files.push({
    path: "raea/story.ts",
    type: "raea-data",
    suggested: false,
    missing: false,
    content: raeaStoryTs(title, heroFile, scenes),
  });
  files.push(...media);
  return files;
}

/**
 * Game channel ZIP layout, following the open-source "Claude Code Game
 * Studios" template with Claude renamed to Muse (CLAUDE.md becomes
 * AGENTS.md, .claude/ becomes .agents/). Files sit at the ZIP root.
 * The channel secret rule applies to all of it: every file is built
 * from the filtered world, which holds only this channel's secret.
 */
export function planGameFiles(world: World, channelId: string): PackageFile[] {
  const filtered = channelWorld(world, channelId);
  const channel = channelOf(world, channelId);
  if (!channel) return [];
  const files: PackageFile[] = [];
  const text = (
    path: string,
    type: PackageFileType,
    content: string,
    extra?: { character?: string; part?: string },
  ): void => {
    files.push({
      path,
      type,
      ...extra,
      suggested: false,
      missing: false,
      content,
    });
  };

  text("AGENTS.md", "studio-rules", gameAgentsMd(filtered, channelId));
  text("project.yaml", "studio-project", gameProjectYaml(filtered, channelId));
  text("README.md", "studio-readme", gameReadmeMd(filtered, channelId));
  text("STUDIO-NOTICE.md", "studio-notice", gameStudioNoticeMd());
  text(
    "design/gdd/game-concept.md",
    "game-concept",
    gameConceptMd(filtered, channelId),
  );
  text(
    "design/narrative/story.md",
    "narrative",
    gameStoryMd(filtered, channelId),
  );
  for (const character of filtered.characters) {
    text(
      `design/characters/${character.id}.md`,
      "character-doc",
      gameCharacterMd(character),
      { character: character.id },
    );
  }
  const covered = new Set(filtered.beats.map((beat) => beat.partId));
  const sheetAssets: string[] = [];
  const sceneAssets: string[] = [];
  for (const character of filtered.characters) {
    const source = world.characters.find((c) => c.id === character.id);
    for (const view of source?.sheet ?? []) {
      const sheetPath = `assets/characters/${character.id}/sheet/${view.view}.webp`;
      const before = files.length;
      pushFile(
        files,
        imageEntry("", sheetPath, "sheet", view.imagePath, {
          character: character.id,
        }),
      );
      if (files.length > before) sheetAssets.push(sheetPath);
      pushFile(
        files,
        imageEntry("", `assets/characters/${character.id}/cutouts/${view.view}.png`, "cutout", view.cutoutPath, {
          character: character.id,
        }),
      );
    }
    const voiceLines = source?.lines ?? [];
    if (source && (source.voice || voiceLines.length > 0)) {
      text(
        `assets/characters/${character.id}/voice.json`,
        "voice",
        voiceIndexJson(source),
        { character: character.id },
      );
      for (const line of voiceLines) {
        const decoded = line.audioPath ? dataUrlToBytes(line.audioPath) : null;
        if (!decoded) continue;
        files.push({
          path: `assets/characters/${character.id}/voice/${line.id}.mp3`,
          type: "voice-audio",
          character: character.id,
          suggested: false,
          missing: false,
          content: decoded.bytes,
        });
      }
    }
  }
  text(
    "design/registry/entities.yaml",
    "entities",
    gameEntitiesYaml(filtered),
  );
  const scripted = new Set<string>();
  for (const part of [...filtered.parts].sort((a, b) => a.order - b.order)) {
    if (!covered.has(part.id)) continue;
    text(
      `docs/story/${part.id}/brief.md`,
      "scene-brief",
      sceneBrief(filtered, channelId, part.id),
      { part: part.id },
    );
    const script = filtered.scripts.find((s) => s.partId === part.id);
    if (script) {
      text(`docs/story/${part.id}/script.txt`, "script", script.text, {
        part: part.id,
      });
      scripted.add(part.id);
    }
    const artPath = `assets/scenes/${part.id}/art.webp`;
    const before = files.length;
    pushFile(
      files,
      imageEntry("", artPath, "scene-art", part.imagePath, { part: part.id }),
    );
    if (files.length > before) sceneAssets.push(artPath);
  }
  // Scripts ship even for parts this channel does not cover: the owner
  // wrote them, so they are made work, not missing files.
  for (const script of filtered.scripts) {
    if (scripted.has(script.partId)) continue;
    text(`docs/story/${script.partId}/script.txt`, "script", script.text, {
      part: script.partId,
    });
  }
  text(
    "docs/engine-reference/godot/README.md",
    "engine-reference",
    gameEngineReferenceMd(),
  );
  const made: string[] = [];
  const notMade: string[] = [];
  if (filtered.characters.length > 0) {
    const full = filtered.characters.filter(hasFullSheet).length;
    (full === filtered.characters.length ? made : notMade).push(
      `Character sheets (${full} of ${filtered.characters.length})`,
    );
  }
  for (const part of [...filtered.parts].sort((a, b) => a.order - b.order)) {
    if (!covered.has(part.id)) continue;
    (part.imagePath ? made : notMade).push(`Scene art: ${part.title}`);
    const hasScript = filtered.scripts.some((s) => s.partId === part.id);
    // A game is designed, not scripted, boarded or cut: storyboards
    // and videos are never listed, so the ZIP and Readiness agree.
    (hasScript ? made : notMade).push(`Design: ${part.title}`);
  }
  // The art bible lists the sheets and scene art on file, so it is
  // written once those lists are known.
  text(
    "design/art-bible.md",
    "art-bible",
    gameArtBibleMd(filtered, { sheets: sheetAssets, scenes: sceneAssets }),
  );
  text("production/stage.md", "stage", gameStageMd(made, notMade));
  text("src/.gitkeep", "gitkeep", "");
  text(".agents/README.md", "agents-readme", gameAgentsReadmeMd());
  text("scripts/setup-studio.sh", "setup-script", gameSetupScript());
  files.push(...planRaeaGameFiles(world, channelId));
  return files;
}
