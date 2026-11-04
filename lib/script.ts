import { z } from "zod";
import { scriptFormForKind } from "@/lib/pack";
import {
  WorldSchema,
  type ScriptEntry,
  type World,
} from "@/lib/world/schemas";

/**
 * Script page model contract. Pure: no key, no fetch, so routes, client
 * components and tests can all import it.
 */

export const DRAFT_INSTRUCTIONS =
  "You write one scene of a story told across several channels, in the form that channel asks for. Use only the canon and the secrets this channel may know, listed below. A secret that belongs to another channel must never appear or be hinted at. Use the world's real names and details exactly. Never rename anyone or change an established detail. Return only the scene.";

export const CHECK_INSTRUCTIONS =
  "You check one script draft against the canon. The canon lists every secret and the channels that may know it, so you can spot leaks: a line leaks when it reveals a secret to a channel that may not know it. Report each real problem as either a contradiction (the line is false against the canon) or a leak (the line reveals what this channel must not know). Quote the exact line you mean. For a contradiction, the problem must say plainly what is wrong and what the canon says, using the real names and details from the canon. For a leak, the problem says which channel the information belongs to, without repeating that secret's text. replacement is the exact script text that replaces the quote, written in the script's own form. Never describe an edit. Use an empty string only if the line should simply be removed. Never repeat a secret from another channel in problem or replacement: describe the problem and write the replacement without quoting or paraphrasing that secret's text.";

export const DRAFT_SCHEMA_NAME = "script_draft";

export const DRAFT_JSON_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
  },
  required: ["text"],
  additionalProperties: false,
} as const;

export const CHECK_SCHEMA_NAME = "script_check";

export const CHECK_JSON_SCHEMA = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["contradiction", "leak"] },
          quote: { type: "string" },
          problem: { type: "string" },
          replacement: { type: "string" },
        },
        required: ["kind", "quote", "problem", "replacement"],
        additionalProperties: false,
      },
    },
  },
  required: ["issues"],
  additionalProperties: false,
} as const;

export const ScriptDraftRequestSchema = z.object({
  world: WorldSchema,
  channelId: z.string().min(1),
  partId: z.string().min(1),
  mode: z.enum(["draft", "rewrite"]),
  text: z.string().max(20000).default(""),
  selection: z.string().max(5000).default(""),
  instruction: z.string().max(1000).default(""),
});

export type ScriptDraftRequest = z.infer<typeof ScriptDraftRequestSchema>;

export const ScriptDraftModelOutputSchema = z.object({
  text: z.string().min(1),
});

export const ScriptCheckRequestSchema = z.object({
  world: WorldSchema,
  channelId: z.string().min(1),
  partId: z.string().min(1),
  text: z.string().min(1).max(20000),
});

export type ScriptCheckRequest = z.infer<typeof ScriptCheckRequestSchema>;

export const ScriptIssueSchema = z.object({
  kind: z.enum(["contradiction", "leak"]),
  quote: z.string().min(1),
  problem: z.string().min(1),
  replacement: z.string(),
});

export type ScriptIssue = z.infer<typeof ScriptIssueSchema>;

export const ScriptCheckModelOutputSchema = z.object({
  issues: z.array(z.unknown()),
});

export const ScriptCheckResponseSchema = z.object({
  issues: z.array(ScriptIssueSchema),
});

export const SCRIPT_DRAFT_NO_KEY_MESSAGE =
  "Script drafts aren't available on this server.";

export const SCRIPT_CHECK_NO_KEY_MESSAGE =
  "Script checks aren't available on this server.";

function channelOf(world: World, channelId: string) {
  return world.channels.find((c) => c.id === channelId);
}

function partOf(world: World, partId: string) {
  return world.parts.find((p) => p.id === partId);
}

/**
 * Secrets this channel may know: its own channel secret plus every world
 * secret whose knownThrough lists it. Nothing else. The draft prompt is
 * built from this list, so other channels' secrets never reach the model.
 */
