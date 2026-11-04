/**
 * Visual style presets. Pure: no key, no fetch, so routes, client
 * components and tests can all import it freely.
 */

import type { VisualStyle, VisualStyleSource } from "@/lib/world/schemas";

export type VisualStylePreset = {
  preset: string;
  description: string;
  /** Short phrase appended to image prompts when this style is set. */
  phrase: string;
};

export const VISUAL_PRESETS: VisualStylePreset[] = [
  {
    preset: "Painterly 2D",
    description: "Rich painted frames with visible brushwork.",
    phrase: "painterly 2D animation style with visible brushwork",
  },
  {
    preset: "Anime",
    description: "Clean linework with bold colour and expressive faces.",
    phrase: "anime style, clean linework, bold colour, expressive faces",
  },
  {
    preset: "Comic book",
    description: "Bold inked panels with strong outlines.",
    phrase: "comic-book style, bold inked outlines, flat graphic colour",
  },
  {
    preset: "Stop-motion",
    description: "Handmade figures and miniature sets.",
    phrase: "handmade stop-motion style, felt and clay textures, miniature sets",
  },
  {
    preset: "Low-poly 3D",
    description: "Faceted 3D shapes with flat stylised colour.",
    phrase: "low-poly 3D style, faceted geometry, flat stylised colour",
  },
  {
    preset: "Pixel art",
    description: "Crisp pixels with a limited palette.",
    phrase: "pixel-art style, crisp pixels, limited palette",
  },
  {
    preset: "Photoreal",
    description: "Lifelike cinematic imagery with natural light.",
    phrase: "photoreal cinematic style, natural light, lifelike detail",
  },
  {
    preset: "Watercolour",
    description: "Soft washes with gentle edges.",
    phrase: "watercolour style, soft washes, gentle edges",
  },
  {
    preset: "Custom",
    description: "The owner's own style, described in the notes.",
    phrase: "",
  },
];

/** The preset entry for a name, or undefined when it names none. */
export function presetById(preset: string): VisualStylePreset | undefined {
  return VISUAL_PRESETS.find((style) => style.preset === preset);
}

/**
 * Prompt text for image prompts: the preset's phrase plus the owner's
 * notes. Empty when no style is set, so prompts stay exactly as before.
 */
export function stylePromptText(style: VisualStyle | undefined): string {
  if (!style || style.preset.trim().length === 0) return "";
  const phrase = presetById(style.preset)?.phrase ?? "";
  const notes = style.notes.trim();
  return [phrase, notes].filter((part) => part.length > 0).join(" ");
}

/**
 * One line naming the project's visual style, for the script draft
 * prompt and the game art bible. Empty when no style is set.
 */
export function visualStyleLine(style: VisualStyle | undefined): string {
  if (!style || style.preset.trim().length === 0) return "";
  const notes = style.notes.trim();
  return notes.length > 0
    ? `Visual style: ${style.preset.trim()}. ${notes}`
    : `Visual style: ${style.preset.trim()}.`;
}

/** Provenance line for the Understood page's style card. */
export function visualStyleSourceLine(
  source: VisualStyleSource | undefined,
): string {
  if (source === "art") return "From your art";
  if (source === "muse") return "My reading";
  if (source === "you") return "You chose this";
  return "";
}
