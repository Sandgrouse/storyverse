"use client";

import { useState } from "react";
import type { World } from "@/lib/world/schemas";

type Props = {
  active: boolean;
  world: World;
  onBack: () => void;
  onOpen: () => void;
};

export default function UnderstoodScene({ active, world, onBack, onOpen }: Props) {
  const [handled, setHandled] = useState<string[]>([]);
  const plate = world.channels[0]?.imagePath;

  return (
    <section className={`scene${active ? " on" : ""}`} id="understood">
      <div className="spread">
        <div className="pg">
          <div
            className="plate"
            style={plate ? { backgroundImage: `url(${plate})` } : undefined}
          />
          <p className="logline">{world.logline}</p>
        </div>
        <div className="pg">
          <div className="kicker">Here&rsquo;s what I understood</div>
          <h2>Your story, so far</h2>
          <div className="names">
            {world.characters.map((c) => (
              <span key={c.id}>{c.name}</span>
            ))}
            {world.locations.map((l) => (
              <span key={l.id}>{l.name}</span>
            ))}
          </div>
          {world.gaps.map((gap) => (
            <div className="gq" key={gap.id}>
              <div className="kicker" style={{ margin: 0 }}>
                A gap
              </div>
              <p>{gap.question}</p>
              {handled.includes(gap.id) ? (
                <div>
                  <span className="handled">Handled</span>
                </div>
              ) : (
                <div>
                  <button
                    className="quiet"
                    onClick={() =>
                      setHandled((prev) => [...prev, gap.id])
                    }
                  >
                    Answer now
                  </button>
                  <button
                    className="quiet"
                    onClick={() =>
                      setHandled((prev) => [...prev, gap.id])
                    }
                  >
                    Keep it a secret
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="rings" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="foot">
        <button className="quiet" onClick={onBack}>
          Add more material
        </button>
        <button className="pill" onClick={onOpen}>
          That&rsquo;s my story
        </button>
      </div>
    </section>
  );
}
