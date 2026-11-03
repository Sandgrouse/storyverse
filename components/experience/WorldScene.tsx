"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { RippleFix, RippleFixKind, World } from "@/lib/world/schemas";
import { RippleResultSchema } from "@/lib/world/schemas";
import { ApplyResponseSchema, CheckResponseSchema } from "@/lib/ripple";
import CastDrawer from "./CastDrawer";
import PackDrawer from "./PackDrawer";

const KIND_COLORS: Record<string, string> = {
  series: "var(--series)",
  game: "var(--game)",
  shorts: "var(--shorts)",
};

const KIND_LABEL: Record<RippleFixKind, string> = {
  contradiction: "Now false",
  meaning: "Reads differently",
  setup: "Needs a clue",
};

const WAITING_STEPS = [
  "Reading every channel",
  "Checking each secret",
  "Looking for what breaks",
];

const DEFAULT_CHANGE = "Enyinyi told them how to kill him.";

// Where Anukili's face sits in the current art, so cropped surfaces
// (the wash, the covers, the shelf) keep framing him. His portrait is a
// tall frame with his face top-center; the stream scene is wide with him
// standing left-of-center. Other art keeps its CSS default.
function facePosition(imagePath: string): string | undefined {
  if (imagePath.endsWith("/anukili.webp")) return "50% 0%";
  if (imagePath.endsWith("/hippo.webp")) return "32% 32%";
  return undefined;
}

function channelColor(kind: string) {
  return KIND_COLORS[kind] ?? "#6f675a";
}

type Decision = "applied" | "kept";

type Props = {
  active: boolean;
  world: World;
  onWorld: (world: World) => void;
};

