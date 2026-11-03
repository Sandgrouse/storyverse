"use client";

import { useEffect, useMemo, useState } from "react";
import type { World } from "@/lib/world/schemas";
import {
  buildAgentZip,
  packageTree,
  planAgentFiles,
} from "@/lib/package";

type Props = {
  world: World;
  open: boolean;
  onClose: () => void;
};

type ExportState = { kind: "idle" } | { kind: "working" } | { kind: "error" };

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

  const files = useMemo(
    () => (channelId ? planAgentFiles(world, channelId) : []),
    [world, channelId],
  );
  const tree = useMemo(() => packageTree(files), [files]);

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
      <div className="castlist">
        {world.channels.map((channel) => (
          <button
            key={channel.id}
            className={channel.id === channelId ? "on" : ""}
            onClick={() => {
              setChannelId(channel.id);
              setState({ kind: "idle" });
            }}
            tabIndex={open ? 0 : -1}
          >
            {channel.name}
          </button>
        ))}
      </div>
      <div className="tree">{tree}</div>
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
