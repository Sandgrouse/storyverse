import { z } from "zod";

export const READ_INSTRUCTIONS =
  "You read a creator's raw story material and build its canon. Use only what the material says. Never rename anyone, and keep all names and details exactly. The logline tells the story itself in one gripping sentence. It never describes the document. Split the story into its natural parts. An excerpt is a short retelling in your own words, never copied text. A gap is an important question the material leaves open. For each image, say who or what it shows. Set artFile on a character, or on a part, only if an image clearly shows them, otherwise leave it empty.";

export const IDEA_ADDITION =
  "This is only an idea. Build a first draft of the canon from it, and treat what you add as a draft for the creator to confirm.";

export const ReadFileSchema = z.object({
  name: z.string().min(1),
  type: z.string().default(""),
  dataUrl: z.string().optional(),
  text: z.string().optional(),
});

export type ReadFileInput = z.infer<typeof ReadFileSchema>;

export const ReadRequestSchema = z.object({
  files: z.array(ReadFileSchema).default([]),
  idea: z.string().optional(),
});

export const ReadFileKindSchema = z.enum([
  "story",
  "character_art",
  "scene_art",
  "other",
]);

export const ReadFileResultSchema = z.object({
  file: z.string().min(1),
  kind: ReadFileKindSchema,
  label: z.string().min(1),
});

export const ReadCharacterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  canon: z.string().default(""),
  artFile: z.string().default(""),
});

export const ReadLocationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
});

export const ReadPartSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().positive(),
  title: z.string().min(1),
  summary: z.string().default(""),
  excerpt: z.string().default(""),
  artFile: z.string().default(""),
});

export const ReadGapSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
});

export const ReadModelOutputSchema = z.object({
  title: z.string().min(1),
  logline: z.string().default(""),
  files: z.array(ReadFileResultSchema).default([]),
  characters: z.array(ReadCharacterSchema).default([]),
  locations: z.array(ReadLocationSchema).default([]),
  parts: z.array(ReadPartSchema).default([]),
  gaps: z.array(ReadGapSchema).default([]),
});

export type ReadModelOutput = z.infer<typeof ReadModelOutputSchema>;

function isPdf(file: ReadFileInput): boolean {
  return (
    file.name.toLowerCase().endsWith(".pdf") ||
    (file.type.includes("pdf") && typeof file.dataUrl === "string")
  );
}

function isTextFile(file: ReadFileInput): boolean {
  if (typeof file.text === "string") return true;
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt")
  );
}

/**
 * Model content parts in order: one input_text listing the file names in
 * order, then an input_file for each PDF, input_text for each text file,
 * and an input_image for each image.
 */
export function buildReadContent(
  files: ReadFileInput[],
  idea?: string,
): Array<Record<string, unknown>> {
  const names = files.map((file) => file.name);
  const content: Array<Record<string, unknown>> = [];
  if (names.length > 0) {
    content.push({
      type: "input_text",
      text: `Files in order: ${names.join(", ")}`,
    });
  }
  for (const file of files) {
    if (isPdf(file) && typeof file.dataUrl === "string") {
      content.push({
        type: "input_file",
        filename: file.name,
        file_data: file.dataUrl,
      });
    }
  }
  for (const file of files) {
    if (!isPdf(file) && isTextFile(file) && typeof file.text === "string") {
      content.push({
        type: "input_text",
        text: `File ${file.name}:\n${file.text}`,
      });
    }
  }
  for (const file of files) {
    if (!isPdf(file) && !isTextFile(file) && typeof file.dataUrl === "string") {
      content.push({
        type: "input_image",
        image_url: file.dataUrl,
      });
    }
  }
  if (typeof idea === "string" && idea.trim().length > 0) {
    if (names.length === 0) {
      content.push({ type: "input_text", text: idea.trim() });
      content.push({ type: "input_text", text: IDEA_ADDITION });
    } else {
      content.push({ type: "input_text", text: `Idea: ${idea.trim()}` });
    }
  }
  return content;
}

export function buildReadInput(
  files: ReadFileInput[],
  idea?: string,
): Array<{ role: string; content: Array<Record<string, unknown>> }> {
  return [{ role: "user", content: buildReadContent(files, idea) }];
}

/** JSON Schema twin of the read model output, sent as the response format. */
export function readModelJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      logline: { type: "string" },
      files: {
        type: "array",
        items: {
          type: "object",
          properties: {
            file: { type: "string" },
            kind: {
              type: "string",
              enum: ["story", "character_art", "scene_art", "other"],
            },
            label: { type: "string" },
          },
          required: ["file", "kind", "label"],
          additionalProperties: false,
        },
      },
      characters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            canon: { type: "string" },
            artFile: { type: "string" },
          },
          required: ["id", "name", "canon", "artFile"],
          additionalProperties: false,
        },
      },
      locations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
          },
          required: ["id", "name", "description"],
          additionalProperties: false,
        },
      },
      parts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            order: { type: "integer", minimum: 1 },
            title: { type: "string" },
            summary: { type: "string" },
            excerpt: { type: "string" },
            artFile: { type: "string" },
          },
          required: ["id", "order", "title", "summary", "excerpt", "artFile"],
          additionalProperties: false,
        },
      },
      gaps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            question: { type: "string" },
          },
          required: ["id", "question"],
          additionalProperties: false,
        },
      },
    },
    required: [
      "title",
      "logline",
      "files",
      "characters",
      "locations",
      "parts",
      "gaps",
    ],
    additionalProperties: false,
  };
}

/**
 * Clear any artFile that names no sent file. The model must only point at
 * files the creator actually sent; anything else becomes empty.
 */
export function sanitizeArtFiles(
  canon: ReadModelOutput,
  sentNames: Set<string>,
): ReadModelOutput {
  const clean = (artFile: string): string =>
    artFile.length > 0 && sentNames.has(artFile) ? artFile : "";
  return {
    ...canon,
    characters: canon.characters.map((character) => ({
      ...character,
      artFile: clean(character.artFile),
    })),
    parts: canon.parts.map((part) => ({
      ...part,
      artFile: clean(part.artFile),
    })),
  };
}
