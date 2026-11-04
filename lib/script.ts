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

export type ScriptForm = "script" | "design" | "copy";

/**
 * The form each channel kind asks for on the script page: screenplay
 * scenes, a game design document, or page copy. Unknown kinds read as
 * screenplay scenes.
 */
export function formForKind(kind: string): ScriptForm {
  if (kind === "game") return "design";
  if (kind === "website" || kind === "press") return "copy";
  return "script";
}

export const DESIGN_HEADINGS = [
  "Core idea",
  "What the player wants",
  "What the player does",
  "Levels and places",
  "Characters in play",
  "How the story is told",
  "What this game keeps secret",
  "Notes for building it in Godot",
] as const;

export const DESIGN_DRAFT_INSTRUCTIONS =
  "You write a game design document for one game about a story told across several channels. Write plain text under these headings, in this order: Core idea, What the player wants, What the player does, Levels and places, Characters in play, How the story is told, What this game keeps secret, Notes for building it in Godot. Use only the canon and the secrets this channel may know, listed below. A secret that belongs to another channel must never appear or be hinted at. Use the world's real names and details exactly. Never rename anyone or change an established detail. Do not use screenplay formatting, character cues or scene headings. Return only the document.";

export const COPY_DRAFT_INSTRUCTIONS =
  "You write page copy for one channel's page about a story told across several channels: a headline, an intro, sections with subheadings, and a call to action. Use only the canon and the secrets this channel may know, listed below. A secret that belongs to another channel must never appear or be hinted at. Use the world's real names and details exactly. Never rename anyone or change an established detail. Return only the copy.";

/** System prompt for the channel's form, derived server-side. */
export function draftInstructionsForForm(form: ScriptForm): string {
  if (form === "design") return DESIGN_DRAFT_INSTRUCTIONS;
  if (form === "copy") return COPY_DRAFT_INSTRUCTIONS;
  return DRAFT_INSTRUCTIONS;
}

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
  const form = formForKind(channel?.kind ?? "series");
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
  if (form === "design") {
    lines.push(
      "",
      "Write plain text under these headings, in this order:",
      ...DESIGN_HEADINGS.map((heading) => `- ${heading}`),
      "Do not use screenplay formatting, character cues or scene headings.",
    );
  } else if (form === "copy") {
    lines.push(
      "",
      "Write page copy: a headline, an intro, sections with subheadings, and a call to action.",
    );
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

/**
 * Add or replace one script in the world. Pure. The form is derived
 * from the channel's kind unless the caller passes one explicitly.
 */
export function upsertScript(
  world: World,
  channelId: string,
  partId: string,
  text: string,
  form?: ScriptForm,
): World {
  const kind = world.channels.find((c) => c.id === channelId)?.kind ?? "series";
  const entry: ScriptEntry = {
    channelId,
    partId,
    text,
    updatedAt: Date.now(),
    form: form ?? formForKind(kind),
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

export type MentionKind = "character" | "place";

export type MentionCandidate = { name: string; kind: MentionKind };

/** Everyone the @ menu can insert: characters, then places. Pure. */
export function mentionCandidates(world: World): MentionCandidate[] {
  const candidates: MentionCandidate[] = [
    ...world.characters.map(
      (c): MentionCandidate => ({ name: c.name, kind: "character" }),
    ),
    ...world.locations.map(
      (l): MentionCandidate => ({ name: l.name, kind: "place" }),
    ),
  ];
  return candidates.filter((c) => c.name.trim().length > 0);
}

/** Narrow the @ menu as the creator types, case-insensitively. Pure. */
export function filterMentions(
  candidates: MentionCandidate[],
  query: string,
): MentionCandidate[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return candidates;
  return candidates.filter((c) => c.name.toLowerCase().includes(needle));
}

/**
 * The @ query before the caret, if the caret sits in one: the text
 * after the nearest @ that starts the line or follows whitespace, with
 * no line break between. Null when the caret is not in a mention.
 * Pure, so the editor and tests share it.
 */
export function mentionQueryBeforeCaret(
  text: string,
  caret: number,
): string | null {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1] ?? "")) return null;
  const token = before.slice(at + 1);
  if (/[\n\r]/.test(token)) return null;
  return token;
}

