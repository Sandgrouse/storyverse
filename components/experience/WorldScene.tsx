"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { RippleFix, SecretUpdate, World } from "@/lib/world/schemas";
import { RippleResultSchema } from "@/lib/world/schemas";
import CastDrawer from "./CastDrawer";
import PackDrawer from "./PackDrawer";

const KIND_COLORS: Record<string, string> = {
  series: "var(--series)",
  game: "var(--game)",
  shorts: "var(--shorts)",
};

function channelColor(kind: string) {
  return KIND_COLORS[kind] ?? "#6f675a";
}

type Props = {
  active: boolean;
  world: World;
  onSecrets: (updates: SecretUpdate[]) => void;
};

export default function WorldScene({ active, world, onSecrets }: Props) {
  const parts = useMemo(
    () => [...world.parts].sort((a, b) => a.order - b.order),
    [world],
  );
  const [partId, setPartId] = useState(parts[2]?.id ?? parts[0]?.id);
  const part = parts.find((p) => p.id === partId) ?? parts[0];
  const [bookOpen, setBookOpen] = useState(false);
  const [drawer, setDrawer] = useState<"cast" | "pack" | null>(null);

  const [ask, setAsk] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/ripple", { method: "POST" })
      .then((res) => res.json())
      .then((json) => {
        if (!live) return;
        const parsed = RippleResultSchema.safeParse(json);
        if (parsed.success) setAsk(parsed.data.change);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const [ripple, setRipple] = useState(false);
  const [changeText, setChangeText] = useState("");
  const [fixes, setFixes] = useState<RippleFix[]>([]);
  const [visible, setVisible] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<string, "applied" | "kept">>({});
  const [cracks, setCracks] = useState<string[]>([]);
  const [verdict, setVerdict] = useState("");

  const shelfRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  const beatsHere = (channelId: string, pid: string) =>
    world.beats.some((b) => b.channelId === channelId && b.partId === pid);

  const fixFor = (channelId: string, pid: string) =>
    fixes.find((f) => f.channelId === channelId && f.partId === pid);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const drawCrack = (fromKey: string, toKey: string) => {
    const shelf = shelfRef.current;
    if (!shelf) return;
    const a = shelf.querySelector(`[data-key="${fromKey}"]`);
    const b = shelf.querySelector(`[data-key="${toKey}"]`);
    if (!(a instanceof HTMLElement) || !(b instanceof HTMLElement)) return;
    const R = shelf.getBoundingClientRect();
    const A = a.getBoundingClientRect();
    const B = b.getBoundingClientRect();
    const x1 = A.left + A.width / 2 - R.left;
    const y1 = A.top + A.height / 2 - R.top;
    const x2 = B.left + B.width / 2 - R.left;
    const y2 = B.top + B.height / 2 - R.top;
    let d = `M${x1} ${y1}`;
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      d += ` L${x1 + (x2 - x1) * t + (i % 2 ? 6 : -6)} ${y1 + (y2 - y1) * t + (i % 2 ? -10 : 10)}`;
    }
    d += ` L${x2} ${y2}`;
    setCracks((prev) => [...prev, d]);
  };

  const followChange = async (e: React.FormEvent) => {
    e.preventDefault();
    clearTimers();
    setRipple(true);
    setBookOpen(false);
    setFixes([]);
    setVisible([]);
    setDecisions({});
    setCracks([]);
    setChangeText(`\u201C${ask}\u201D`);
    setVerdict("Reading every channel against the change…");
    const res = await fetch("/api/ripple", { method: "POST" });
    const result = RippleResultSchema.parse(await res.json());
    onSecrets(result.secretUpdates);
    const ordered = [...result.fixes];
    setFixes(ordered);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const gap = reduced ? 120 : 800;
    const start = reduced ? 150 : 1100;
    const origin = `${ordered[0].channelId}:${ordered[0].partId}`;
    ordered.forEach((fix, i) => {
      timers.current.push(
        window.setTimeout(() => {
          if (i > 0) drawCrack(origin, `${fix.channelId}:${fix.partId}`);
          setVisible((prev) => [...prev, fix.id]);
          if (i === ordered.length - 1) {
            setVerdict(
              `${ordered.length} scenes affected. Nothing changes until you say so.`,
            );
          }
        }, start + i * gap),
      );
    });
  };

  const decide = (fix: RippleFix, decision: "applied" | "kept") => {
    const next = { ...decisions, [fix.id]: decision };
    setDecisions(next);
    const remaining = fixes.length - Object.keys(next).length;
    setVerdict(
      remaining > 0
        ? `${remaining} left to decide. Nothing changes until you say so.`
        : "Checked again. All channels agree with the new canon.",
    );
  };

  const settled = fixes.length > 0 && Object.keys(decisions).length === fixes.length;

  const toldIn = useMemo(() => {
    const ids = new Set(
      world.beats.filter((b) => b.partId === part.id).map((b) => b.channelId),
    );
    return world.channels
      .filter((c) => ids.has(c.id))
      .map((c) => c.name)
      .join(" and ");
  }, [world, part]);

  const whosHere = useMemo(
    () =>
      part.characterIds
        .map((id) => world.characters.find((c) => c.id === id)?.name)
        .filter(Boolean)
        .join(", "),
    [world, part],
  );

  const channelOf = (fix: RippleFix) =>
    world.channels.find((c) => c.id === fix.channelId);
  const beatOf = (fix: RippleFix) =>
    world.beats.find((b) => b.id === fix.beatId);

  return (
    <section
      className={`scene${active ? " on" : ""}${ripple ? " ripple" : ""}`}
      id="world"
      style={{ "--tint": part.tint } as React.CSSProperties}
    >
      <div
        className="artwash"
        style={{ backgroundImage: `url(${part.imagePath})` }}
      />
      <div className="logo">{world.title}</div>
      <nav className="nav" aria-label="Sections">
        <button
          className={drawer === null ? "on" : ""}
          onClick={() => setDrawer(null)}
        >
          Story
        </button>
        <button
          className={drawer === "cast" ? "on" : ""}
          onClick={() => setDrawer("cast")}
        >
          Characters
        </button>
        <button
          className={drawer === "pack" ? "on" : ""}
          onClick={() => setDrawer("pack")}
        >
          Agent package
        </button>
      </nav>
      <div className="headline">
        <div className="kicker">The change</div>
        <h2>{changeText}</h2>
      </div>

      <div className="desk">
        <div className="about">
          <div className="kicker">
            Part {part.order} of {parts.length}
          </div>
          <h2>{part.title}</h2>
          <p>{part.summary}</p>
          <div className="facts">
            <div>
              <b>{toldIn}</b>Told in
            </div>
            <div>
              <b>{whosHere}</b>Who&rsquo;s here
            </div>
          </div>
        </div>
        <div className="side">
          <button onClick={() => setDrawer("pack")}>Story Pack</button>
          <button>Send to video</button>
          <button onClick={() => setBookOpen((v) => !v)}>Open</button>
        </div>
      </div>
      <button
        className={`book${bookOpen ? " open" : ""}`}
        aria-label={bookOpen ? "Close this part" : "Open this part"}
        onClick={() => setBookOpen((v) => !v)}
      >
        <div className="inside">
          <b>{part.title}</b>
          {part.excerpt}
        </div>
        <div
          className="cover"
          style={{ backgroundImage: `url(${part.imagePath})` }}
        >
          <span>{part.title}</span>
          <small>{world.title}</small>
        </div>
      </button>

      <div className="shelf" id="shelf" ref={shelfRef}>
        <div />
        {parts.map((p) => {
          const hit = visible
            .map((id) => fixes.find((f) => f.id === id))
            .filter((f): f is RippleFix => !!f && f.partId === p.id);
          const undecided = hit.some((f) => !decisions[f.id]);
          const allApplied =
            hit.length > 0 && hit.every((f) => decisions[f.id] === "applied");
          return (
            <button
              key={p.id}
              className={`tome${p.id === part.id ? " on" : ""}${undecided ? " hit" : ""}${allApplied ? " healed" : ""}`}
              onClick={() => {
                setPartId(p.id);
                setBookOpen(false);
              }}
              aria-label={`Part ${p.order}: ${p.title}`}
            >
              <div
                className="thumb"
                style={{ backgroundImage: `url(${p.imagePath})` }}
              />
              <div className="label">
                <b>{p.title}</b>
                <small>Part {p.order}</small>
              </div>
              <span className="stamp">{allApplied ? "Fixed" : "Breaks"}</span>
            </button>
          );
        })}
        {world.channels.map((channel) => (
          <Fragment key={`lane-${channel.id}`}>
            <div
              className="lane"
              style={{ color: channelColor(channel.kind) }}
            >
              {channel.name}
            </div>
            {parts.map((p) => {
              const fix = fixFor(channel.id, p.id);
              const shown = fix ? visible.includes(fix.id) : false;
              const decided = fix ? decisions[fix.id] : undefined;
              const dotState =
                shown && decided === "applied"
                  ? " healed"
                  : shown && !decided
                    ? " hit"
                    : "";
              return (
                <div
                  key={`seg-${channel.id}-${p.id}`}
                  className="seg"
                  style={{ "--c": channelColor(channel.kind) } as React.CSSProperties}
                >
                  {beatsHere(channel.id, p.id) && (
                    <div
                      className={`dot${dotState}`}
                      data-key={`${channel.id}:${p.id}`}
                    />
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
        {cracks.length > 0 && (
          <svg className="crack" aria-hidden="true">
            {cracks.map((d, i) => (
              <path key={i} d={d} pathLength={1} />
            ))}
          </svg>
        )}
      </div>

      <form className="ask" onSubmit={followChange}>
        <input
          aria-label="Change the story"
          placeholder="What if…"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          autoComplete="off"
        />
        <button type="submit">Follow the change</button>
      </form>

      <aside className="panel" aria-label="What breaks">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {fixes
            .filter((f) => visible.includes(f.id))
            .map((fix) => {
              const channel = channelOf(fix);
              const beat = beatOf(fix);
              const decision = decisions[fix.id];
              return (
                <article
                  key={fix.id}
                  className={`fix in${decision === "applied" ? " done" : ""}${decision === "kept" ? " kept" : ""}`}
                >
                  <small style={{ color: channel ? channelColor(channel.kind) : undefined }}>
                    {channel?.name ?? ""}
                    {beat ? ` · ${beat.unitLabel}` : ""}
                  </small>
                  <h3>{fix.title}</h3>
                  <p>{fix.problem}</p>
                  <p style={{ marginTop: 5 }}>
                    <b>Fix:</b> {fix.proposal}
                  </p>
                  <div className="acts">
                    <button className="yes" onClick={() => decide(fix, "applied")}>
                      Apply
                    </button>
                    <button className="no" onClick={() => decide(fix, "kept")}>
                      Keep as is
                    </button>
                  </div>
                  <div className="state">{fix.appliedMessage}</div>
                </article>
              );
            })}
        </div>
        <div className="verdict">
          <p>{verdict}</p>
          <button
            className={`pill${settled ? " show" : ""}`}
            onClick={() => {
              clearTimers();
              setRipple(false);
              setFixes([]);
              setVisible([]);
              setDecisions({});
              setCracks([]);
              setVerdict("");
            }}
          >
            Back to my story
          </button>
        </div>
      </aside>

      <CastDrawer world={world} open={drawer === "cast"} onClose={() => setDrawer(null)} />
      <PackDrawer world={world} open={drawer === "pack"} onClose={() => setDrawer(null)} />
    </section>
  );
}
