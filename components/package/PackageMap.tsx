"use client";

/*
 * Read-only canvas of the chosen channel: story, characters, places,
 * scenes, scripts, storyboards, videos, the channel secret and the
 * package, left to right. Nodes and edges come from the pure
 * `buildPackageGraph` model; positions come from `layoutPackageGraph`.
 * Nothing here edits the world yet: nodes are not draggable and edges
 * cannot be drawn. When editing and automation arrive, they should
 * reuse this model — node ids are stable (`kind:id`) and every node
 * already carries the page its editor will open (`href`).
 */

import { useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { channelColorByIndex } from "@/lib/story";
import {
  layoutPackageGraph,
  type MapNode,
  type PackageGraph,
} from "./graph";

type CardData = MapNode & { color: string } & Record<string, unknown>;

const CHANNEL_NODE_KINDS = new Set(["scene", "script", "storyboard", "video"]);

function colorFor(node: MapNode, channelColor: string): string {
  if (CHANNEL_NODE_KINDS.has(node.kind)) return channelColor;
  switch (node.kind) {
    case "story":
    case "package":
      return "var(--clay)";
    case "secret":
      return "#a9771f";
    case "character":
      return "#5c7247";
    case "place":
      return "#7a6a4f";
    default:
      return "var(--clay)";
  }
}

/** One card on the canvas, in the app's style. */
function PackCard({ data }: { data: CardData }) {
  const node = data as MapNode;
  const color = String(data.color ?? "var(--clay)");
  return (
    <div
      className={`pkgnode${node.made ? "" : " unmade"}`}
      style={{ borderTopColor: color }}
    >
      <div className="pkgnode-kind">{node.kind}</div>
      <div className="pkgnode-title">{node.title}</div>
      {node.subtitle ? <div className="pkgnode-sub">{node.subtitle}</div> : null}
      {node.made && node.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pkgnode-thumb" src={node.thumb} alt="" loading="lazy" />
      ) : null}
      {!node.made && node.href ? (
        <a className="pkgnode-link" href={node.href}>
          Make it
        </a>
      ) : null}
    </div>
  );
}

const nodeTypes = { pkgCard: PackCard };

function FitButton() {
  const { fitView } = useReactFlow();
  return (
    <button
      type="button"
      className="packfit"
      style={{ position: "absolute", right: 12, top: 12, zIndex: 5 }}
      onClick={() => void fitView({ padding: 0.18, duration: 200 })}
    >
      Fit
    </button>
  );
}

function Canvas({
  graph,
  channelIndex,
  onOpen,
}: {
  graph: PackageGraph;
  channelIndex: number;
  onOpen: (href: string) => void;
}) {
  const channelColor = channelColorByIndex(channelIndex);
  const placed = useMemo(() => layoutPackageGraph(graph.nodes), [graph]);
  const nodes: Node[] = useMemo(
    () =>
      placed.placed.map((node) => ({
        id: node.id,
        type: "pkgCard",
        position: { x: node.x, y: node.y },
        data: { ...node, color: colorFor(node, channelColor) },
        draggable: false,
        selectable: Boolean(node.href),
      })),
    [placed, channelColor],
  );
  const edges: Edge[] = useMemo(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: edge.animated,
      })),
    [graph],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
      zoomOnPinch
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.2}
      maxZoom={1.6}
      defaultEdgeOptions={{ style: { strokeWidth: 1.5 } }}
      onNodeClick={(_event, node) => {
        const href = (node.data as MapNode)?.href;
        if (href) onOpen(href);
      }}
      style={{ width: "100%", height: "100%" }}
    >
      <Background gap={28} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(node) => String((node.data as CardData)?.color ?? "#999")}
      />
      <FitButton />
    </ReactFlow>
  );
}

/**
 * Pan-and-zoom map of the channel. Rendered only on the client: the
 * canvas measures the DOM, so server output uses the static fallback.
 */
export default function PackageMap({
  graph,
  channelIndex,
  onOpen,
}: {
  graph: PackageGraph;
  channelIndex: number;
  onOpen: (href: string) => void;
}) {
  if (graph.nodes.length === 0) {
    return (
      <div className="packmap" role="application" aria-label="Channel map">
        <div className="mapempty" role="status">
          Nothing to map yet for this channel.
        </div>
      </div>
    );
  }
  return (
    <div className="packmap" role="application" aria-label="Channel map">
      <ReactFlowProvider>
        <Canvas graph={graph} channelIndex={channelIndex} onOpen={onOpen} />
      </ReactFlowProvider>
    </div>
  );
}

/** Static list of the same nodes for server output and narrow screens. */
export function PackageMapFallback({ graph }: { graph: PackageGraph }) {
  return (
    <div className="packmap-fallback" role="list" aria-label="Channel map contents">
      {graph.nodes.map((node) => (
        <div key={node.id} className="packmap-row" role="listitem">
          <span className="packmap-row-kind">{node.kind} · </span>
          {node.href ? <a href={node.href}>{node.title}</a> : node.title}
          {!node.made ? " (not made yet)" : ""}
        </div>
      ))}
    </div>
  );
}