export default function WorldScene({ active, world, onWorld }: Props) {
  const [liveWorld, setLiveWorld] = useState<World>(world);
  const parts = [...liveWorld.parts].sort((a, b) => a.order - b.order);
  const [partId, setPartId] = useState(parts[2]?.id ?? parts[0]?.id);
  const part = parts.find((p) => p.id === partId) ?? parts[0];
  const [bookOpen, setBookOpen] = useState(false);
  const [drawer, setDrawer] = useState<"cast" | "pack" | null>(null);

  const [ask, setAsk] = useState(DEFAULT_CHANGE);
  const [change, setChange] = useState("");
  const [phase, setPhase] = useState<"idle" | "waiting" | "done" | "error">(
    "idle",
  );
  const [ripple, setRipple] = useState(false);
  const [changeText, setChangeText] = useState("");
  const [fixes, setFixes] = useState<RippleFix[]>([]);
  const [visible, setVisible] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [cracks, setCracks] = useState<string[]>([]);
  const [verdict, setVerdict] = useState("");
  const [failure, setFailure] = useState("");
  const [sample, setSample] = useState(false);
  const [applyState, setApplyState] = useState<Record<string, "working" | "error">>({});
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);

  const shelfRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const requestId = useRef(0);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const beatsHere = (channelId: string, pid: string) =>
    liveWorld.beats.some((b) => b.channelId === channelId && b.partId === pid);

  const cellFixes = (channelId: string, pid: string) =>
    fixes.filter((f) => f.channelId === channelId && f.partId === pid);

  const partFixes = (pid: string) =>
    visible
      .map((id) => fixes.find((f) => f.id === id))
      .filter((f): f is RippleFix => !!f && f.partId === pid);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const drawCrack = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
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

  const runCheck = async (decidedChange: string, nextWorld: World) => {
    setChecking(true);
    setCheckFailed(false);
    setVerdict("Checking the new canon…");
    try {
      const res = await fetch("/api/ripple/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ change: decidedChange, world: nextWorld }),
      });
      if (!res.ok) throw new Error(`check failed: ${res.status}`);
      const json = CheckResponseSchema.parse(await res.json());
      if (json.sample) setSample(true);
      setVerdict(json.note);
    } catch {
      setCheckFailed(true);
      setVerdict("Could not check the new canon.");
    } finally {
      setChecking(false);
    }
  };

  const followChange = async (e?: React.FormEvent, retryChange?: string) => {
    e?.preventDefault();
    const nextChange = (retryChange ?? ask).trim();
    if (!nextChange || phase === "waiting") return;
    const id = requestId.current + 1;
    requestId.current = id;
    clearTimers();
    setRipple(true);
    setBookOpen(false);
    setPhase("waiting");
    setFailure("");
    setFixes([]);
    setVisible([]);
    setDecisions({});
    setCracks([]);
    setSample(false);
    setApplyState({});
    setCheckFailed(false);
    setChange(nextChange);
    setChangeText(`\u201C${nextChange}\u201D`);
    setVerdict(WAITING_STEPS[0]);
    timers.current.push(
      window.setTimeout(() => {
        if (requestId.current === id) setVerdict(WAITING_STEPS[1]);
      }, 8000),
      window.setTimeout(() => {
        if (requestId.current === id) setVerdict(WAITING_STEPS[2]);
      }, 16000),
    );
    try {
      const res = await fetch("/api/ripple", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ change: nextChange, world: liveWorld }),
      });
      if (requestId.current !== id) return;
      if (!res.ok) throw new Error(`ripple failed: ${res.status}`);
      const result = RippleResultSchema.parse(await res.json());
      clearTimers();
      if (requestId.current !== id) return;
      setSample(!!result.sample);
      setFixes(result.fixes);
      setPhase("done");
      if (result.fixes.length === 0) {
        setVerdict("Nothing breaks. This fits your story.");
        return;
      }
      const ordered = [...result.fixes];
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const gap = reduced ? 120 : 800;
      const start = reduced ? 150 : 1100;
      const origin = `${ordered[0].channelId}:${ordered[0].partId}`;
      setVerdict("");
      ordered.forEach((fix, i) => {
        timers.current.push(
          window.setTimeout(() => {
            if (requestId.current !== id) return;
            if (i > 0) drawCrack(origin, `${fix.channelId}:${fix.partId}`);
            setVisible((prev) => [...prev, fix.id]);
            if (i === ordered.length - 1) {
              setVerdict(
                `${ordered.length} ${ordered.length === 1 ? "scene" : "scenes"} affected. Nothing changes until you say so.`,
              );
            }
          }, start + i * gap),
        );
      });
    } catch {
      if (requestId.current !== id) return;
      clearTimers();
      setPhase("error");
      setFailure("The ripple failed. Try again.");
      setVerdict("");
    }
  };

  const applyFix = async (fix: RippleFix) => {
    setApplyState((prev) => ({ ...prev, [fix.id]: "working" }));
    try {
      const res = await fetch("/api/ripple/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ change, fix, world: liveWorld }),
      });
      if (!res.ok) throw new Error(`apply failed: ${res.status}`);
      const json = ApplyResponseSchema.parse(await res.json());
      if (json.sample) setSample(true);
      const nextWorld: World = {
        ...liveWorld,
        beats: liveWorld.beats.map((b) =>
          b.id === fix.beatId ? { ...b, content: json.content } : b,
        ),
      };
      setLiveWorld(nextWorld);
      onWorld(nextWorld);
      setApplyState((prev) => {
        const next = { ...prev };
        delete next[fix.id];
        return next;
      });
      const next = { ...decisions, [fix.id]: "applied" as Decision };
      setDecisions(next);
      if (Object.keys(next).length === fixes.length) {
        void runCheck(change, nextWorld);
      } else {
        const remaining = fixes.length - Object.keys(next).length;
        setVerdict(
          `${remaining} left to decide. Nothing changes until you say so.`,
        );
      }
    } catch {
      setApplyState((prev) => ({ ...prev, [fix.id]: "error" }));
    }
  };

  const keepFix = (fix: RippleFix) => {
    if (decisions[fix.id]) return;
    const next = { ...decisions, [fix.id]: "kept" as Decision };
    setDecisions(next);
    if (Object.keys(next).length === fixes.length) {
      void runCheck(change, liveWorld);
    } else {
      const remaining = fixes.length - Object.keys(next).length;
      setVerdict(
        `${remaining} left to decide. Nothing changes until you say so.`,
      );
    }
  };

  const backToStory = () => {
    requestId.current += 1;
    clearTimers();
    setRipple(false);
    setPhase("idle");
    setFixes([]);
    setVisible([]);
    setDecisions({});
    setCracks([]);
    setVerdict("");
    setFailure("");
    setChecking(false);
    setCheckFailed(false);
  };

  const settled = fixes.length > 0 && Object.keys(decisions).length === fixes.length;
  const showBack =
    phase === "error" || (phase === "done" && (fixes.length === 0 || settled));

  const toldIn = (() => {
    const ids = new Set(
      liveWorld.beats.filter((b) => b.partId === part.id).map((b) => b.channelId),
    );
    return liveWorld.channels
      .filter((c) => ids.has(c.id))
      .map((c) => c.name)
      .join(" and ");
  })();

  const whosHere = part.characterIds
    .map((id) => liveWorld.characters.find((c) => c.id === id)?.name)
    .filter(Boolean)
    .join(", ");

  const channelOf = (fix: RippleFix) =>
    liveWorld.channels.find((c) => c.id === fix.channelId);
  const beatOf = (fix: RippleFix) =>
    liveWorld.beats.find((b) => b.id === fix.beatId);

  const appliedLine = (fix: RippleFix) => {
    const channel = channelOf(fix);
    if (fix.regeneratesImage) return "Image update next";
    return `Fixed in ${channel?.name ?? "story"} · ${KIND_LABEL[fix.kind]}`;
  };

  return (
    <section
      className={`scene${active ? " on" : ""}${ripple ? " ripple" : ""}`}
      id="world"
      style={{ "--tint": part.tint } as React.CSSProperties}
    >
      <div
        className="artwash"
        style={{
          backgroundImage: `url(${part.imagePath})`,
          backgroundPosition: facePosition(part.imagePath),
        }}
      />
      <div className="logo">{liveWorld.title}</div>
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
          style={{
            backgroundImage: `url(${part.imagePath})`,
            backgroundPosition: facePosition(part.imagePath),
          }}
        >
          <span>{part.title}</span>
          <small>{liveWorld.title}</small>
        </div>
      </button>

      <div className="shelf" id="shelf" ref={shelfRef}>
        <div />
        {parts.map((p) => {
          const hit = partFixes(p.id);
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
                style={{
                  backgroundImage: `url(${p.imagePath})`,
                  backgroundPosition: facePosition(p.imagePath),
                }}
              />
              <div className="label">
                <b>{p.title}</b>
                <small>Part {p.order}</small>
              </div>
              <span className="stamp">{allApplied ? "Fixed" : "Breaks"}</span>
            </button>
          );
        })}
        {liveWorld.channels.map((channel) => (
          <Fragment key={`lane-${channel.id}`}>
            <div
              className="lane"
              style={{ color: channelColor(channel.kind) }}
            >
              {channel.name}
            </div>
            {parts.map((p) => {
              const cell = cellFixes(channel.id, p.id);
              const shown = cell.filter((f) => visible.includes(f.id));
              const decided = (f: RippleFix) => decisions[f.id];
              const dotState =
                shown.length > 0 && shown.every((f) => decided(f) === "applied")
                  ? " healed"
                  : shown.some((f) => !decided(f))
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

      <form className="ask" onSubmit={(e) => void followChange(e)}>
        <input
          aria-label="Change the story"
          placeholder="What if…"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" disabled={phase === "waiting"}>
          Follow the change
        </button>
      </form>

      <aside className="panel" aria-label="What breaks">
        {sample && ripple && (
          <div style={{ fontSize: 11, color: "#8d8678" }}>Sample result</div>
        )}
        {phase === "error" && (
          <div className="fix in">
            <h3>Something broke</h3>
            <p>{failure}</p>
            <div className="acts">
              <button
                type="button"
                className="yes"
                onClick={() => void followChange(undefined, change || ask)}
              >
                Retry
              </button>
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {fixes
            .filter((f) => visible.includes(f.id))
            .map((fix) => {
              const channel = channelOf(fix);
              const beat = beatOf(fix);
              const decision = decisions[fix.id];
              const working = applyState[fix.id] === "working";
              const applyFailed = applyState[fix.id] === "error";
              return (
                <article
                  key={fix.id}
                  className={`fix in${decision === "applied" ? " done" : ""}${decision === "kept" ? " kept" : ""}`}
                >
                  <small style={{ color: channel ? channelColor(channel.kind) : undefined }}>
                    {channel?.name ?? ""}
                    {beat ? ` · ${beat.unitLabel}` : ""}
                  </small>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    {KIND_LABEL[fix.kind]}
                  </div>
                  <h3>{fix.title}</h3>
                  <p>{fix.problem}</p>
                  <p style={{ marginTop: 5 }}>
                    <b>Fix:</b> {fix.proposal}
                  </p>
                  {!decision && (
                    <div className="acts">
                      <button
                        type="button"
                        className="yes"
                        disabled={working}
                        onClick={() => void applyFix(fix)}
                      >
                        {working
                          ? "Applying…"
                          : applyFailed
                            ? "Retry"
                            : "Apply"}
                      </button>
                      <button
                        type="button"
                        className="no"
                        disabled={working}
                        onClick={() => keepFix(fix)}
                      >
                        Keep as is
                      </button>
                    </div>
                  )}
                  {decision === "applied" && (
                    <div className="state">{appliedLine(fix)}</div>
                  )}
                </article>
              );
            })}
        </div>
        <div className="verdict">
          <p>{verdict}</p>
          {checkFailed && (
            <button
              type="button"
              className="pill show"
              onClick={() => void runCheck(change, liveWorld)}
              disabled={checking}
            >
              {checking ? "Checking…" : "Check again"}
            </button>
          )}
          <button
            className={`pill${showBack ? " show" : ""}`}
            onClick={backToStory}
          >
            Back to my story
          </button>
        </div>
      </aside>

      <CastDrawer world={liveWorld} open={drawer === "cast"} onClose={() => setDrawer(null)} />
      <PackDrawer world={liveWorld} open={drawer === "pack"} onClose={() => setDrawer(null)} />
    </section>
  );
}
