"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type {
  Beat,
  FixStatus,
  RippleResult,
  World,
} from "@/lib/world/schemas";

const KIND_COLOR: Record<string, string> = {
  game: "var(--game)",
  series: "var(--series)",
  press: "var(--press)",
};

export function thumbClass(order: number): string {
  return `t${((order - 1) % 8) + 1}`;
}

/** Split "Heading. Rest of the text." into its card heading and body. */
export function splitProblem(problem: string): [string, string] {
  const i = problem.indexOf(". ");
  if (i === -1) return [problem, ""];
  return [problem.slice(0, i + 1), problem.slice(i + 2)];
}

export function appliedMessage(
  unitLabel: string,
  kind: string,
  regeneratesImage: boolean,
): string {
  if (regeneratesImage) return "Image updated · game brief updated";
  if (kind === "series") return `Applied to the ${unitLabel} script`;
  if (kind === "press") return "Applied to the article";
  return `Applied to ${unitLabel}`;
}

export default function StoryMap({ world }: { world: World }) {
  const [change, setChange] = useState("");
  const [ripple, setRipple] = useState<RippleResult | null>(null);
  const [statuses, setStatuses] = useState<Record<string, FixStatus>>({});
  const [revealed, setRevealed] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const beatRefs = useRef(new Map<string, HTMLButtonElement>());
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const orders = useMemo(() => {
    const max = Math.max(...world.beats.map((b) => b.order));
    return Array.from({ length: max }, (_, i) => i + 1);
  }, [world]);

  const beatAt = (channelId: string, order: number): Beat | undefined =>
    world.beats.find((b) => b.channelId === channelId && b.order === order);

  const timeLabel = (order: number): string =>
    world.beats.find((b) => b.order === order)?.timeLabel ?? "";

  const beatById = useMemo(
    () => new Map(world.beats.map((b) => [b.id, b])),
    [world],
  );

  const channelById = useMemo(
    () => new Map(world.channels.map((c) => [c.id, c])),
    [world],
  );

  const secretSpans = useMemo(() => {
    const n = world.secrets.length;
    const base = Math.floor(orders.length / n);
    const extra = orders.length % n;
    return world.secrets.map((_, i) => base + (i < extra ? 1 : 0));
  }, [world, orders]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ripple", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ change }),
      });
      const data = (await res.json()) as RippleResult;
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      setRipple(data);
      setStatuses(
        Object.fromEntries(data.fixes.map((f) => [f.id, "pending" as FixStatus])),
      );
      const reduceMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false;
      if (reduceMotion) {
        setRevealed(data.fixes.map((f) => f.id));
        return;
      }
      setRevealed([]);
      data.fixes.forEach((fix, i) => {
        const t = window.setTimeout(
          () => {
            setRevealed((prev) => [...prev, fix.id]);
            beatRefs.current
              .get(fix.beatId)
              ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
          },
          180 * i + 320,
        );
        timers.current.push(t);
      });
    } finally {
      setLoading(false);
    }
  }

  function decide(fixId: string, status: FixStatus) {
    setStatuses((prev) => ({ ...prev, [fixId]: status }));
  }

  const decided = ripple
    ? ripple.fixes.filter((f) => (statuses[f.id] ?? "pending") !== "pending").length
    : 0;
  const open = ripple ? ripple.fixes.length - decided : 0;
  const countText = !ripple
    ? ""
    : decided === 0
      ? "Nothing changes until you approve it."
      : open > 0
        ? `${open} left to decide.`
        : "All channels agree with canon again.";

  return (
    <div className={`view ${ripple ? "rippled-root" : ""}`}>
      <div className={`map ${ripple ? "rippled" : ""}`}>
        <header className="head">
          <div>
            <div className="eyebrow">One story, three channels</div>
            <h1>Who learns what, and where</h1>
          </div>
          <div className="legend" aria-hidden="true">
            {world.channels.map((c) => (
              <span key={c.id}>
                <i style={{ background: KIND_COLOR[c.kind] ?? "var(--muted)" }} />
                {c.name}
              </span>
            ))}
          </div>
        </header>
        <div className="board">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `96px repeat(${orders.length}, minmax(128px, 1fr))`,
            }}
          >
            <div />
            {orders.map((o) => (
              <div key={o} className="col-h">
                {String(o).padStart(2, "0")} · {timeLabel(o)}
              </div>
            ))}

            {world.channels.map((channel) => (
              <Fragment key={channel.id}>
                <div
                  className="lane"
                  style={{ color: KIND_COLOR[channel.kind] }}
                >
                  {channel.name}
                  <small>{channel.title}</small>
                </div>
                {orders.map((o) => {
                  const beat = beatAt(channel.id, o);
                  if (!beat) return <div key={o} className="cell" />;
                  const fix = ripple?.fixes.find((f) => f.beatId === beat.id);
                  const status = fix ? (statuses[fix.id] ?? "pending") : null;
                  const isRevealed = fix ? revealed.includes(fix.id) : false;
                  const cls =
                    status === "applied"
                      ? "done"
                      : isRevealed
                        ? "hit"
                        : "";
                  return (
                    <div key={o} className="cell">
                      <button
                        className={`beat ${cls}`}
                        ref={(el) => {
                          if (el) beatRefs.current.set(beat.id, el);
                          else beatRefs.current.delete(beat.id);
                        }}
                      >
                        <div className={`thumb ${thumbClass(beat.order)}`}>
                          {fix && isRevealed ? (
                            <span className="flag">
                              {status === "applied" ? "FIXED" : "BREAKS"}
                            </span>
                          ) : null}
                        </div>
                        <div className="body">
                          <div className="ttl">{beat.title}</div>
                          <div className="meta">{beat.unitLabel}</div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </Fragment>
            ))}

            <div className="lane">
              Secrets<small>Only here</small>
            </div>
            {world.secrets.map((secret, i) => {
              const update = ripple?.secretUpdates.find(
                (u) => u.secretId === secret.id,
              );
              const text = update?.text ?? secret.text;
              const note = update?.note ?? secret.note;
              return (
                <div
                  key={secret.id}
                  className={`secret ${update ? "moved" : ""}`}
                  style={{ gridColumn: `span ${secretSpans[i]}` }}
                >
                  <b>{text}</b>
                  <small>{note}</small>
                </div>
              );
            })}
          </div>
        </div>
        <form className="cmd" onSubmit={onSubmit}>
          <label htmlFor="change">Change canon</label>
          <input
            id="change"
            value={change}
            onChange={(e) => setChange(e.target.value)}
            autoComplete="off"
            placeholder="Describe one canon change…"
          />
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Following…" : "Follow the change"}
          </button>
        </form>
      </div>

      <aside className="panel" aria-label="Ripple results">
        {ripple && (
          <div className="panel-in">
            <div>
              <div className="eyebrow">Ripple · muse-spark-1.3</div>
              <h2>{ripple.summary}</h2>
              <p className="summary">{countText}</p>
            </div>
            {ripple.fixes.map((fix) => {
              const beat = beatById.get(fix.beatId);
              const channel = beat ? channelById.get(beat.channelId) : undefined;
              const status = statuses[fix.id] ?? "pending";
              const [heading, rest] = splitProblem(fix.problem);
              return (
                <article
                  key={fix.id}
                  className={`fix ${status === "applied" ? "applied" : ""} ${status === "rejected" ? "rejected" : ""}`}
                >
                  <div
                    className="ch"
                    style={{
                      color: channel
                        ? (KIND_COLOR[channel.kind] ?? "var(--muted)")
                        : "var(--muted)",
                    }}
                  >
                    {channel ? `${channel.name} · ${beat?.unitLabel}` : beat?.unitLabel}
                  </div>
                  <h3>{heading}</h3>
                  {rest && <p>{rest}</p>}
                  <p>
                    <em>Fix:</em> {fix.proposal}
                  </p>
                  {fix.regeneratesImage && beat && (
                    <div className="art">
                      <div className={thumbClass(beat.order)} />
                      <span>Same character sheet</span>
                    </div>
                  )}
                  <div className="acts">
                    <button
                      className="ok"
                      type="button"
                      onClick={() => decide(fix.id, "applied")}
                    >
                      {fix.regeneratesImage ? "Apply and regenerate" : "Apply fix"}
                    </button>
                    <button
                      className="no"
                      type="button"
                      onClick={() => decide(fix.id, "rejected")}
                    >
                      Keep as is
                    </button>
                  </div>
                  <div className="state">
                    {appliedMessage(
                      beat?.unitLabel ?? "",
                      channel?.kind ?? "",
                      fix.regeneratesImage,
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}
