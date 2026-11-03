"use client";

import { useState } from "react";
import type { World } from "@/lib/world/schemas";

const SHEET_VIEWS = [
  "Front",
  "Left",
  "Right",
  "Back",
  "Pose: running",
  "Pose: crouching",
];

export default function CharactersView({ world }: { world: World }) {
  const [selectedId, setSelectedId] = useState(world.characters[0]?.id ?? "");
  const character =
    world.characters.find((c) => c.id === selectedId) ?? world.characters[0];
  const usedIn = world.beats
    .filter((b) => b.characterIds.includes(character.id))
    .sort((a, b) => a.order - b.order)
    .map((b) => b.unitLabel);

  return (
    <div className="view">
      <div className="page">
        <div className="eyebrow">Character sheet · muse-image-1.0</div>
        <h1>{character.name}</h1>
        <div className="who" role="group" aria-label="Character">
          {world.characters.map((c) => (
            <button
              key={c.id}
              aria-pressed={c.id === character.id}
              onClick={() => setSelectedId(c.id)}
            >
              {c.name}
            </button>
          ))}
          <button aria-pressed="false" disabled title="Coming in a later task">
            + New character
          </button>
        </div>
        <div className="sheet">
          {SHEET_VIEWS.map((view) => (
            <div key={view} className="shot">
              <div className="fig">image</div>
              <span>{view}</span>
            </div>
          ))}
        </div>
        <div className="facts">
          <div className="fact">
            <div className="eyebrow">Canon</div>
            <p>{character.canon}</p>
          </div>
          <div className="fact">
            <div className="eyebrow">Secret</div>
            <p>{character.secret ?? "None recorded."}</p>
          </div>
          <div className="fact">
            <div className="eyebrow">Used in</div>
            <p>{usedIn.length > 0 ? usedIn.join(", ") : "No beats yet."}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