/** How a picked name lands in the draft. Pure. */
export function formatMentionName(
  candidate: MentionCandidate,
  form: ScriptForm,
): string {
  if (form === "script" && candidate.kind === "character") {
    return candidate.name.toUpperCase();
  }
  return candidate.name;
}

/**
 * Swap the @ query before the caret for the picked name. Pure.
 * Returns the caret just after the inserted name.
 */
export function insertMentionAtCaret(
  text: string,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const safe = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, safe);
  const at = before.lastIndexOf("@");
  if (at === -1) return { text, caret: safe };
  const next = before.slice(0, at) + name + text.slice(safe);
  return { text: next, caret: at + name.length };
}

export type InsertKind = "scene" | "character" | "action" | "dialogue";

/**
 * Scene-heading chooser options. The location list comes from the
 * project's places; the creator may also type a new one. Pure data.
 */
export const SCENE_PREFIXES = ["INT.", "EXT."] as const;

export type ScenePrefix = (typeof SCENE_PREFIXES)[number];

export const SCENE_TIMES = [
  "DAY",
  "NIGHT",
  "DAWN",
  "DUSK",
  "LATER",
  "CONTINUOUS",
] as const;

export type SceneTime = (typeof SCENE_TIMES)[number];

/**
 * One screenplay scene heading, e.g. `EXT. THE STREAM - NIGHT`.
 * The location reads uppercase; a blank location stays a placeholder.
 * Pure, so the insert bar and tests share it.
 */
export function composeSceneHeading(
  prefix: string,
  location: string,
  time: string,
): string {
  const head = prefix.trim() || "INT.";
  const place = location.trim().toUpperCase() || "LOCATION";
  const when = time.trim() || "DAY";
  return `${head} ${place} - ${when}`;
}

/** Cue suffixes for a character voice: plain, voice-over, off-screen. */
export const CHARACTER_CUE_SUFFIXES = ["", "(V.O.)", "(O.S.)"] as const;

/**
 * A character cue in capitals, e.g. `ADA (V.O.)`. Pure, so the insert
 * bar and tests share it.
 */
export function composeCharacterCue(name: string, suffix = ""): string {
  const cue = name.trim().toUpperCase() || "CHARACTER";
  const tail = suffix.trim();
  return tail ? `${cue} ${tail}` : cue;
}

/**
 * A cue plus a dialogue line ready to type: the caret lands after the
 * trailing tab when this is dropped at the caret. Pure.
 */
export function composeDialogueBlock(
  speaker: string,
  parenthetical = "",
): string {
  const cue = composeCharacterCue(speaker);
  const aside = parenthetical.trim();
  return aside ? `${cue}\n(${aside})\n\t` : `${cue}\n\t`;
}

/**
 * Short action-line starters for a blank moment. Plain description,
 * never a placeholder the creator must delete.
 */
export const ACTION_STARTERS = [
  "Dawn light fills the room.",
  "Footsteps approach.",
  "The stream ripples.",
  "A door creaks open.",
  "Silence settles.",
] as const;

/**
 * One action line, or a blank line when no starter is picked. Pure.
 */
export function composeActionLine(starter = ""): string {
  const line = starter.trim();
  return line ? `${line}\n` : "\n";
}

/**
 * Design-form helper options for the game design document. Plain data
 * so the helper bar and tests share them.
 */
export const DESIGN_GAME_TYPES = [
  "Endless runner",
  "Platformer",
  "Top-down action",
  "Action RPG",
  "Strategy",
  "Puzzle",
  "Roguelike",
  "Survival",
  "Visual novel",
  "Rhythm",
  "Hunt and chase",
  "Other",
] as const;

