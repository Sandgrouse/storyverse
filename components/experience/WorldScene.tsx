"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type {
  Part,
  RippleDecision,
  RippleFix,
  RippleFixKind,
  RippleSecretUpdate,
  World,
} from "@/lib/world/schemas";
import { RippleResultSchema } from "@/lib/world/schemas";
import {
  ApplyResponseSchema,
  CheckResponseSchema,
  createRippleProgress,
  settleRippleWorld,
  type RippleProgress,
} from "@/lib/ripple";
import { channelColorByIndex, stripImageData } from "@/lib/story";
import {
  postArtRoute,
  sceneReferences,
  styleImageFor,
  type ArtPostResult,
} from "@/lib/images";
import rippleSeed from "@/data/seed/anukili-ripple.json";
import CastDrawer from "./CastDrawer";
import PackDrawer from "./PackDrawer";
import StoryPackDrawer from "./StoryPackDrawer";

/** The sample project's suggestion lives in the seed ripple, not the world. */
const SAMPLE_SUGGESTION =
  typeof (rippleSeed as { change?: unknown }).change === "string"
    ? (rippleSeed as { change: string }).change
    : "";

function suggestionFor(world: World): string {
  if (world.sampleChange) return world.sampleChange;
  return world.id === "anukili" ? SAMPLE_SUGGESTION : "";
}

const KIND_LABEL: Record<RippleFixKind, string> = {
  contradiction: "Now false",
  meaning: "Reads differently",
  setup: "Needs a clue",
};

const STAMP_LABEL: Record<RippleFixKind, string> = {
  contradiction: "Breaks",
  meaning: "Changes",
  setup: "Needs a clue",
};

const KIND_RANK: Record<RippleFixKind, number> = {
  contradiction: 0,
  meaning: 1,
  setup: 2,
};

/** Strongest kind on a part: a contradiction beats a shift beats a setup. */
function strongestKind(fixes: RippleFix[]): RippleFixKind {
  let best: RippleFixKind = "setup";
  for (const fix of fixes) {
    if (KIND_RANK[fix.kind] < KIND_RANK[best]) best = fix.kind;
  }
  return best;
}

const WAITING_STEPS = [
  "Reading every channel",
  "Checking each secret",
  "Looking for what breaks",
];

/** Crop position for a part's art. Empty keeps the CSS default. */
function artPosition(imagePosition: string): string | undefined {
  return imagePosition.length > 0 ? imagePosition : undefined;
}

function channelColor(index: number) {
  return channelColorByIndex(index);
}

type SceneArtState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; message: string }
  | { kind: "blocked"; message: string; description: string };

type RegenState =
  | { kind: "working"; oldImage: string }
  | { kind: "done"; oldImage: string; newImage: string }
  | { kind: "error"; oldImage: string; message: string }
  | { kind: "blocked"; oldImage: string; message: string; description: string };

type Props = {
  active: boolean;
  world: World;
  onWorld: (world: World) => void;
  onStartOver: () => void;
};

