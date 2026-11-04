"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { World } from "@/lib/world/schemas";
import {
  buildAgentZip,
  fileSizeOf,
  formatFileSize,
  gameDesignSections,
  packageChannelTiles,
  planAgentFiles,
  type PackageFile,
} from "@/lib/package";
import { channelReadiness } from "@/lib/readiness";
import { visualStyleLine } from "@/lib/style";
import Accordion from "./Accordion";
import PackageMap, { PackageMapFallback } from "./PackageMap";
import { buildPackageGraph } from "./graph";
import {
  characterRows,
  sceneRows,
  unfinishedCharacterRows,
  unfinishedSceneRows,
  type CharacterRow,
  type SceneRow,
} from "./groups";

type ExportState = { kind: "idle" } | { kind: "working" } | { kind: "error" };

type View = "map" | "files" | "readiness";

const VIEW_KEY = "storyverse-package-view";

function isView(value: string | null): value is View {
  return value === "map" || value === "files" || value === "readiness";
}

/** A zero total is complete: there is nothing to make. */
function ratio(made: number, total: number): number {
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, made / total));
}

function Tile({
  label,
  value,
  sub,
  made,
  total,
  open,
}: {
  label: string;
  value: string;
  sub: string;
  made: number;
  total: number;
  open: boolean;
}) {
  return (
    <div className="packtile" tabIndex={open ? 0 : -1} aria-label={`${label}: ${value}. ${sub}`}>
      <span className="packtile-num">{value}</span>
      <span className="packtile-label">{label}</span>
      <span className="packtile-sub">{sub}</span>
      <span
        className="packbar"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(ratio(made, total) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${Math.round(ratio(made, total) * 100)}%` }} />
      </span>
    </div>
  );
}

type TreeDir = {
  dirs: Map<string, TreeDir>;
  files: Array<{ name: string; size: string }>;
};

function emptyDir(): TreeDir {
  return { dirs: new Map(), files: [] };
}

/** Nest files under their folders for the collapsible tree. */
export function folderTree(files: PackageFile[]): { root: string | null; tree: TreeDir } {
  const first = files[0]?.path.split("/")[0] ?? null;
  const shared =
    first !== null &&
    first !== undefined &&
    files.every((f) => f.path.split("/")[0] === first) &&
    files.some((f) => f.path.includes("/"))
      ? first
      : null;
  const tree = emptyDir();
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = file.path.split("/");
    if (shared) parts.shift();
    const name = parts.pop() ?? file.path;
    let node = tree;
    for (const part of parts) {
      let next = node.dirs.get(part);
      if (!next) {
        next = emptyDir();
        node.dirs.set(part, next);
      }
      node = next;
    }
    node.files.push({ name, size: formatFileSize(fileSizeOf(file)) });
  }
  return { root: shared, tree };
}

function DirNode({
  name,
  node,
  open,
  depth,
}: {
  name: string;
  node: TreeDir;
  open: boolean;
  depth: number;
}) {
  return (
    <details className="packdir" open={depth === 0 ? true : undefined}>
      <summary tabIndex={open ? 0 : -1}>
        {name}/ <span className="packdir-count">{node.files.length + node.dirs.size} items</span>
      </summary>
      <div className="packdir-body">
        {[...node.dirs.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([dir, child]) => (
            <DirNode key={dir} name={dir} node={child} open={open} depth={depth + 1} />
          ))}
        {[...node.files]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((file) => (
            <div className="packfile" key={file.name}>
              <span className="packfile-name">{file.name}</span>
              <span className="packfile-size">{file.size}</span>
            </div>
          ))}
      </div>
    </details>
  );
}

/** One scene row: title and channel, with Script/Storyboard/Video/Art chips. */
function SceneRowView({ row, open }: { row: SceneRow; open: boolean }) {
  return (
    <div className="packrow">
      <div className="packrow-head">
        <span className="packrow-title">{row.title}</span>
        <span className="packrow-sub">{row.channelName}</span>
      </div>
      <div className="packchips">
        {row.chips.map((chip) => (
          <Link
            key={chip.kind}
            href={chip.href}
            tabIndex={open ? 0 : -1}
            className={chip.made ? "packchip" : "packchip missing"}
          >
            {chip.label}: {chip.made ? "Open" : "Make it"}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** One character row: name, with Sheet/Cutouts/Voice chips. */
function CharacterRowView({ row, open }: { row: CharacterRow; open: boolean }) {
  return (
    <div className="packrow">
      <div className="packrow-head">
        <span className="packrow-title">{row.name}</span>
      </div>
      <div className="packchips">
        {row.chips.map((chip) => (
          <Link
            key={chip.kind}
            href={chip.href}
            tabIndex={open ? 0 : -1}
            className={chip.made ? "packchip" : "packchip missing"}
          >
            {chip.label}: {chip.made ? "Open" : "Make it"}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function PackageDashboard({
  world,
  open,
}: {
  world: World;
  open: boolean;
}) {
  const [channelId, setChannelId] = useState(world.channels[0]?.id ?? "");
  const [state, setState] = useState<ExportState>({ kind: "idle" });
  const [view, setView] = useState<View>("map");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("view");
    const stored = window.localStorage.getItem(VIEW_KEY);
    if (isView(fromUrl)) {
      setView(fromUrl);
    } else if (isView(stored)) {
      setView(stored);
    } else if (window.matchMedia("(max-width: 900px)").matches) {
      setView("files");
    }
  }, []);

  useEffect(() => {
    setChannelId((prev) =>
      world.channels.some((c) => c.id === prev)
        ? prev
        : (world.channels[0]?.id ?? ""),
    );
    setState({ kind: "idle" });
  }, [world]);

  const chooseView = (next: View) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
      const url = new URL(window.location.href);
      url.searchParams.set("view", next);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // Private browsing or no history: the switch still works in memory.
    }
  };

  const tiles = useMemo(
    () => (channelId ? packageChannelTiles(world, channelId) : []),
    [world, channelId],
  );
  const files = useMemo(
    () => (channelId ? planAgentFiles(world, channelId) : []),
    [world, channelId],
  );
  const tree = useMemo(() => folderTree(files), [files]);
  const channel = world.channels.find((c) => c.id === channelId);
  const channelIndex = Math.max(
    0,
    world.channels.findIndex((c) => c.id === channelId),
  );
  const graph = useMemo(
    () => (channelId ? buildPackageGraph(world, channelId, world.id, files.length) : null),
    [world, channelId, files.length],
  );
  const rows = useMemo(
    () => (channelId ? sceneRows(world, world.id, channelId) : []),
    [world, channelId],
  );
  const chars = useMemo(() => characterRows(world, world.id), [world]);
  const undoneRows = useMemo(() => unfinishedSceneRows(rows), [rows]);
  const undoneChars = useMemo(() => unfinishedCharacterRows(chars), [chars]);
  const todoMade = useMemo(() => {
    const chips = [...undoneRows.flatMap((row) => row.chips), ...undoneChars.flatMap((row) => row.chips)];
    return chips.filter((chip) => chip.made).length;
  }, [undoneRows, undoneChars]);
  const todoTotal = useMemo(() => {
    const chips = [...undoneRows.flatMap((row) => row.chips), ...undoneChars.flatMap((row) => row.chips)];
    return chips.length;
  }, [undoneRows, undoneChars]);
  const isGame = channel?.kind === "game";
  const designSections = useMemo(
    () => (isGame && channelId ? gameDesignSections(world, channelId) : []),
    [world, channelId, isGame],
  );
  const styleLine = useMemo(() => visualStyleLine(world.visualStyle), [world]);
  const castNames = useMemo(() => {
    const ids = new Set<string>();
    for (const beat of world.beats) {
      if (beat.channelId !== channelId) continue;
      for (const id of beat.characterIds) ids.add(id);
    }
    return world.characters
      .filter((character) => ids.has(character.id))
      .map((character) => character.name);
  }, [world, channelId]);
  const designPartId =
    world.scripts.find(
      (script) => script.channelId === channelId && script.form === "design",
    )?.partId ?? rows[0]?.partId;
  const designHref =
    designPartId !== undefined
      ? `/projects/${world.id}/script?channel=${channelId}&part=${designPartId}`
      : `/projects/${world.id}/script?channel=${channelId}`;

  const openMapNode = (href: string) => {
    window.location.assign(href);
  };

  const exportZip = async () => {
    if (!channelId || state.kind === "working") return;
    setState({ kind: "working" });
    try {
      const { blob } = await buildAgentZip(world, channelId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${world.id}-${channelId}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setState({ kind: "idle" });
    } catch {
      setState({ kind: "error" });
    }
  };

  return (
    <>
      <div className="packtop">
        <div className="packtabs" role="tablist" aria-label="Channels">
          {world.channels.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              aria-selected={entry.id === channelId}
              className={entry.id === channelId ? "packtab on" : "packtab"}
              onClick={() => {
                setChannelId(entry.id);
                setState({ kind: "idle" });
              }}
              tabIndex={open ? 0 : -1}
            >
              {entry.name}
            </button>
          ))}
        </div>
        <div className="packviews" role="group" aria-label="View">
          {(["map", "files", "readiness"] as const).map((entry) => (
            <button
              key={entry}
              aria-pressed={view === entry}
              className={view === entry ? "packview on" : "packview"}
              onClick={() => chooseView(entry)}
              tabIndex={open ? 0 : -1}
            >
              {entry === "map" ? "Map" : entry === "files" ? "Files" : "Readiness"}
            </button>
          ))}
        </div>
      </div>
      <div className="packtiles" role="list" aria-label="Package summary">
        {tiles.map((tile) => (
          <Tile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            sub={tile.sub}
            made={tile.made}
            total={tile.total}
            open={open}
          />
        ))}
      </div>
      {channel && (
        <div
          className="packcard"
          aria-label={isGame ? "The game" : `The ${channel.kind}`}
        >
          <div className="packcard-head">
            <b>{isGame ? "The game" : `The ${channel.kind}`}</b>
            <span>{channel.name}</span>
          </div>
          <p className="packcard-sub">
            {channel.title || "Untitled channel"}
          </p>
          <p className="packdone">
            {channel.pitch || channel.tagline || "No pitch written yet."}
          </p>
          {isGame ? (
            <>
              <ul className="packtodo">
                {designSections.map((section) => (
                  <li key={section.label}>
                    {section.label}: {section.text ?? "Not decided yet."}{" "}
                    <Link href={designHref}>Decide on the Script page</Link>
                  </li>
                ))}
              </ul>
              <p className="packdone">
                Look: {styleLine || "No visual style chosen yet."}
              </p>
              <p className="packdone">
                Playing:{" "}
                {castNames.length > 0
                  ? castNames.join(", ")
                  : "No characters in play yet."}
              </p>
              <p className="packdone">
                Your coding agent builds this game with the studio files in
                the download.
              </p>
              <button
                className="pill"
                onClick={() => void exportZip()}
                disabled={!channelId || state.kind === "working"}
                tabIndex={open ? 0 : -1}
              >
                {state.kind === "working" ? "Exporting…" : "Export package"}
              </button>
            </>
          ) : (
            <>
              <p className="packdone">
                {rows.length === 1
                  ? "1 scene told in this channel."
                  : `${rows.length} scenes told in this channel.`}
              </p>
              <p className="packdone">
                Holds back:{" "}
                {channel.secret.trim().length > 0
                  ? channel.secret
                  : "No secret revealed yet."}
              </p>
            </>
          )}
        </div>
      )}
      {channel?.kind === "game" && (
        <p className="gamenote">
          A game agent that builds this in Godot is coming next. For now, hand
          this package to Muse Code.
        </p>
      )}
      <section hidden={view !== "map"} aria-label="Channel map">
        {graph &&
          (view === "map" ? (
            mounted ? (
              <PackageMap
                graph={graph}
                channelIndex={channelIndex}
                onOpen={openMapNode}
              />
            ) : (
              <PackageMapFallback graph={graph} />
            )
          ) : null)}
      </section>
      <section hidden={view !== "files"} aria-label="Package files">
        <Accordion
          name="Not made yet"
          made={todoMade}
          total={todoTotal}
          defaultOpen
        >
          {undoneRows.length === 0 && undoneChars.length === 0 ? (
            <p className="packdone">Everything planned is made.</p>
          ) : (
            <>
              {undoneRows.map((row) => (
                <SceneRowView key={row.partId} row={row} open={open} />
              ))}
              {undoneChars.map((row) => (
                <CharacterRowView key={row.characterId} row={row} open={open} />
              ))}
            </>
          )}
        </Accordion>
        <details className="filefold">
          <summary tabIndex={open ? 0 : -1}>
            See the files ({files.length})
          </summary>
          <div className="packtree">
            {tree.root && <div className="packroot">{tree.root}/</div>}
            {[...tree.tree.dirs.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([dir, child]) => (
                <DirNode key={dir} name={dir} node={child} open={open} depth={0} />
              ))}
            {[...tree.tree.files]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((file) => (
                <div className="packfile" key={file.name}>
                  <span className="packfile-name">{file.name}</span>
                  <span className="packfile-size">{file.size}</span>
                </div>
              ))}
          </div>
        </details>
      </section>
      <section hidden={view !== "readiness"} aria-label="Channel readiness">
        {world.channels.map((entry, index) => {
          const card = channelReadiness(world, world.id, entry.id);
          const entryRows = sceneRows(world, world.id, entry.id);
          return (
            <Accordion
              key={entry.id}
              name={entry.name}
              made={card.made}
              total={card.total}
              defaultOpen={index === 0}
            >
              {entryRows.length === 0 ? (
                <p className="packdone">No scenes planned for this channel yet.</p>
              ) : (
                entryRows.map((row) => (
                  <SceneRowView key={row.partId} row={row} open={open} />
                ))
              )}
            </Accordion>
          );
        })}
        <Accordion
          name="Character sheets"
          made={chars.flatMap((row) => row.chips).filter((chip) => chip.made).length}
          total={chars.flatMap((row) => row.chips).length}
        >
          {chars.length === 0 ? (
            <p className="packdone">No characters yet.</p>
          ) : (
            chars.map((row) => (
              <CharacterRowView key={row.characterId} row={row} open={open} />
            ))
          )}
        </Accordion>
      </section>
      {state.kind === "error" && (
        <div className="artstate" role="status">
          <p>The export failed.</p>
        </div>
      )}
      {!isGame && (
        <div style={{ marginTop: 18, textAlign: "right" }}>
          <button
            className="pill"
            onClick={() => void exportZip()}
            disabled={!channelId || state.kind === "working"}
            tabIndex={open ? 0 : -1}
          >
            {state.kind === "working" ? "Exporting…" : "Export package"}
          </button>
        </div>
      )}
    </>
  );
}