export function allowedSecrets(
  world: World,
  channelId: string,
): { channelSecret: string; secrets: World["secrets"] } {
  const channelSecret = channelOf(world, channelId)?.secret ?? "";
  const secrets = world.secrets.filter((secret) =>
    secret.knownThrough.includes(channelId),
  );
  return { channelSecret, secrets };
}

/**
 * Secret text this channel must not reveal: every world secret it may not
 * know, plus every other channel's channel secret. The check filter drops
 * any issue that repeats one of these in its problem or replacement.
 */
export function foreignSecretTexts(world: World, channelId: string): string[] {
  const texts: string[] = [];
  for (const secret of world.secrets) {
    if (!secret.knownThrough.includes(channelId) && secret.text.length > 0) {
      texts.push(secret.text);
    }
  }
  for (const channel of world.channels) {
    if (channel.id !== channelId && channel.secret.length > 0) {
      texts.push(channel.secret);
    }
  }
  return texts;
}

function canonLines(world: World): string[] {
  const lines = ["Characters:"];
  for (const character of world.characters) {
    lines.push(`- ${character.name}: ${character.canon}`);
  }
  lines.push("", "Locations:");
  if (world.locations.length === 0) {
    lines.push("- None named yet.");
  } else {
    for (const location of world.locations) {
      lines.push(`- ${location.name}: ${location.description}`);
    }
  }
  return lines;
}

/**
 * Draft prompt: the channel, the part, this channel's beats here, the
 * canon's names, and only the secrets this channel may know. Other
 * channels' secret text is never included.
 */
export function scriptDraftInput(
  world: World,
  channelId: string,
  partId: string,
  options?: { text?: string; selection?: string; instruction?: string },
): string {
  const channel = channelOf(world, channelId);
  const part = partOf(world, partId);
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
  lines.push("", ...canonLines(world));
  lines.push("", "Secrets this channel may know:");
  const { channelSecret, secrets } = allowedSecrets(world, channelId);
  if (channelSecret) lines.push(`- ${channelSecret} (this channel's own secret)`);
  for (const secret of secrets) lines.push(`- ${secret.text}. ${secret.note}`);
  if (!channelSecret && secrets.length === 0) {
    lines.push("- None yet: everything this channel shows is on the surface.");
  }
  if (options?.text) lines.push("", `Current draft:\n${options.text}`);
  if (options?.selection) {
    lines.push("", `Rewrite only this selection:\n${options.selection}`);
  }
  if (options?.instruction) lines.push("", `Instruction: ${options.instruction}`);
  return lines.join("\n");
}

/**
 * Check prompt: the draft plus the whole canon, with every secret and the
 * channels that may know it, so the model can spot leaks.
 */
export function scriptCheckInput(
  world: World,
  channelId: string,
  partId: string,
  text: string,
): string {
  const channel = channelOf(world, channelId);
  const part = partOf(world, partId);
  const lines: string[] = [
    `Check this ${scriptFormForKind(channel?.kind ?? "series")} for ${channel?.name ?? channelId} on part ${part?.title ?? partId}.`,
    "",
    "Draft:",
    text,
    "",
    ...canonLines(world),
    "",
    "Secrets (and the channels that may know them):",
  ];
  const names = new Map(world.channels.map((c) => [c.id, c.name]));
  for (const channelEntry of world.channels) {
    if (channelEntry.secret) {
      lines.push(
        `- ${channelEntry.name} may reveal: ${channelEntry.secret}`,
      );
    }
  }
  for (const secret of world.secrets) {
    const known =
      secret.knownThrough.length > 0
        ? secret.knownThrough.map((id) => names.get(id) ?? id).join(", ")
        : "no channel yet";
    lines.push(`- ${secret.text} (known through: ${known}). ${secret.note}`);
  }
  return lines.join("\n");
}

/**
 * Validate each model issue on its own, then drop any whose quote is not
 * an exact substring of the draft, and any whose problem or replacement
 * repeats a secret from another channel. Drops instead of failing the
 * whole check.
 */
