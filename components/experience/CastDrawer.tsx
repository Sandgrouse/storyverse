"use client";

import { useMemo, useState } from "react";
import type { Character, World } from "@/lib/world/schemas";

type Props = {
  world: World;
  open: boolean;
  onClose: () => void;
};

export default function CastDrawer({ world, open, onClose }: Props) {
  const [selectedId, setSelectedId] = useState(world.characters[0]?.id);
  const selected: Character | undefined =
    world.characters.find((c) => c.id === selectedId) ?? world.characters[0];

  const appearsIn = useMemo(() => {
    if (!selected) return "";
    return world.beats
      .filter((b) => b.characterIds.includes(selected.id))
      .map((b) => {
        const channel = world.channels.find((c) => c.id === b.channelId);
        return `${channel?.name ?? ""} ${b.unitLabel}`.trim();
      })
      .join("; ");
  }, [world, selected]);

  const figures = world.characters.filter((c) => c.artPath);

  return (
    <div className={`drawer${open ? " on" : ""}`} aria-hidden={!open}>
      <button
        className="quiet close"
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      >
        Close
      </button>
      <div className="kicker">Characters</div>
      <h2>{selected?.name ?? ""}</h2>
      <div className="castlist">
        {world.characters.map((c) => (
          <button
            key={c.id}
            className={c.id === selected?.id ? "on" : ""}
            onClick={() => setSelectedId(c.id)}
            tabIndex={open ? 0 : -1}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="who">
        {figures.map((c) => (
          <div
            key={c.id}
            className="fig"
            style={{ backgroundImage: `url(${c.artPath})` }}
            role="img"
            aria-label={c.name}
          />
        ))}
        <div className="txt">
          <small>Canon</small>
          <p>{selected?.canon ?? ""}</p>
          {selected?.secret && (
            <>
              <small>Secret</small>
              <p>{selected.secret}</p>
            </>
          )}
          <small>Appears in</small>
          <p>{appearsIn}</p>
          <button className="pill" tabIndex={open ? 0 : -1}>
            Generate full sheet
          </button>
        </div>
      </div>
    </div>
  );
}
