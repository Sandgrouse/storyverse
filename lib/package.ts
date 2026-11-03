import JSZip from "jszip";
import { packToMarkdown } from "@/lib/pack";
import type { World } from "@/lib/world/schemas";

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
  | "scene-art"
  | "scene-brief"
  | "pack";

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

function imageEntry(
  root: string,
  path: string,
  type: PackageFileType,
  dataUrl: string | undefined,
  extra: { character?: string; part?: string },
): PackageFile {
  const decoded = dataUrl ? dataUrlToBytes(dataUrl) : null;
  if (!decoded) {
    return { path: `${root}/${path}`, type, ...extra, suggested: false, missing: true };
  }
  return {
    path: `${root}/${path}`,
    type,
    ...extra,
    suggested: false,
    missing: false,
    content: decoded.bytes,
  };
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
      files.push(
        imageEntry(root, `characters/${character.id}/sheet/${view.view}.webp`, "sheet", view.imagePath, {
          character: character.id,
        }),
      );
      files.push(
        imageEntry(
          root,
          `characters/${character.id}/cutouts/${view.view}.png`,
          "cutout",
          view.cutoutPath,
          { character: character.id },
        ),
      );
    }
  }

  const covered = new Set(filtered.beats.map((beat) => beat.partId));
  for (const part of [...filtered.parts].sort((a, b) => a.order - b.order)) {
    if (!covered.has(part.id)) continue;
    files.push(
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
    } else {
      files.push({
        path: `${root}/packs/${part.id}.md`,
        type: "pack",
        part: part.id,
        suggested: true,
        missing: true,
      });
    }
  }

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
    zip.file(file.path, file.content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, files };
}
