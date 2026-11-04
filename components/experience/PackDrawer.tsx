"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { World } from "@/lib/world/schemas";
import {
  buildAgentZip,
  fileSizeOf,
  formatFileSize,
  planAgentFiles,
  type PackageFile,
} from "@/lib/package";
import {
  channelReadiness,
  summaryCounts,
} from "@/lib/readiness";

type Props = {
  world: World;
  open: boolean;
  onClose: () => void;
};

type ExportState = { kind: "idle" } | { kind: "working" } | { kind: "error" };

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

export default function PackDrawer({ world, open, onClose }: Props) {
  const [channelId, setChannelId] = useState(world.channels[0]?.id ?? "");
  const [state, setState] = useState<ExportState>({ kind: "idle" });

  useEffect(() => {
    setChannelId((prev) =>
      world.channels.some((c) => c.id === prev)
        ? prev
        : (world.channels[0]?.id ?? ""),
    );
    setState({ kind: "idle" });
  }, [world]);

  const counts = useMemo(() => summaryCounts(world), [world]);
  const files = useMemo(
    () => (channelId ? planAgentFiles(world, channelId) : []),
    [world, channelId],
  );
  const tree = useMemo(() => folderTree(files), [files]);
  const channel = world.channels.find((c) => c.id === channelId);
  const readiness = useMemo(
    () => (channelId ? channelReadiness(world, world.id, channelId) : null),
    [world, channelId],
  );

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
    <div className={`drawer${open ? " on" : ""}`} aria-hidden={!open}>
      <button
        className="quiet close"
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      >
        Close
      </button>
      <div className="kicker">Agent package</div>
      <h2>Hand it to any coding agent</h2>
      <div className="packtiles" role="list" aria-label="Package summary">
        <Tile
          label="Characters"
          value={`${counts.characters}`}
          sub={`${counts.fullSheets} full sheets · ${counts.voices} voices`}
          made={counts.fullSheets}
          total={counts.characters}
          open={open}
        />
        <Tile
          label="Scenes"
          value={`${counts.scenes}`}
          sub={`${counts.coveredScenes} told`}
          made={counts.coveredScenes}
          total={counts.scenes}
          open={open}
        />
        <Tile
          label="Scripts written"
          value={`${counts.scriptsWritten}`}
          sub={`of ${counts.plannedPairs} planned`}
          made={counts.scriptsWritten}
          total={counts.plannedPairs}
          open={open}
        />
        <Tile
          label="Storyboards"
          value={`${counts.storyboards}`}
          sub={`of ${counts.plannedPairs} planned`}
          made={counts.storyboards}
          total={counts.plannedPairs}
          open={open}
        />
        <Tile
          label="Scene art"
          value={`${counts.sceneArt}`}
          sub={`of ${counts.scenes} scenes`}
          made={counts.sceneArt}
          total={counts.scenes}
          open={open}
        />
        <Tile
          label="Videos"
          value={`${counts.videos}`}
          sub={`of ${counts.plannedPairs} planned`}
          made={counts.videos}
          total={counts.plannedPairs}
          open={open}
        />
        <Tile
          label="Secrets kept apart"
          value={`${counts.secretsKeptApart}`}
          sub={`of ${counts.secretsTotal} secrets`}
          made={counts.secretsKeptApart}
          total={counts.secretsTotal}
          open={open}
        />
      </div>
      <div className="packchannels">
        {world.channels.map((entry) => {
          const card = channelReadiness(world, world.id, entry.id);
          const undone = card.items.filter((item) => !item.done);
          const pct = Math.round(ratio(card.made, card.total) * 100);
          return (
            <div key={entry.id} className="packcard">
              <div className="packcard-head">
                <b>{entry.name}</b>
                <span>
                  {card.made} of {card.total} made
                </span>
              </div>
              <span
                className="packbar"
                role="progressbar"
                aria-label={`${entry.name} readiness`}
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${pct}%` }} />
              </span>
              {undone.length > 0 ? (
                <>
                  <div className="packcard-sub">Not made yet</div>
                  <ul className="packtodo">
                    {undone.map((item) => (
                      <li key={`${item.kind}-${item.label}`}>
                        <Link
                          href={item.href}
                          tabIndex={open ? 0 : -1}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="packdone">Everything planned is made.</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="castlist">
        {world.channels.map((entry) => (
          <button
            key={entry.id}
            className={entry.id === channelId ? "on" : ""}
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
      {channel?.kind === "game" && (
        <p className="gamenote">
          A game agent that builds this in Godot is coming next. For now, hand
          this package to Muse Code.
        </p>
      )}
      {readiness && (
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
      )}
      {state.kind === "error" && (
        <div className="artstate" role="status">
          <p>The export failed.</p>
        </div>
      )}
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
    </div>
  );
}