export function toScriptIssues(
  modelIssues: unknown[],
  text: string,
  world: World,
  channelId: string,
): ScriptIssue[] {
  const foreign = foreignSecretTexts(world, channelId);
  const kept: ScriptIssue[] = [];
  for (const raw of modelIssues) {
    const parsed = ScriptIssueSchema.safeParse(raw);
    if (!parsed.success) continue;
    const issue = parsed.data;
    if (!text.includes(issue.quote)) continue;
    const says = `${issue.problem}\n${issue.replacement}`;
    if (foreign.some((secret) => secret.length > 0 && says.includes(secret))) {
      continue;
    }
    kept.push(issue);
  }
  return kept;
}

/**
 * Apply one issue's replacement to the draft: swap the first occurrence
 * of the quote for the replacement text. An empty replacement removes
 * the quote. Pure, so the page and tests share it.
 */
export function applyScriptReplacement(
  text: string,
  quote: string,
  replacement: string,
): string {
  if (!quote) return text;
  const at = text.indexOf(quote);
  if (at === -1) return text;
  return text.slice(0, at) + replacement + text.slice(at + quote.length);
}

/** The stored script for one channel's take on one part, if any. */
export function scriptForScene(
  world: World,
  channelId: string,
  partId: string,
): ScriptEntry | undefined {
  return world.scripts.find(
    (script) => script.channelId === channelId && script.partId === partId,
  );
}

/**
 * Where a scene starts: the saved script, else the pack's script for that
 * channel and part, else empty. The page never calls a model on load.
 */
export function initialScriptText(
  world: World,
  channelId: string,
  partId: string,
): string {
  const saved = scriptForScene(world, channelId, partId);
  if (saved) return saved.text;
  const pack = world.packs.find(
    (entry) => entry.channelId === channelId && entry.partId === partId,
  );
  return pack?.script ?? "";
}

/** Add or replace one script in the world. Pure. */
export function upsertScript(
  world: World,
  channelId: string,
  partId: string,
  text: string,
): World {
  const entry: ScriptEntry = {
    channelId,
    partId,
    text,
    updatedAt: Date.now(),
  };
  const rest = world.scripts.filter(
    (script) => !(script.channelId === channelId && script.partId === partId),
  );
  return { ...world, scripts: [...rest, entry] };
}

/**
 * Names to highlight on the page: every character and location name,
 * longest first so a longer name wins its range. Case-insensitive at
 * match time.
 */
export function highlightTerms(world: World): string[] {
  const names = [
    ...world.characters.map((c) => c.name),
    ...world.locations.map((l) => l.name),
  ].filter((name) => name.trim().length > 0);
  return [...new Set(names)].sort((a, b) => b.length - a.length);
}

export type HighlightSegment = {
  text: string;
  mark: boolean;
  strong: boolean;
};

/**
 * Split draft text into plain, name and issue-quote segments. Issue
 * quotes win their ranges (strong); names match case-insensitively
 * outside them. Pure, so the mirrored backdrop and tests share it.
 */
export function highlightSegments(
  text: string,
  names: string[],
  strongQuotes: string[] = [],
): HighlightSegment[] {
  if (!text) return [];
  type Range = { start: number; end: number; strong: boolean };
  const ranges: Range[] = [];
  const claim = (start: number, end: number, strong: boolean): boolean => {
    if (end <= start) return false;
    for (const range of ranges) {
      if (start < range.end && end > range.start) return false;
    }
    ranges.push({ start, end, strong });
    return true;
  };
  for (const quote of strongQuotes) {
    if (!quote) continue;
    let from = 0;
    for (;;) {
      const at = text.indexOf(quote, from);
      if (at === -1) break;
      claim(at, at + quote.length, true);
      from = at + quote.length;
    }
  }
  const ordered = [...names]
    .filter((name) => name.trim().length > 0)
    .sort((a, b) => b.length - a.length);
  for (const name of ordered) {
    const lower = text.toLowerCase();
    const needle = name.toLowerCase();
    let from = 0;
    for (;;) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      claim(at, at + name.length, false);
      from = at + name.length;
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), mark: false, strong: false });
    }
    segments.push({
      text: text.slice(range.start, range.end),
      mark: true,
      strong: range.strong,
    });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), mark: false, strong: false });
  }
  return segments;
}
