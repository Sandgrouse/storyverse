import { z } from "zod";

export const SheetViewSchema = z.object({
  view: z.string(),
  imagePath: z.string(),
});

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  canon: z.string(),
  secret: z.string().optional(),
  sheet: z.array(SheetViewSchema),
});

export const LocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
});

export const ChannelKindSchema = z.enum(["game", "series", "press"]);

export const ChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: ChannelKindSchema,
  title: z.string(),
});

export const BeatSchema = z.object({
  id: z.string(),
  order: z.number().int().positive(),
  timeLabel: z.string(),
  title: z.string(),
  channelId: z.string(),
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
});

export const WorldSchema = z.object({
  id: z.string(),
  title: z.string(),
  premise: z.string(),
  characters: z.array(CharacterSchema),
  locations: z.array(LocationSchema),
  channels: z.array(ChannelSchema),
  beats: z.array(BeatSchema),
  secrets: z.array(SecretSchema),
});

export const FixStatusSchema = z.enum(["pending", "applied", "rejected"]);

export const RippleFixSchema = z.object({
  id: z.string(),
  beatId: z.string(),
  problem: z.string(),
  proposal: z.string(),
  regeneratesImage: z.boolean(),
  status: FixStatusSchema,
});

export const SecretUpdateSchema = z.object({
  secretId: z.string(),
  text: z.string(),
  note: z.string(),
});

export const RippleResultSchema = z.object({
  change: z.string(),
  summary: z.string(),
  fixes: z.array(RippleFixSchema),
  secretUpdates: z.array(SecretUpdateSchema),
});

export type SheetView = z.infer<typeof SheetViewSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type ChannelKind = z.infer<typeof ChannelKindSchema>;
export type Channel = z.infer<typeof ChannelSchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type Secret = z.infer<typeof SecretSchema>;
export type World = z.infer<typeof WorldSchema>;
export type FixStatus = z.infer<typeof FixStatusSchema>;
export type RippleFix = z.infer<typeof RippleFixSchema>;
export type SecretUpdate = z.infer<typeof SecretUpdateSchema>;
export type RippleResult = z.infer<typeof RippleResultSchema>;
