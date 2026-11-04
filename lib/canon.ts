export type HighlightKind = "character" | "place";

export type CanonNames = {
  characters: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
};

export type CanonPartText = {
  summary: string;
  excerpt: string;
  text?: string | null;
};

export type HighlightSegment = {
  text: string;
  kind: HighlightKind | null;
  id: string | null;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Aliases a name can appear as: the full name, plus the name without a
 * leading "The ". Matching is case-insensitive and whole-word.
 */
export function aliasesFor(name: string): string[] {
  const aliases = [name];
  const stripped = name.replace(/^the\s+/i, "");
  if (stripped.length > 0 && stripped !== name) aliases.push(stripped);
  return aliases;
}

type Entry = { alias: string; kind: HighlightKind; id: string };

function entriesFor(world: CanonNames): Entry[] {
  const entries: Entry[] = [];
  for (const character of world.characters) {
    for (const alias of aliasesFor(character.name)) {
      if (alias.length > 0) entries.push({ alias, kind: "character", id: character.id });
    }
  }
  for (const location of world.locations) {
    for (const alias of aliasesFor(location.name)) {
      if (alias.length > 0) entries.push({ alias, kind: "place", id: location.id });
    }
  }
  // Longest first so "The stream" wins over "stream"; a character wins ties.
  entries.sort((a, b) => {
    if (b.alias.length !== a.alias.length) return b.alias.length - a.alias.length;
    if (a.kind === b.kind) return 0;
    return a.kind === "character" ? -1 : 1;
  });
  return entries;
}

function patternFor(entries: Entry[]): RegExp | null {
  if (entries.length === 0) return null;
  try {
    return new RegExp(`(?<!\\w)(${entries.map((e) => escapeRegExp(e.alias)).join("|")})(?!\\w)`, "gi");
  } catch {
    return null;
  }
}

/**
 * Split a passage into plain and highlighted segments. Names match whole
 * names only, case-insensitively, including the form without a leading
 * "The ". A character highlight is amber and a place highlight is teal.
 */
export function highlightPassage(
  passage: string,
  world: CanonNames,
): HighlightSegment[] {
  const entries = entriesFor(world);
  const pattern = patternFor(entries);
  if (!pattern) return [{ text: passage, kind: null, id: null }];
  const byAlias = new Map<string, Entry>();
  for (const entry of entries) {
    const key = entry.alias.toLowerCase();
    if (!byAlias.has(key)) byAlias.set(key, entry);
  }
  return passage.split(pattern).map((text) => {
    if (text.length === 0) return { text, kind: null, id: null };
    const entry = byAlias.get(text.toLowerCase());
    if (!entry) return { text, kind: null, id: null };
    return { text, kind: entry.kind, id: entry.id };
  });
}

/** The book shows a part's verbatim text; old worlds fall back to summary + excerpt. */
export function bookPassageForPart(part: CanonPartText): string {
  const text = part.text?.trim() ?? "";
  if (text.length > 0) return text;
  return `${part.summary} ${part.excerpt}`.trim();
}

/** How many chapters mention this entry, matching whole names only. */
export function chapterCountFor(
  id: string,
  kind: HighlightKind,
  world: CanonNames & { parts: CanonPartText[] },
): number {
  const source =
    kind === "character"
      ? world.characters.find((c) => c.id === id)
      : world.locations.find((l) => l.id === id);
  if (!source) return 0;
  const aliases = aliasesFor(source.name).filter((a) => a.length > 0);
  if (aliases.length === 0) return 0;
  let pattern: RegExp | null = null;
  try {
    pattern = new RegExp(`(?<!\\w)(${aliases.map(escapeRegExp).join("|")})(?!\\w)`, "i");
  } catch {
    return 0;
  }
  let count = 0;
  for (const part of world.parts) {
    pattern.lastIndex = 0;
    if (pattern.test(bookPassageForPart(part))) count += 1;
  }
  return count;
}

export type PlaceArtPart = CanonPartText & {
  id?: string;
  order?: number | null;
  imagePath?: string | null;
};

/**
 * Art for a place: the art of the first part (in story order) whose
 * text, summary or excerpt names the place, matching whole names only
 * and case-insensitively. Falls back to the first part's art.
 */
export function placeArtFor(
  location: { id?: string; name: string },
  world: { parts: PlaceArtPart[] },
): string {
  const ordered = [...world.parts].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const firstArt = ordered[0]?.imagePath ?? "";
  const aliases = aliasesFor(location.name).filter((a) => a.length > 0);
  if (aliases.length === 0) return firstArt;
  let pattern: RegExp | null = null;
  try {
    pattern = new RegExp(`(?<!\\w)(${aliases.map(escapeRegExp).join("|")})(?!\\w)`, "i");
  } catch {
    return firstArt;
  }
  for (const part of ordered) {
    pattern.lastIndex = 0;
    const haystack = `${part.text ?? ""} ${part.summary} ${part.excerpt}`;
    if (!pattern.test(haystack)) continue;
    if (part.imagePath && part.imagePath.length > 0) return part.imagePath;
  }
  return firstArt;
}

/** Short chips for the book cover, drawn from the story basics. */
export function coverChips(world: {
  characters: unknown[];
  locations: unknown[];
  parts: unknown[];
  facts: Array<{ value: string }>;
}): string[] {
  const chips = world.facts
    .filter((fact) => fact.value.trim().length > 0)
    .slice(0, 3)
    .map((fact) => fact.value.trim());
  chips.push(
    `${world.parts.length} ${world.parts.length === 1 ? "chapter" : "chapters"} · ${world.characters.length} ${world.characters.length === 1 ? "character" : "characters"} · ${world.locations.length} ${world.locations.length === 1 ? "place" : "places"}`,
  );
  return chips;
}
