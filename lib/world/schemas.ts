import { z } from "zod";

export const SheetViewSchema = z.object({
  view: z.string(),
  imagePath: z.string(),
  /** Transparent PNG cut out of this view, stored beside the sheet. */
  cutoutPath: z.string().optional(),
});

export const VoiceConsentSchema = z.object({
  by: z.string().optional(),
  text: z.string(),
  at: z.string(),
});

export const PronunciationSchema = z.object({
  name: z.string().min(1).max(120),
  sayAs: z.string().min(1).max(120),
});

export const CharacterVoiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  reason: z.string().optional(),
  kind: z.enum(["premade", "custom"]).optional(),
  /** Where the custom voice came from: recording, upload or artist. */
  source: z.string().optional(),
  consent: VoiceConsentSchema.optional(),
});

export const CharacterLineSchema = z.object({
  id: z.string(),
  text: z.string(),
  audioPath: z.string(),
});

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  canon: z.string(),
  secret: z.string().optional(),
  artPath: z.string().optional(),
  sheet: z.array(SheetViewSchema),
  voice: CharacterVoiceSchema.optional(),
  lines: z.array(CharacterLineSchema).optional(),
});

export const LocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
});

export const ChannelKindSchema = z.enum([
  "game",
  "series",
  "shorts",
  "press",
  "film",
  "website",
  "ad",
  "other",
]);

export const FactSourceSchema = z.enum(["material", "muse", "you"]);

/** One story basic: an empty value means "not in your material yet". */
export const FactSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string().default(""),
  source: FactSourceSchema,
});

export const ChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: ChannelKindSchema,
  title: z.string(),
  tagline: z.string().default(""),
  pitch: z.string().default(""),
  secret: z.string().default(""),
  imagePath: z.string().default(""),
});

export const PartSchema = z.object({
  id: z.string(),
  order: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
  excerpt: z.string(),
  /** Verbatim passage of the source that belongs to this part. */
  text: z.string().default(""),
  imagePath: z.string().default(""),
  /** CSS background-position for this part's art, from the seed data. */
  imagePosition: z.string().default(""),
  tint: z.string().default("#e9e0ce"),
  characterIds: z.array(z.string()),
});

export const BeatSchema = z.object({
  id: z.string(),
  order: z.number().int().positive(),
  timeLabel: z.string(),
  title: z.string(),
  channelId: z.string(),
  partId: z.string(),
  unitLabel: z.string(),
  content: z.string(),
  imagePath: z.string().optional(),
  characterIds: z.array(z.string()),
});

export const SecretSchema = z.object({
  id: z.string(),
  text: z.string(),
  knownThrough: z.array(z.string()),
  note: z.string(),
  /** True when the planner invented this secret; the creator confirms it. */
  suggested: z.boolean().default(false),
});

export const GapSchema = z.object({
  id: z.string(),
  question: z.string(),
});

/** A spoken line on a shot: which character says it, and the audio. */
export const ShortVoiceSchema = z.object({
  characterId: z.string(),
  lineId: z.string(),
  text: z.string(),
});

export const ShortShotSchema = z.object({
  id: z.string(),
  imagePath: z.string(),
  caption: z.string(),
  durationSec: z.number(),
  motion: z.enum(["push", "pan", "still"]),
  voice: ShortVoiceSchema.optional(),
});

/** One short video cut per channel and part. */
export const ShortSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  partId: z.string(),
  title: z.string(),
  aspect: z.enum(["16:9", "9:16"]),
  shots: z.array(ShortShotSchema),
});

/** One channel's draft of one part, written on the script page. */
export const ScriptEntrySchema = z.object({
  channelId: z.string(),
  partId: z.string(),
  text: z.string(),
  updatedAt: z.number().int(),
});

export const StoryboardFramingSchema = z.enum([
  "wide",
  "medium",
  "close",
  "over-shoulder",
  "overhead",
]);

/** One pencil-sketch shot in a storyboard. */
export const StoryboardFrameSchema = z.object({
  id: z.string(),
  imagePath: z.string().optional(),
  framing: StoryboardFramingSchema,
  action: z.string(),
  dialogue: z.string().optional(),
  camera: z.string().optional(),
  characterIds: z.array(z.string()),
});

