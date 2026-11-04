import { hasFullSheet } from "@/lib/readiness";
import type { Part, World } from "@/lib/world/schemas";

/**
 * Pure data for the Agent package map: which nodes and edges the chosen
 * channel shows, and where each node sits. No React Flow import here, so
 * tests and the dashboard can both use it.
 */

export type MapNodeKind =
  | "story"
  | "character"
  | "place"
  | "scene"
  | "script"
  | "storyboard"
  | "video"
  | "secret"
  | "package";

export type MapNode = {
  id: string;
  kind: MapNodeKind;
  /** Left-to-right column: story 0, characters/places 1, scenes 2, script 3, storyboard 4, video+secret 5, package 6. */
  column: number;
  title: string;
  subtitle?: string;
  /** Where a click (or keyboard link) opens. Absent for the Package output. */
  href?: string;
  made: boolean;
  /** Small art thumbnail when the node has one. */
  thumb?: string;
};

export type MapEdge = {
  id: string;
  source: string;
  target: string;
  /** Animated when the edge leads to a made node. */
  animated: boolean;
};

/** Card size the layout assumes, in canvas pixels. */
export const MAP_NODE_WIDTH = 232;
export const MAP_NODE_HEIGHT = 118;
export const MAP_X_GAP = 96;
export const MAP_Y_GAP = 28;

export function columnOf(kind: MapNodeKind): number {
  switch (kind) {
    case "story":
      return 0;
    case "character":
    case "place":
      return 1;
    case "scene":
      return 2;
    case "script":
      return 3;
    case "storyboard":
      return 4;
    case "video":
    case "secret":
      return 5;
    case "package":
      return 6;
  }
}

/** Covered (channel, part) pairs in story order: the channel's scenes. */
function scenesForChannel(world: World, channelId: string): Part[] {
  const covered = new Set(
    world.beats
      .filter((beat) => beat.channelId === channelId)
      .map((beat) => beat.partId),
  );
  return [...world.parts]
    .filter((part) => covered.has(part.id))
    .sort((a, b) => a.order - b.order);
}

/** Character ids appearing in this channel's take on a part. */
function charactersForScene(
  world: World,
  channelId: string,
  partId: string,
): string[] {
  const ids = new Set<string>();
  const part = world.parts.find((p) => p.id === partId);
  for (const id of part?.characterIds ?? []) ids.add(id);
  for (const beat of world.beats) {
    if (beat.channelId !== channelId || beat.partId !== partId) continue;
    for (const id of beat.characterIds) ids.add(id);
  }
  return [...ids];
}

/** Places named in a part's own words: title, summary and excerpt. */
export function placesForScene(
  part: Part,
  places: Array<{ id: string; name: string }>,
): string[] {
  const haystack = `${part.title} ${part.summary} ${part.excerpt}`.toLowerCase();
  return places
    .filter((place) => place.name.length > 0 && haystack.includes(place.name.toLowerCase()))
    .map((place) => place.id);
}

/** "Genre · Tone" from the story facts, when the material states them. */
export function styleLineFor(world: World): string | undefined {
  const pick = (label: string) =>
    world.facts.find((fact) => fact.label.toLowerCase() === label)?.value.trim() ?? "";
  const bits = [pick("genre"), pick("tone")].filter((bit) => bit.length > 0);
  return bits.length > 0 ? bits.join(" · ") : undefined;
}

export type PackageGraph = { nodes: MapNode[]; edges: MapEdge[] };

/**
 * Nodes and edges for one channel. The secret rule is structural: the
 * only secret text in the graph is this channel's own `channel.secret`;
 * other channels' secrets and unscoped secrets never appear.
 */
