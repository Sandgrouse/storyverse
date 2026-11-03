"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { World } from "@/lib/world/schemas";

const STATUS = [
  "Finding the people…",
  "Finding the people…",
  "Finding the places…",
  "Looking for gaps…",
];

const BUST_SPOTS = [
  { left: "2%", top: "0", r: "-4deg" },
  { left: "50%", top: "5%", r: "3deg" },
  { left: "12%", top: "44%", r: "2.5deg" },
  { left: "58%", top: "50%", r: "-3deg" },
];

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Props = {
  active: boolean;
  world: World;
  onDone: () => void;
};

export default function ReadingScene({ active, world, onDone }: Props) {
  const [wave, setWave] = useState(-1);
  const done = useRef(false);

  const names = useMemo(() => {
    const all = [
      ...world.characters.map((c) => c.name),
      ...world.locations.map((l) => l.name),
    ];
    return all.sort((a, b) => b.length - a.length);
  }, [world]);

  const passage = useMemo(
    () => world.parts.map((p) => `${p.summary} ${p.excerpt}`).join(" "),
    [world],
  );

  const segments = useMemo(() => {
    if (names.length === 0) return [passage];
    const pattern = new RegExp(`(${names.map(escapeRegExp).join("|")})`, "g");
    return passage.split(pattern);
  }, [passage, names]);

  const hits = useMemo(
    () => segments.filter((s) => names.includes(s)),
    [segments, names],
  );

  const busts = useMemo(
    () => world.characters.filter((c) => c.artPath),
    [world],
  );

  useEffect(() => {
    if (!active || done.current) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const step = reduced ? 250 : 1250;
    const start = reduced ? 200 : 700;
    const timers: number[] = [];
    const waves = STATUS.length;
    for (let i = 0; i < waves; i++) {
      timers.push(window.setTimeout(() => setWave(i), start + i * step));
    }
    timers.push(
      window.setTimeout(
        () => {
          done.current = true;
          onDone();
        },
        start + waves * step + (reduced ? 200 : 800),
      ),
    );
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [active, onDone]);

  const litThrough =
    wave < 0 ? -1 : Math.ceil(hits.length * ((wave + 1) / STATUS.length)) - 1;
  let seen = -1;

  return (
    <section className={`scene${active ? " on" : ""}`} id="reading">
      <article className="leaf" aria-label="The treatment being read">
        {segments.map((seg, i) =>
          names.includes(seg) ? (
            (() => {
              seen += 1;
              const lit = seen <= litThrough;
              return (
                <em key={i} className={lit ? "lit" : ""}>
                  {seg}
                </em>
              );
            })()
          ) : (
            <span key={i}>{seg}</span>
          ),
        )}
      </article>
      <div className="stack">
        {busts.map((bust, i) => {
          const spot = BUST_SPOTS[i % BUST_SPOTS.length];
          return (
            <div
              key={bust.id}
              className={`bust${wave >= i ? " on" : ""}`}
              style={
                {
                  "--r": spot.r,
                  left: spot.left,
                  top: spot.top,
                  backgroundImage: `url(${bust.artPath})`,
                } as React.CSSProperties
              }
            >
              <span>{bust.name}</span>
            </div>
          );
        })}
      </div>
      <p className="status">{wave < 0 ? "Reading the treatment" : STATUS[Math.min(wave, STATUS.length - 1)]}</p>
    </section>
  );
}