export default function WorldScene({ active, world, onWorld, onStartOver }: Props) {
  const [liveWorld, setLiveWorld] = useState<World>(world);
  const parts = [...liveWorld.parts].sort((a, b) => a.order - b.order);
  const [partId, setPartId] = useState(parts[2]?.id ?? parts[0]?.id);
  const part = parts.find((p) => p.id === partId) ?? parts[0];

  useEffect(() => {
    setLiveWorld(world);
    const ids = new Set(world.parts.map((p) => p.id));
    if (world.parts.length > 0) {
      setPartId((prev) => {
        if (prev && ids.has(prev)) return prev;
        const ordered = [...world.parts].sort((a, b) => a.order - b.order);
        return ordered[2]?.id ?? ordered[0]?.id ?? "";
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);
  const [bookOpen, setBookOpen] = useState(false);
  const [drawer, setDrawer] = useState<"cast" | "pack" | "story" | null>(
    null,
  );

  // The ask bar suggests the sample project's change, from the seed
  // ripple data. Any other world starts empty.
  const [ask, setAsk] = useState(() => suggestionFor(world));
  const [change, setChange] = useState("");
  const [phase, setPhase] = useState<"idle" | "waiting" | "done" | "error">(
    "idle",
  );
  const [ripple, setRipple] = useState(false);
  const [changeText, setChangeText] = useState("");
  const [fixes, setFixes] = useState<RippleFix[]>([]);
  const [secretUpdates, setSecretUpdates] = useState<RippleSecretUpdate[]>([]);
  const [visible, setVisible] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<string, RippleDecision>>({});
  const [cracks, setCracks] = useState<string[]>([]);
  const [verdict, setVerdict] = useState("");
  const [failure, setFailure] = useState("");
  const [sample, setSample] = useState(false);
  const [applyState, setApplyState] = useState<Record<string, "working" | "error">>({});
  const [applyMessages, setApplyMessages] = useState<Record<string, string>>({});
  const [oldContent, setOldContent] = useState<Record<string, string>>({});
  const [showOld, setShowOld] = useState<Record<string, boolean>>({});
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [sceneArt, setSceneArt] = useState<Record<string, SceneArtState>>({});
  const [sceneDrafts, setSceneDrafts] = useState<Record<string, string>>({});
  const [regen, setRegen] = useState<Record<string, RegenState>>({});
  const [regenDrafts, setRegenDrafts] = useState<Record<string, string>>({});

  const shelfRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const requestId = useRef(0);
  // Synchronous mirrors of the state the card handlers race on. Every
  // decision goes through progressRef, so a decision made while another
  // card is still applying is never lost to a stale snapshot.
  const worldRef = useRef<World>(world);
  const progressRef = useRef<RippleProgress | null>(null);

  const setWorld = (next: World) => {
    worldRef.current = next;
    setLiveWorld(next);
    onWorld(next);
  };

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  useEffect(() => {
    worldRef.current = world;
  }, [world]);

  // A new project gets its own bar: the sample suggestion, or empty.
  // Any new world resets it, so an upload never keeps the old sentence.
  const worldIdentity = `${world.id}::${world.sampleChange ?? ""}`;
  useEffect(() => {
    setSceneArt({});
    setSceneDrafts({});
    setRegen({});
    setRegenDrafts({});
    setAsk(suggestionFor(world));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldIdentity]);

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

  /** The server's message when it has one, so a budget stop reads as one. */
  const responseMessage = async (
    res: Response,
    fallback: string,
  ): Promise<string> => {
    const json: unknown = await res.json().catch(() => null);
    const record =
      json !== null && typeof json === "object"
        ? (json as Record<string, unknown>)
        : null;
    const error =
      record?.error !== null && typeof record?.error === "object"
        ? (record.error as Record<string, unknown>)
        : null;
    return typeof error?.message === "string" && error.message.length > 0
      ? error.message
      : fallback;
  };

  const runCheck = async (decidedChange: string, nextWorld: World) => {
    setChecking(true);
    setCheckFailed(false);
    setVerdict("Checking the new canon…");
    try {
      const res = await fetch("/api/ripple/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          change: decidedChange,
          world: stripImageData(nextWorld),
        }),
      });
      if (!res.ok) {
        throw new Error(
          await responseMessage(res, "Could not check the new canon."),
        );
      }
      const json = CheckResponseSchema.parse(await res.json());
      if (json.sample) setSample(true);
      setVerdict(json.note);
    } catch (e) {
      setCheckFailed(true);
      setVerdict(
        e instanceof Error ? e.message : "Could not check the new canon.",
      );
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
    setSecretUpdates([]);
    setVisible([]);
    setDecisions({});
    setOldContent({});
    setShowOld({});
    progressRef.current = null;
    setCracks([]);
    setSample(false);
    setApplyState({});
    setApplyMessages({});
    setCheckFailed(false);
    setSceneArt({});
    setSceneDrafts({});
    setRegen({});
    setRegenDrafts({});
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
        body: JSON.stringify({
          change: nextChange,
          world: stripImageData(liveWorld),
        }),
      });
      if (requestId.current !== id) return;
      if (!res.ok) {
        throw new Error(
          await responseMessage(res, "The ripple failed. Try again."),
        );
      }
      const result = RippleResultSchema.parse(await res.json());
      clearTimers();
      if (requestId.current !== id) return;
      setSample(!!result.sample);
      setFixes(result.fixes);
      setSecretUpdates(result.secretUpdates);
      progressRef.current = createRippleProgress(result.fixes.length);
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
    } catch (e) {
      if (requestId.current !== id) return;
      clearTimers();
      setPhase("error");
      setFailure(e instanceof Error ? e.message : "The ripple failed. Try again.");
      setVerdict("");
    }
  };

  const settleIfDone = (
    progress: RippleProgress,
    fixId: string,
    decision: RippleDecision,
    worldForCheck: World,
  ) => {
    setDecisions(progress.decide(fixId, decision));
    if (progress.isSettled()) {
      const settled = settleRippleWorld(worldForCheck, change, secretUpdates);
      setWorld(settled);
      void runCheck(change, settled);
    } else {
      setVerdict(
        `${progress.remaining()} left to decide. Nothing changes until you say so.`,
      );
    }
  };

  const applyFix = async (fix: RippleFix) => {
    const progress = progressRef.current;
    if (!progress || progress.decided(fix.id)) return;
    const rippleId = requestId.current;
    const before =
      worldRef.current.beats.find((b) => b.id === fix.beatId)?.content ?? "";
    setApplyState((prev) => ({ ...prev, [fix.id]: "working" }));
    try {
      const res = await fetch("/api/ripple/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          change,
          fix,
          world: stripImageData(worldRef.current),
        }),
      });
      if (requestId.current !== rippleId) return;
      if (!res.ok) {
        throw new Error(
          await responseMessage(res, "Applying the fix failed."),
        );
      }
      const json = ApplyResponseSchema.parse(await res.json());
      if (json.sample) setSample(true);
      const base = worldRef.current;
      const nextWorld: World = {
        ...base,
        beats: base.beats.map((b) =>
          b.id === fix.beatId ? { ...b, content: json.content } : b,
        ),
      };
      setOldContent((prev) =>
        prev[fix.id] === undefined ? { ...prev, [fix.id]: before } : prev,
      );
      setWorld(nextWorld);
      setApplyState((prev) => {
        const next = { ...prev };
        delete next[fix.id];
        return next;
      });
      if (fix.regeneratesImage) {
        const oldImage =
          nextWorld.parts.find((p) => p.id === fix.partId)?.imagePath ?? "";
        void regenSceneArt(fix, oldImage);
      }
      settleIfDone(progress, fix.id, "applied", nextWorld);
    } catch (e) {
      if (requestId.current !== rippleId) return;
      setApplyState((prev) => ({ ...prev, [fix.id]: "error" }));
      setApplyMessages((prev) => ({
        ...prev,
        [fix.id]:
          e instanceof Error ? e.message : "Applying the fix failed.",
      }));
    }
  };

  const keepFix = (fix: RippleFix) => {
    const progress = progressRef.current;
    if (!progress || progress.decided(fix.id)) return;
    settleIfDone(progress, fix.id, "kept", worldRef.current);
  };

  /** POST one scene image for a part, with an optional proposal or edit. */
  const postScene = async (
    target: Part,
    base: World,
    options?: { change?: string; description?: string },
  ): Promise<ArtPostResult> => {
    const references = await sceneReferences(base, target.characterIds);
    let styleImage: string | undefined;
    if (references.length === 0) {
      styleImage = await styleImageFor(base);
    }
    const characters = target.characterIds.flatMap((id) => {
      const character = base.characters.find((c) => c.id === id);
      return character ? [{ id: character.id, name: character.name }] : [];
    });
    const payload: Record<string, unknown> = {
      part: { id: target.id, title: target.title, summary: target.summary },
      characters,
      references,
    };
    if (styleImage) payload.styleImage = styleImage;
    if (options?.change) payload.change = options.change;
    if (options?.description) payload.description = options.description;
    return postArtRoute("/api/art/scene", payload);
  };

  const setPartImage = (base: World, partId: string, imagePath: string): World => ({
    ...base,
    parts: base.parts.map((p) => (p.id === partId ? { ...p, imagePath } : p)),
  });

  /** The desk's "Make the art" button: the part's first image. */
  const makeSceneArt = async (target: Part, description?: string) => {
    setSceneArt((prev) => ({ ...prev, [target.id]: { kind: "working" } }));
    const result = await postScene(target, worldRef.current, { description });
    if (result.ok) {
      setWorld(
        setPartImage(
          worldRef.current,
          target.id,
          `data:image/webp;base64,${result.imageBase64}`,
        ),
      );
      setSceneArt((prev) => ({ ...prev, [target.id]: { kind: "idle" } }));
    } else if (result.kind === "blocked") {
      setSceneArt((prev) => ({
        ...prev,
        [target.id]: {
          kind: "blocked",
          message: result.message,
          description: result.description,
        },
      }));
      setSceneDrafts((prev) =>
        prev[target.id] === undefined
          ? { ...prev, [target.id]: result.description }
          : prev,
      );
    } else {
      setSceneArt((prev) => ({
        ...prev,
        [target.id]: { kind: "error", message: result.message },
      }));
    }
  };

  /**
   * Redraw a part's art with the applied proposal added. The text fix
   * stands whatever happens here; a failure only offers a retry.
   */
  const regenSceneArt = async (fix: RippleFix, oldImage: string) => {
    setRegen((prev) => ({ ...prev, [fix.id]: { kind: "working", oldImage } }));
    const target = worldRef.current.parts.find((p) => p.id === fix.partId);
    if (!target) {
      setRegen((prev) => ({
        ...prev,
        [fix.id]: { kind: "error", oldImage, message: "That part is gone." },
      }));
      return;
    }
    const draft = regenDrafts[fix.id]?.trim();
    const result = await postScene(target, worldRef.current, {
      change: fix.proposal,
      description: draft || undefined,
    });
    if (result.ok) {
      const newImage = `data:image/webp;base64,${result.imageBase64}`;
      setWorld(setPartImage(worldRef.current, target.id, newImage));
      setRegen((prev) => ({
        ...prev,
        [fix.id]: { kind: "done", oldImage, newImage },
      }));
    } else if (result.kind === "blocked") {
      setRegen((prev) => ({
        ...prev,
        [fix.id]: {
          kind: "blocked",
          oldImage,
          message: result.message,
          description: result.description,
        },
      }));
      setRegenDrafts((prev) => ({ ...prev, [fix.id]: result.description }));
    } else {
      setRegen((prev) => ({
        ...prev,
        [fix.id]: { kind: "error", oldImage, message: result.message },
      }));
    }
  };

  const backToStory = () => {
    requestId.current += 1;
    clearTimers();
    setRipple(false);
    setPhase("idle");
    setFixes([]);
    setSecretUpdates([]);
    setVisible([]);
    setDecisions({});
    setOldContent({});
    setShowOld({});
    progressRef.current = null;
    setCracks([]);
    setVerdict("");
    setFailure("");
    setChecking(false);
    setCheckFailed(false);
    setSceneArt({});
    setSceneDrafts({});
    setRegen({});
    setRegenDrafts({});
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

  const sceneState: SceneArtState = sceneArt[part.id] ?? { kind: "idle" };

  const appliedLine = (fix: RippleFix) => {
    const channel = channelOf(fix);
    return `Fixed in ${channel?.name ?? "story"} · ${KIND_LABEL[fix.kind]}`;
  };

  if (!part) {
    return (
      <section className={`scene${active ? " on" : ""}`} id="world">
        <div className="logo">{liveWorld.title}</div>
        <nav className="nav" aria-label="Sections">
          <button onClick={onStartOver}>Start over</button>
        </nav>
      </section>
    );
  }

  return (
    <section
      className={`scene${active ? " on" : ""}${ripple ? " ripple" : ""}`}
      id="world"
      style={{ "--tint": part.tint } as React.CSSProperties}
    >
      <div
        className="artwash"
        style={
          part.imagePath
            ? {
                backgroundImage: `url(${part.imagePath})`,
                backgroundPosition: artPosition(part.imagePosition),
              }
            : { backgroundImage: "none", backgroundColor: part.tint }
        }
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
        <button onClick={onStartOver}>Start over</button>
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
          {!part.imagePath && sceneState.kind !== "idle" && (
            <div className="artstate" role="status">
              {sceneState.kind === "working" && <p>Making the art…</p>}
              {sceneState.kind === "error" && (
                <>
                  <p>{sceneState.message}</p>
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => void makeSceneArt(part)}
                  >
                    Retry
                  </button>
                </>
              )}
              {sceneState.kind === "blocked" && (
                <>
                  <p>{sceneState.message}</p>
                  <textarea
                    aria-label="Describe the scene art"
                    value={sceneDrafts[part.id] ?? sceneState.description}
                    onChange={(e) =>
                      setSceneDrafts((prev) => ({
                        ...prev,
                        [part.id]: e.target.value,
                      }))
                    }
                    rows={3}
                  />
                  <button
                    type="button"
                    className="quiet"
                    onClick={() =>
                      void makeSceneArt(
                        part,
                        sceneDrafts[part.id]?.trim() || undefined,
                      )
                    }
                  >
                    Retry
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="side">
          <button onClick={() => setDrawer("story")}>Story Pack</button>
          {!part.imagePath &&
            (sceneState.kind === "working" ? (
              <button disabled>Making the art…</button>
            ) : (
              <button onClick={() => void makeSceneArt(part)}>
                Make the art
              </button>
            ))}
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
          style={
            part.imagePath
              ? {
                  backgroundImage: `url(${part.imagePath})`,
                  backgroundPosition: artPosition(part.imagePosition),
                }
              : { backgroundImage: "none", backgroundColor: part.tint }
          }
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
                style={
                  p.imagePath
                    ? {
                        backgroundImage: `url(${p.imagePath})`,
                        backgroundPosition: artPosition(p.imagePosition),
                      }
                    : { backgroundImage: "none", backgroundColor: p.tint }
                }
              />
              <div className="label">
                <b>{p.title}</b>
                <small>Part {p.order}</small>
              </div>
              <span className="stamp">
                {allApplied
                  ? "Fixed"
                  : STAMP_LABEL[
                      strongestKind(fixes.filter((f) => f.partId === p.id))
                    ]}
              </span>
            </button>
          );
        })}
        {liveWorld.channels.map((channel, channelIndex) => (
          <Fragment key={`lane-${channel.id}`}>
            <div
              className="lane"
              style={{ color: channelColor(channelIndex) }}
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
                  style={{ "--c": channelColor(channelIndex) } as React.CSSProperties}
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
        <button
          type="submit"
          disabled={phase === "waiting" || ask.trim().length === 0}
        >
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
                  <small style={{ color: channel ? channelColor(liveWorld.channels.findIndex((c) => c.id === channel.id)) : undefined }}>
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
                    <>
                    {applyFailed && applyMessages[fix.id] && (
                      <p className="state">{applyMessages[fix.id]}</p>
                    )}
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
                    </>
                  )}
                  {decision === "applied" && beat && (
                    <div className="newscene">
                      <p>
                        {showOld[fix.id] && oldContent[fix.id] !== undefined
                          ? oldContent[fix.id]
                          : beat.content}
                      </p>
                      {oldContent[fix.id] !== undefined && (
                        <button
                          type="button"
                          className="toggle"
                          onClick={() =>
                            setShowOld((prev) => ({
                              ...prev,
                              [fix.id]: !prev[fix.id],
                            }))
                          }
                        >
                          {showOld[fix.id]
                            ? "Show the new version"
                            : "Show the old version"}
                        </button>
                      )}
                      <div className="state">{appliedLine(fix)}</div>
                      {fix.regeneratesImage &&
                        (() => {
                          const art: RegenState = regen[fix.id] ?? {
                            kind: "working",
                            oldImage: "",
                          };
                          if (art.kind === "done") {
                            return (
                              <div className="compare">
                                {art.oldImage && (
                                  <figure>
                                    <div
                                      className="cmpimg"
                                      style={{
                                        backgroundImage: `url(${art.oldImage})`,
                                      }}
                                      role="img"
                                      aria-label="The scene before the fix"
                                    />
                                    <figcaption>Before</figcaption>
                                  </figure>
                                )}
                                <figure>
                                  <div
                                    className="cmpimg"
                                    style={{
                                      backgroundImage: `url(${art.newImage})`,
                                    }}
                                    role="img"
                                    aria-label="The scene after the fix"
                                  />
                                  <figcaption>After</figcaption>
                                </figure>
                              </div>
                            );
                          }
                          if (art.kind === "error") {
                            return (
                              <div className="regenfail" role="status">
                                <p>{art.message}</p>
                                <button
                                  type="button"
                                  className="quiet"
                                  onClick={() =>
                                    void regenSceneArt(fix, art.oldImage)
                                  }
                                >
                                  Retry the image
                                </button>
                              </div>
                            );
                          }
                          if (art.kind === "blocked") {
                            return (
                              <div className="regenfail" role="status">
                                <p>{art.message}</p>
                                <textarea
                                  aria-label="Describe the new scene art"
                                  value={
                                    regenDrafts[fix.id] ?? art.description
                                  }
                                  onChange={(e) =>
                                    setRegenDrafts((prev) => ({
                                      ...prev,
                                      [fix.id]: e.target.value,
                                    }))
                                  }
                                  rows={3}
                                />
                                <button
                                  type="button"
                                  className="quiet"
                                  onClick={() =>
                                    void regenSceneArt(fix, art.oldImage)
                                  }
                                >
                                  Retry the image
                                </button>
                              </div>
                            );
                          }
                          return (
                            <p className="regenwait" role="status">
                              Making the new image…
                            </p>
                          );
                        })()}
                    </div>
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

      <CastDrawer world={liveWorld} open={drawer === "cast"} onClose={() => setDrawer(null)} onWorld={setWorld} />
      <PackDrawer world={liveWorld} open={drawer === "pack"} onClose={() => setDrawer(null)} />
      <StoryPackDrawer world={liveWorld} partId={part.id} open={drawer === "story"} onClose={() => setDrawer(null)} onWorld={setWorld} />
    </section>
  );
}