export function buildPackageGraph(
  world: World,
  channelId: string,
  projectId: string,
  fileCount: number,
): PackageGraph {
  const channel = world.channels.find((c) => c.id === channelId);
  const scenes = scenesForChannel(world, channelId);
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const madeById = new Map<string, boolean>();

  const push = (node: MapNode) => {
    nodes.push(node);
    madeById.set(node.id, node.made);
  };
  const link = (source: string, target: string) => {
    edges.push({ id: `${source}>>${target}`, source, target, animated: false });
  };

  const styleLine = styleLineFor(world);
  push({
    id: "story",
    kind: "story",
    column: columnOf("story"),
    title: world.title,
    subtitle: styleLine ? `${world.logline} — ${styleLine}` : world.logline,
    href: `/projects/${projectId}/story`,
    made: true,
  });

  for (const character of world.characters) {
    const thumb =
      character.artPath && character.artPath.length > 0
        ? character.artPath
        : (character.sheet.find((view) => view.imagePath)?.imagePath ?? undefined);
    push({
      id: `character:${character.id}`,
      kind: "character",
      column: columnOf("character"),
      title: character.name,
      subtitle: hasFullSheet(character) ? "Sheet complete" : "Sheet not made yet",
      href: `/projects/${projectId}/characters?c=${character.id}`,
      made: hasFullSheet(character),
      thumb,
    });
    link("story", `character:${character.id}`);
  }

  for (const place of world.locations) {
    push({
      id: `place:${place.id}`,
      kind: "place",
      column: columnOf("place"),
      title: place.name,
      subtitle: place.description,
      href: `/projects/${projectId}/story`,
      made: true,
    });
    link("story", `place:${place.id}`);
  }

  for (const part of scenes) {
    const sceneId = `scene:${part.id}`;
    const art = part.imagePath.length > 0 ? part.imagePath : undefined;
    push({
      id: sceneId,
      kind: "scene",
      column: columnOf("scene"),
      title: part.title,
      subtitle: channel ? `${channel.name} · Part ${part.order}` : `Part ${part.order}`,
      href: `/projects/${projectId}/script?channel=${channelId}&part=${part.id}`,
      made: art !== undefined,
      thumb: art,
    });
    for (const characterId of charactersForScene(world, channelId, part.id)) {
      if (madeById.has(`character:${characterId}`)) {
        link(`character:${characterId}`, sceneId);
      }
    }
    for (const placeId of placesForScene(part, world.locations)) {
      link(`place:${placeId}`, sceneId);
    }

    const scriptMade = world.scripts.some(
      (entry) => entry.channelId === channelId && entry.partId === part.id,
    );
    const boardMade = (world.storyboards ?? []).some(
      (board) => board.channelId === channelId && board.partId === part.id,
    );
    const videoMade = (world.shorts ?? []).some(
      (short) => short.channelId === channelId && short.partId === part.id,
    );
    const scriptId = `script:${part.id}`;
    const boardId = `storyboard:${part.id}`;
    const videoId = `video:${part.id}`;
    push({
      id: scriptId,
      kind: "script",
      column: columnOf("script"),
      title: part.title,
      subtitle: "Script",
      href: `/projects/${projectId}/script?channel=${channelId}&part=${part.id}`,
      made: scriptMade,
    });
    push({
      id: boardId,
      kind: "storyboard",
      column: columnOf("storyboard"),
      title: part.title,
      subtitle: "Storyboard",
      href: `/projects/${projectId}/storyboard?channel=${channelId}&part=${part.id}`,
      made: boardMade,
    });
    push({
      id: videoId,
      kind: "video",
      column: columnOf("video"),
      title: part.title,
      subtitle: "Video",
      href: `/projects/${projectId}/video?channel=${channelId}&part=${part.id}`,
      made: videoMade,
    });
    link(sceneId, scriptId);
    link(scriptId, boardId);
    link(boardId, videoId);
  }

  const secretText = (channel?.secret ?? "").trim();
  push({
    id: "secret",
    kind: "secret",
    column: columnOf("secret"),
    title: channel ? `${channel.name} secret` : "Secret",
    subtitle: secretText.length > 0 ? secretText : "No secret revealed yet",
    href: `/projects/${projectId}/channels`,
    made: secretText.length > 0,
  });

  push({
    id: "package",
    kind: "package",
    column: columnOf("package"),
    title: "Package",
    subtitle: `${fileCount} file${fileCount === 1 ? "" : "s"}`,
    made: true,
  });

  // Everything the channel made flows into the Package output.
  for (const node of nodes) {
    if (node.id !== "story" && node.id !== "package") {
      link(node.id, "package");
    }
  }

  for (const edge of edges) {
    edge.animated = madeById.get(edge.target) ?? false;
  }
  return { nodes, edges };
}

export type PositionedNode = MapNode & { x: number; y: number };

/**
 * Left-to-right columns with generous spacing. Each column is centred
 * against the tallest one, so short columns sit mid-canvas instead of
 * hugging the top. Deterministic: same nodes, same positions.
 */
export function layoutPackageGraph(nodes: MapNode[]): {
  placed: PositionedNode[];
  width: number;
  height: number;
} {
  const columns = new Map<number, MapNode[]>();
  for (const node of nodes) {
    const list = columns.get(node.column) ?? [];
    list.push(node);
    columns.set(node.column, list);
  }
  const ordered = [...columns.keys()].sort((a, b) => a - b);
  const tallest = Math.max(
    0,
    ...ordered.map(
      (column) =>
        (columns.get(column)?.length ?? 0) * (MAP_NODE_HEIGHT + MAP_Y_GAP) - MAP_Y_GAP,
    ),
  );
  const placed: PositionedNode[] = [];
  for (const column of ordered) {
    const list = [...(columns.get(column) ?? [])].sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title),
    );
    const colHeight = list.length * (MAP_NODE_HEIGHT + MAP_Y_GAP) - MAP_Y_GAP;
    const top = Math.max(0, (tallest - colHeight) / 2);
    list.forEach((node, index) => {
      placed.push({
        ...node,
        x: column * (MAP_NODE_WIDTH + MAP_X_GAP),
        y: top + index * (MAP_NODE_HEIGHT + MAP_Y_GAP),
      });
    });
  }
  const last = ordered.length > 0 ? (ordered[ordered.length - 1] as number) : 0;
  return {
    placed,
    width: last * (MAP_NODE_WIDTH + MAP_X_GAP) + MAP_NODE_WIDTH,
    height: Math.max(tallest, MAP_NODE_HEIGHT),
  };
}