/** One storyboard per channel and part. */
export const StoryboardSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  partId: z.string(),
  title: z.string(),
  frames: z.array(StoryboardFrameSchema),
});

/** Production material for one channel's take on one part. */
export const PackSchema = z.object({
  partId: z.string(),
  channelId: z.string(),
  script: z.string(),
  shots: z.array(z.string()),
  posts: z.array(z.string()),
  reveals: z.array(z.string()),
  additions: z.array(z.string()),
});

export const WorldSchema = z.object({
  id: z.string(),
  title: z.string(),
  premise: z.string(),
  logline: z.string(),
  /** Suggested change for the ask bar. Only the sample project sets this. */
  sampleChange: z.string().default(""),
  characters: z.array(CharacterSchema),
  locations: z.array(LocationSchema),
  channels: z.array(ChannelSchema),
  parts: z.array(PartSchema),
  beats: z.array(BeatSchema),
  secrets: z.array(SecretSchema),
  gaps: z.array(GapSchema),
  facts: z.array(FactSchema).default([]),
  packs: z.array(PackSchema).default([]),
  scripts: z.array(ScriptEntrySchema).default([]),
  shorts: z.array(ShortSchema).default([]),
  storyboards: z.array(StoryboardSchema).default([]),
  canonChanges: z.array(z.string()).default([]),
  /** How names are said aloud. Only spoken audio uses it. */
  pronunciations: z.array(PronunciationSchema).default([]),
});

export const FixStatusSchema = z.enum(["pending", "applied", "rejected"]);

export const RippleDecisionSchema = z.enum(["applied", "kept"]);

export const RippleFixKindSchema = z.enum([
  "contradiction",
  "meaning",
  "setup",
]);

export const RippleFixSchema = z.object({
  id: z.string(),
  beatId: z.string(),
  channelId: z.string(),
  partId: z.string(),
  kind: RippleFixKindSchema,
  title: z.string(),
  problem: z.string(),
  proposal: z.string(),
  quote: z.string(),
  regeneratesImage: z.boolean(),
  status: FixStatusSchema.default("pending"),
});

export const RippleSecretUpdateSchema = z.object({
  secretId: z.string(),
  text: z.string(),
  note: z.string(),
});

export const RippleResultSchema = z.object({
  change: z.string(),
  summary: z.string(),
  fixes: z.array(RippleFixSchema),
  secretUpdates: z.array(RippleSecretUpdateSchema).default([]),
  sample: z.boolean().optional(),
});

export type Pronunciation = z.infer<typeof PronunciationSchema>;
export type SheetView = z.infer<typeof SheetViewSchema>;
export type VoiceConsent = z.infer<typeof VoiceConsentSchema>;
export type CharacterVoice = z.infer<typeof CharacterVoiceSchema>;
export type CharacterLine = z.infer<typeof CharacterLineSchema>;
export type FactSource = z.infer<typeof FactSourceSchema>;
export type Fact = z.infer<typeof FactSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type ChannelKind = z.infer<typeof ChannelKindSchema>;
export type Channel = z.infer<typeof ChannelSchema>;
export type Part = z.infer<typeof PartSchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type Secret = z.infer<typeof SecretSchema>;
export type Gap = z.infer<typeof GapSchema>;
export type ShortVoice = z.infer<typeof ShortVoiceSchema>;
export type ShortShot = z.infer<typeof ShortShotSchema>;
export type Short = z.infer<typeof ShortSchema>;
export type StoryboardFraming = z.infer<typeof StoryboardFramingSchema>;
export type StoryboardFrame = z.infer<typeof StoryboardFrameSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;
export type ScriptEntry = z.infer<typeof ScriptEntrySchema>;
export type StoryPack = z.infer<typeof PackSchema>;
export type World = z.infer<typeof WorldSchema>;
export type FixStatus = z.infer<typeof FixStatusSchema>;
export type RippleDecision = z.infer<typeof RippleDecisionSchema>;
export type RippleFixKind = z.infer<typeof RippleFixKindSchema>;
export type RippleFix = z.infer<typeof RippleFixSchema>;
export type RippleSecretUpdate = z.infer<typeof RippleSecretUpdateSchema>;
export type RippleResult = z.infer<typeof RippleResultSchema>;
