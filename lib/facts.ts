import { z } from "zod";
import { READ_INSTRUCTIONS, ReadFactSchema } from "@/lib/read";
import { WorldSchema, type World } from "@/lib/world/schemas";

/**
 * Story basics for a saved project that has none. The model returns
 * facts in the same shape as the read step does: the read prompt and
 * the read fact schema, chosen to suit the kind of story, using real
 * names only.
 */
export const FACTS_INSTRUCTIONS = READ_INSTRUCTIONS;

export const FactsRequestSchema = z.object({
  world: WorldSchema,
});

export const FactsModelOutputSchema = z.object({
  facts: z.array(ReadFactSchema).default([]),
});

export type FactsModelOutput = z.infer<typeof FactsModelOutputSchema>;

/**
 * JSON Schema twin of the facts, matching the read step's facts shape:
 * source is material only when the material states it, otherwise muse.
 */
export function factsModelJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      facts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            value: { type: ["string", "null"] },
            source: { type: "string", enum: ["material", "muse"] },
          },
          required: ["id", "label", "value", "source"],
          additionalProperties: false,
        },
      },
    },
    required: ["facts"],
    additionalProperties: false,
  };
}

/** Readable canon text for the facts model. */
export function factsModelInput(world: World): string {
  const lines: string[] = [];
  lines.push(`Canon: ${world.title}`);
  lines.push(`Logline: ${world.logline}`);
  lines.push("");
  lines.push("Characters:");
  for (const character of world.characters) {
    lines.push(`- ${character.name}: ${character.canon}`);
  }
  lines.push("");
  lines.push("Locations:");
  for (const location of world.locations) {
    lines.push(`- ${location.name}: ${location.description}`);
  }
  lines.push("");
  lines.push("Parts:");
  const ordered = [...world.parts].sort((a, b) => a.order - b.order);
  for (const part of ordered) {
    const text = part.text.trim().length > 0 ? ` ${part.text}` : "";
    lines.push(`- ${part.title}: ${part.summary} ${part.excerpt}${text}`);
  }
  return lines.join("\n");
}
