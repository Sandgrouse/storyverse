import { z } from "zod";
import { stylePromptText } from "@/lib/style";
import type { VisualStyle } from "@/lib/world/schemas";

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

/** Extra "More poses" chips on the Characters page. Plain data only. */
export const EXTRA_POSES = [
  { id: "sitting", label: "Sitting", line: "Sitting, relaxed and facing the viewer." },
  { id: "running", label: "Running", line: "Running fast, mid-stride." },
  {
    id: "fighting-stance",
    label: "Fighting stance",
    line: "In a fighting stance, ready and alert.",
  },
  { id: "looking-back", label: "Looking back", line: "Looking back over one shoulder." },
  { id: "arms-raised", label: "Arms raised", line: "Standing with both arms raised." },
  {
    id: "close-up-face",
    label: "Close-up face",
    line: "Close-up portrait of the face only.",
  },
] as const;

export type ExtraPoseId = (typeof EXTRA_POSES)[number]["id"];

export const EXTRA_POSE_IDS = EXTRA_POSES.map((pose) => pose.id);

export const EXTRA_POSE_LABELS = EXTRA_POSES.map((pose) => pose.label);

/** Every view the sheet grid knows by name, base views first. */
export const ALL_KNOWN_VIEW_IDS: string[] = [...SHEET_VIEW_IDS, ...EXTRA_POSE_IDS];

/**
 * Turn free text from the "More poses" box into a sheet view id.
 * Lowercase, joined with dashes, safe for storage and image names.
 * Pure, so the drawer and tests share it.
 */
export function poseIdFor(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug;
}

/** Human label for a custom pose id: dashes back to spaces. */
export function poseLabelFor(viewId: string): string {
  const known =
    SHEET_VIEWS.find((v) => v.id === viewId)?.label ??
    EXTRA_POSES.find((p) => p.id === viewId)?.label;
  if (known) return known;
  const words = viewId.replace(/-/g, " ").trim();
  if (!words) return viewId;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Order sheet entries for the grid: known views first in their
 * canonical order (base sheet, then the pose chips), then any custom
 * views in the order they were made. Pure, so the drawer and tests
 * share it.
 */
export function orderedSheetViews<T extends { view: string }>(sheet: T[]): T[] {
  const order = new Map<string, number>(
    ALL_KNOWN_VIEW_IDS.map((id, i) => [id, i]),
  );
  return [...sheet].sort((a, b) => {
    const ai = order.has(a.view) ? (order.get(a.view) as number) : null;
    const bi = order.has(b.view) ? (order.get(b.view) as number) : null;
    if (ai !== null && bi !== null) return ai - bi;
    if (ai !== null) return -1;
    if (bi !== null) return 1;
    return 0;
  });
}

/**
 * Base sheet views still missing an image, in canonical order. Empty means
 * the sheet is complete. Pure, so the drawer and tests share it.
 */
export function missingSheetViews(
  sheet: Array<{ view: string; imagePath?: string | null }>,
): string[] {
  const have = new Set(
    sheet.filter((entry) => entry.imagePath).map((entry) => entry.view),
  );
  return SHEET_VIEW_IDS.filter((id) => !have.has(id));
}

/** True when every base sheet view has an image. */
export function isSheetComplete(
  sheet: Array<{ view: string; imagePath?: string | null }>,
): boolean {
  return missingSheetViews(sheet).length === 0;
}

/**
 * Wrap a sheet lightbox pose index past either end, so the arrows loop.
 * Pure, so the lightbox and tests share it.
 */
export function wrapSheetIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

/**
 * Keyboard action for the sheet lightbox: arrows move between poses,
 * Escape closes. Anything else is ignored. Pure, so the lightbox and
 * tests share it.
 */
export function sheetLightboxKey(
  key: string,
): "next" | "prev" | "close" | null {
  if (key === "Escape") return "close";
  if (key === "ArrowRight") return "next";
  if (key === "ArrowLeft") return "prev";
  return null;
}

/** True when the sheet-view route may draw this view. */
export function isSupportedSheetView(view: string): boolean {
  if (!view || view.length > 60) return false;
  if (ALL_KNOWN_VIEW_IDS.includes(view)) return true;
  return /^[a-z0-9-]+$/.test(view);
}

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
  /** The project's visual style preset, when one is set. */
  stylePreset: z.string().default(""),
  /** The project's visual style notes, in the owner's words. */
  styleNotes: z.string().default(""),
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
  /** The project's visual style preset, when one is set. */
  stylePreset: z.string().default(""),
  /** The project's visual style notes, in the owner's words. */
  styleNotes: z.string().default(""),
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
  return (
    SHEET_VIEWS.find((v) => v.id === view)?.line ??
    EXTRA_POSES.find((p) => p.id === view)?.line ??
    poseLabelFor(view)
  );
}

/**
 * Append the visual style's phrase and notes, only when a style is set.
 * With no style the prompt is exactly as before.
 */
export function withVisualStyle(base: string, style?: VisualStyle): string {
  const text = stylePromptText(style);
  return text.length > 0 ? `${base} ${text}` : base;
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
  style?: VisualStyle,
): string {
  const who = description ?? `Character: ${character.name}. ${character.canon}`;
  return withVisualStyle(`${who} ${sheetViewLine(view)} ${SHEET_SUFFIX}`, style);
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
  style?: VisualStyle;
}): string {
  const scene =
    request.description ?? `Scene: ${request.part.title}. ${request.part.summary}`;
  const cast =
    request.referenceCount > 0
      ? ` ${referenceNames(request.characters, request.referenceCount)}`
      : "";
  const change = request.change ? ` New story detail: ${request.change}` : "";
  return withVisualStyle(
    `${scene}${cast}${change} ${SCENE_SUFFIX}`,
    request.style,
  );
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
