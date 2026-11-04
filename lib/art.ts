import { z } from "zod";

/**
 * Shared image-route shapes and prompt builders. Pure: no key, no fetch,
 * so client components and tests can import it freely.
 */

/** Vercel's request limit. Art requests and responses must fit inside it. */
export const ART_REQUEST_LIMIT_BYTES = 4_500_000;

export const SHEET_VIEWS = [
  { id: "front", label: "Front", line: "Front view, standing, facing the viewer." },
  { id: "left", label: "Left", line: "Left side profile view, standing." },
  { id: "right", label: "Right", line: "Right side profile view, standing." },
  { id: "back", label: "Back", line: "Back view, standing, facing away." },
  {
    id: "walking",
    label: "Walking",
    line: "In motion, walking quickly with purpose.",
  },
  {
    id: "crouching",
    label: "Crouching",
    line: "Crouching, examining something on the ground.",
  },
] as const;

export type SheetViewId = (typeof SHEET_VIEWS)[number]["id"];

export const SHEET_VIEW_IDS = SHEET_VIEWS.map((view) => view.id);

export const SHEET_SUFFIX =
  "Keep the exact same character from the reference: same face, build, skin, hair, clothing, beads and carried items, in the same art style. Full body, centered, on a plain dark background. Do not draw any text, letters, labels, captions, numbers, logos or watermarks anywhere in the image.";

export const SCENE_SUFFIX =
  "Keep each character exactly as in their reference. Do not draw any text, letters, logos or watermarks.";

export const SKETCH_SUFFIX =
  "Loose pencil storyboard drawing, black and grey with no colour, simple shading and clear composition. Do not draw any text, letters, logos or watermarks.";

export const REWRITE_INSTRUCTIONS =
  "Rewrite this image description so it passes a content filter. Keep the same people, place and moment. Describe it through composition, distance, light and aftermath, with no violence, gore or distress shown directly.";

export const REWRITE_SCHEMA_NAME = "image_description_rewrite";

export const REWRITE_JSON_SCHEMA = {
  type: "object",
  properties: { description: { type: "string" } },
  required: ["description"],
  additionalProperties: false,
} as const;

export const RewriteModelOutputSchema = z.object({
  description: z.string().min(1),
});

/** Plain message shown in a slot when the filter still refuses a prompt. */
export const BLOCKED_MESSAGE =
  "Muse Image won't draw this. Try describing it differently.";

/** Plain message when the server has no key to draw with. */
export const NO_KEY_MESSAGE =
  "Image generation is not available on this server.";

export type SheetViewRequest = {
  view: string;
  character: { id: string; name: string; canon: string };
  referenceImage?: string;
  previousResponseId?: string;
  styleImage?: string;
  description?: string;
};

export const SheetViewRequestSchema = z.object({
  view: z.string().min(1),
  character: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    canon: z.string().default(""),
  }),
  referenceImage: z.string().min(1).optional(),
  previousResponseId: z.string().min(1).optional(),
  styleImage: z.string().min(1).optional(),
  description: z.string().min(1).max(2000).optional(),
});

export const SheetViewResponseSchema = z.object({
  imageBase64: z.string().min(1),
  responseId: z.string(),
});

export type SceneArtRequest = {
  part: { id: string; title: string; summary: string };
  characters: Array<{ id: string; name: string }>;
  references: string[];
  styleImage?: string;
  change?: string;
  description?: string;
};

export const SceneArtRequestSchema = z.object({
  part: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().default(""),
  }),
  characters: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1) }))
    .default([]),
  references: z.array(z.string().min(1)).default([]),
  styleImage: z.string().min(1).optional(),
  change: z.string().min(1).max(1000).optional(),
  description: z.string().min(1).max(2000).optional(),
  style: z.enum(["sketch"]).optional(),
  framing: z.string().min(1).max(40).optional(),
});

export const SceneArtResponseSchema = z.object({
  imageBase64: z.string().min(1),
  responseId: z.string(),
});

export const BlockedResponseSchema = z.object({
  blocked: z.literal(true),
  message: z.string(),
  description: z.string(),
});

export function sheetViewLine(view: string): string {
  return SHEET_VIEWS.find((v) => v.id === view)?.line ?? view;
}

/**
 * One sheet prompt. The reference image carries the likeness; with no
 * reference the canon text carries it instead. A description override
 * replaces the character text when the creator rewrote a blocked prompt.
 */
export function sheetPrompt(
  view: string,
  character: { name: string; canon: string },
  description?: string,
): string {
  const who = description ?? `Character: ${character.name}. ${character.canon}`;
  return `${who} ${sheetViewLine(view)} ${SHEET_SUFFIX}`;
}

function referenceNames(
  characters: Array<{ id: string; name: string }>,
  count: number,
): string {
  const names: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const name = characters[i]?.name ?? `character ${i + 1}`;
    names.push(`Reference ${i + 1} shows ${name}.`);
  }
  return names.join(" ");
}

/**
 * One scene prompt. The references carry the likeness; the text names
 * which reference shows whom. A ripple proposal arrives as change; a
 * description override replaces the scene text after a block.
 */
export function scenePrompt(request: {
  part: { title: string; summary: string };
  characters: Array<{ id: string; name: string }>;
  referenceCount: number;
  change?: string;
  description?: string;
}): string {
  const scene =
    request.description ?? `Scene: ${request.part.title}. ${request.part.summary}`;
  const cast =
    request.referenceCount > 0
      ? ` ${referenceNames(request.characters, request.referenceCount)}`
      : "";
  const change = request.change ? ` New story detail: ${request.change}` : "";
  return `${scene}${cast}${change} ${SCENE_SUFFIX}`;
}

/**
 * One storyboard sketch prompt. The references still carry the
 * likeness; the text names which reference shows whom. The sketch
 * suffix replaces the scene suffix, naming the frame's framing.
 */
export function sketchPrompt(request: {
  part: { title: string; summary: string };
  characters: Array<{ id: string; name: string }>;
  referenceCount: number;
  framing?: string;
  change?: string;
  description?: string;
}): string {
  const scene =
    request.description ?? `Scene: ${request.part.title}. ${request.part.summary}`;
  const cast =
    request.referenceCount > 0
      ? ` ${referenceNames(request.characters, request.referenceCount)}`
      : "";
  const change = request.change ? ` New story detail: ${request.change}` : "";
  const framing = request.framing ? ` Framing: ${request.framing}.` : "";
  return `${scene}${cast}${change}${framing} ${SKETCH_SUFFIX}`;
}

/** At most three references travel with a scene request. */
export function pickSceneReferences(references: string[]): string[] {
  return references.slice(0, 3);
}

/** True when the encoded body fits Vercel's request limit. */
export function fitsRequestLimit(body: string): boolean {
  return body.length <= ART_REQUEST_LIMIT_BYTES;
}