export const DESIGN_CAMERAS = [
  "2D side-scroll",
  "Top-down",
  "Isometric",
  "Third-person 3D",
  "First-person 3D",
] as const;

export const DESIGN_MECHANICS = [
  "Movement",
  "Jump",
  "Dash",
  "Melee combat",
  "Ranged combat",
  "Stealth",
  "Crafting",
  "Gathering",
  "Dialogue choices",
  "Puzzles",
  "Timing",
  "Building",
  "Resource management",
] as const;

export const DESIGN_SESSION_LENGTHS = [
  "5 minutes",
  "30 minutes",
  "2 hours",
  "campaign",
] as const;

export const DESIGN_CONTROLS = [
  "Keyboard and mouse",
  "Gamepad",
  "Touch",
] as const;

export const DESIGN_PROGRESSION = [
  "Levels",
  "Unlockable abilities",
  "Story chapters",
  "Score only",
] as const;

/** Which design heading each helper block belongs under. */
export const DESIGN_BLOCK_HEADINGS = {
  gameType: "Core idea",
  camera: "What the player does",
  mechanics: "What the player does",
  goal: "What the player wants",
  controls: "Notes for building in Godot",
  progression: "Levels and places",
} as const;

export type DesignBlockKind = keyof typeof DESIGN_BLOCK_HEADINGS;

/** Real story names a design block may mention. All optional. */
export type DesignStoryContext = {
  partTitle?: string;
  partSummary?: string;
  characterNames?: string[];
  locationNames?: string[];
};

function designPlace(context: DesignStoryContext): string {
  const place = (context.locationNames ?? []).find((n) => n.trim());
  if (place) return place.trim();
  if (context.partTitle?.trim()) return context.partTitle.trim();
  return "the story's world";
}

function designCast(context: DesignStoryContext): string {
  const names = (context.characterNames ?? []).filter((n) => n.trim());
  if (names.length === 0) return "";
  if (names.length === 1) return ` Starring ${names[0].trim()}.`;
  const last = names[names.length - 1].trim();
  const rest = names
    .slice(0, -1)
    .map((n) => n.trim())
    .join(", ");
  return ` Starring ${rest} and ${last}.`;
}

/** Join a multi-select list the way the document reads it. */
export function joinDesignChoices(choices: string[]): string {
  const clean = choices.map((c) => c.trim()).filter((c) => c.length > 0);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  const last = clean[clean.length - 1];
  return `${clean.slice(0, -1).join(", ")} and ${last}`;
}

const GAME_TYPE_VERBS: Record<string, string> = {
  "Endless runner": "The player keeps moving forward",
  Platformer: "The player jumps across",
  "Top-down action": "The player fights across",
  "Action RPG": "The player quests across",
  Strategy: "The player outplans rivals across",
  Puzzle: "The player solves through",
  Roguelike: "The player runs again and again through",
  Survival: "The player holds out in",
  "Visual novel": "The player reads and chooses through",
  Rhythm: "The player moves in time through",
  "Hunt and chase": "The player tracks a creature through",
  Other: "The player explores",
};

/**
 * A game-type block a coding agent can read, e.g.
 * `Game type: Hunt and chase. The player tracks a creature through ...`.
 * Pure.
 */
export function composeGameTypeBlock(
  choice: string,
  context: DesignStoryContext = {},
): string {
  const kind = choice.trim() || "Other";
  const verb = GAME_TYPE_VERBS[kind] ?? "The player explores";
  return `Game type: ${kind}. ${verb} ${designPlace(context)}.${designCast(context)}`;
}

const CAMERA_NOTES: Record<string, string> = {
  "2D side-scroll": "The game scrolls left to right.",
  "Top-down": "The game is seen from above.",
  Isometric: "The game uses an angled view from above.",
  "Third-person 3D": "The camera follows behind the player.",
  "First-person 3D": "The player sees through the character's eyes.",
};

