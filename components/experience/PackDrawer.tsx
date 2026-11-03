"use client";

import { useMemo } from "react";
import type { World } from "@/lib/world/schemas";

type Props = {
  world: World;
  open: boolean;
  onClose: () => void;
};

export default function PackDrawer({ world, open, onClose }: Props) {
  const tree = useMemo(() => {
    const game =
      world.channels.find((c) => c.kind === "game") ?? world.channels[0];
    const gameKnown = world.secrets.filter((s) =>
      game ? s.knownThrough.includes(game.id) : false,
    );
    const rest = world.secrets.filter(
      (s) => !(game && s.knownThrough.includes(game.id)),
    );
    const brief =
      gameKnown.length > 0
        ? `Players may learn ${gameKnown.map((s) => s.text).join("; ")}. They may not learn ${rest.map((s) => s.text).join("; ")}.`
        : `They may not learn ${rest.map((s) => s.text).join("; ")}.`;
    const gameBeats = game
      ? world.beats.filter((b) => b.channelId === game.id)
      : [];
    const lines = [
      `${world.id}-game/`,
      `├─ AGENT_BRIEF.md       ${brief}`,
      "├─ manifest.json",
      "├─ canon/               world, timeline, and secrets for this channel only",
      "├─ characters/",
    ];
    world.characters.forEach((c) => {
      lines.push(`│  └─ ${c.id}/    sheet views, plus cutouts`);
    });
    lines.push("└─ levels/");
    gameBeats.forEach((b, i) => {
      lines.push(
        `   ${i === gameBeats.length - 1 ? "└" : "├"}─ ${b.id}.md`,
      );
    });
    return lines.join("\n");
  }, [world]);

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
      <div className="tree">{tree}</div>
      <div style={{ marginTop: 18, textAlign: "right" }}>
        <button className="pill" tabIndex={open ? 0 : -1}>
          Export package
        </button>
      </div>
    </div>
  );
}