/** A camera block, e.g. `Camera and view: Top-down. ...`. Pure. */
export function composeCameraBlock(choice: string): string {
  const kind = choice.trim() || "Top-down";
  const note = CAMERA_NOTES[kind] ?? "Everything is staged for this view.";
  return `Camera and view: ${kind}. ${note}`;
}

/** A mechanics block from a multi-select, e.g. `Core mechanics: Jump and Dash.`. Pure. */
export function composeMechanicsBlock(choices: string[]): string {
  const list = joinDesignChoices(choices) || "Movement";
  return `Core mechanics: ${list}.`;
}

export type DesignGoal = {
  win?: string;
  lose?: string;
  session?: string;
};

/** A goal block from a win condition, a lose condition and a length. Pure. */
export function composeGoalBlock(goal: DesignGoal): string {
  const parts: string[] = [];
  if (goal.win?.trim()) parts.push(`Win by ${goal.win.trim()}.`);
  if (goal.lose?.trim()) parts.push(`Lose when ${goal.lose.trim()}.`);
  if (goal.session?.trim()) parts.push(`A session lasts ${goal.session.trim()}.`);
  if (parts.length === 0) parts.push("Win and lose conditions are not set yet.");
  return `Goal and ending: ${parts.join(" ")}`;
}

/** A controls block from a multi-select. Pure. */
export function composeControlsBlock(choices: string[]): string {
  const list = joinDesignChoices(choices) || "Keyboard and mouse";
  return `Controls: ${list}.`;
}

/** A progression block from a multi-select. Pure. */
export function composeProgressionBlock(choices: string[]): string {
  const list = joinDesignChoices(choices) || "Levels";
  return `Progression: ${list}.`;
}

/**
 * Drop a design block under its heading, creating the heading when it
 * is missing. A present heading is never duplicated: the block joins
 * the end of its section, before the next heading. Pure. Returns the
 * caret just after the inserted block.
 */
export function insertDesignBlock(
  text: string,
  heading: string,
  block: string,
): { text: string; caret: number } {
  const clean = block.trim();
  const known = new Set<string>(DESIGN_HEADINGS as readonly string[]);
  const lines = text.split("\n");
  const at = lines.findIndex((line) => line.trim() === heading);
  if (at === -1) {
    const prefix =
      text.length === 0
        ? ""
        : text.endsWith("\n\n")
          ? ""
          : text.endsWith("\n")
            ? "\n"
            : "\n\n";
    const next = `${text}${prefix}${heading}\n${clean}\n`;
    return { text: next, caret: next.indexOf(clean) + clean.length };
  }
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i += 1) {
    if (known.has(lines[i].trim())) {
      end = i;
      break;
    }
  }
  const before = lines.slice(0, end);
  while (before.length > at + 1 && before[before.length - 1].trim() === "") {
    before.pop();
  }
  before.push("", clean);
  const after = lines.slice(end);
  const next =
    after.length > 0
      ? [...before, "", ...after].join("\n")
      : [...before, ""].join("\n");
  return { text: next, caret: next.indexOf(clean) + clean.length };
}

/**
 * One correctly formatted screenplay line to drop at the caret.
 * Scene headings open the place and time, character cues read
 * uppercase, dialogue sits indented. Pure.
 */
export function insertSnippet(kind: InsertKind): string {
  if (kind === "scene") return "INT. LOCATION - DAY\n\n";
  if (kind === "character") return "CHARACTER\n";
  if (kind === "dialogue") return "\tDialogue.\n";
  return "Action.\n";
}

/**
 * Drop a snippet at the caret, replacing any selection. Starts the
 * snippet on its own line so it never lands mid-sentence. Pure.
 * Returns the caret just after the inserted snippet.
 */
export function applyInsertAtCaret(
  text: string,
  start: number,
  end: number,
  snippet: string,
): { text: string; caret: number } {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  const prefix = from > 0 && text[from - 1] !== "\n" ? "\n" : "";
  const next = text.slice(0, from) + prefix + snippet + text.slice(to);
  return { text: next, caret: from + prefix.length + snippet.length };
}

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
