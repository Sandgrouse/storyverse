"use client";

import "@/app/storyboard.css";
import { Suspense, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { MissingStory, useProject } from "@/components/projects/ProjectContext";
import {
  postArtRoute,
  sceneReferences,
  styleImageFor,
  type ArtPostResult,
} from "@/lib/images";
import { channelColorByIndex, stripImageData } from "@/lib/story";
import {
  StoryboardSchema,
  type Storyboard,
  type StoryboardFrame,
  type StoryboardFraming,
  type World,
} from "@/lib/world/schemas";
import { greyscaleSketchDataUrl } from "@/lib/sketch";
import {
  STORYBOARD_FRAMINGS,
  STORYBOARD_PLAN_FAILED_MESSAGE,
  boardReferenceIds,
  moveFrame,
  patchStoryboardFrame,
  storyboardForScene,
  upsertStoryboard,
} from "@/lib/storyboard";

type PlanState =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "working" }
  | { kind: "error"; message: string };

type SketchAllState =
  | { kind: "idle" }
  | { kind: "working"; done: number; total: number }
  | { kind: "error"; message: string };

type SketchState =
  | { kind: "idle" }
  | { kind: "working"; frameId: string }
  | { kind: "error"; frameId: string; message: string }
  | {
      kind: "blocked";
      frameId: string;
      message: string;
      description: string;
    };

type GreyAllState =
  | { kind: "idle" }
  | { kind: "working"; done: number; total: number }
  | { kind: "error"; message: string };

/**
 * Flatten a fresh sketch to black and white in the browser. Falls back
 * to the original when canvas cannot read it.
 */
async function blackAndWhite(dataUrl: string): Promise<string> {
  try {
    return await greyscaleSketchDataUrl(dataUrl);
  } catch {
    return dataUrl;
  }
}

async function responseMessage(
  res: Response,
  fallback: string,
): Promise<string> {
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
}

function newFrameId(frames: StoryboardFrame[]): string {
  let index = frames.length + 1;
  const taken = new Set(frames.map((frame) => frame.id));
  while (taken.has(`frame-${index}`)) index += 1;
  return `frame-${index}`;
}

function unsketched(frames: StoryboardFrame[]): StoryboardFrame[] {
  return frames.filter(
    (frame) => !frame.imagePath || frame.imagePath.length === 0,
  );
}

function StoryboardPageInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, world, updateWorld } = useProject();
  const worldRef = useRef<World | null>(null);
  worldRef.current = world;

  const [plan, setPlan] = useState<PlanState>({ kind: "idle" });
  const [sketchAll, setSketchAll] = useState<SketchAllState>({ kind: "idle" });
  const [sketch, setSketch] = useState<SketchState>({ kind: "idle" });
  const [greyAll, setGreyAll] = useState<GreyAllState>({ kind: "idle" });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const cancelRef = useRef(false);

  if (status === "loading" || !world) {
    if (status === "missing") return <MissingStory />;
    return <main />;
  }

  const beats = [...world.beats].sort((a, b) => a.order - b.order);
  if (beats.length === 0) {
    return (
      <main className="storyboard-empty">
        <p>There are no scenes yet. Add channels and parts first.</p>
      </main>
    );
  }

  const channelParam = searchParams.get("channel");
  const partParam = searchParams.get("part");
  const beat =
    beats.find(
      (b) => b.channelId === channelParam && b.partId === partParam,
    ) ?? beats[0];
  const channelId = beat.channelId;
  const partId = beat.partId;
  const part = world.parts.find((p) => p.id === partId);
  const channel = world.channels.find((c) => c.id === channelId);
  const board = storyboardForScene(world, channelId, partId) ?? null;
  const frames = board?.frames ?? [];

  const go = (nextChannelId: string, nextPartId: string) => {
    router.push(
      `/projects/${params.id}/storyboard?channel=${encodeURIComponent(nextChannelId)}&part=${encodeURIComponent(nextPartId)}`,
    );
  };

  const saveBoard = (next: Storyboard) => {
    const base = worldRef.current;
    if (!base) return;
    const updated = upsertStoryboard(base, next);
    worldRef.current = updated;
    updateWorld(updated);
  };

  const ensureBoard = (): Storyboard | null => {
    if (board) return board;
    const base = worldRef.current;
    if (!part) return null;
    const created: Storyboard = {
      id: `${channelId}::${partId}`,
      channelId,
      partId,
      title: part.title,
      frames: [],
    };
    if (base) updateWorld(upsertStoryboard(base, created));
    return created;
  };

  const patchFrame = (frameId: string, patch: Partial<StoryboardFrame>) => {
    const base = worldRef.current;
    const live = base
      ? storyboardForScene(base, channelId, partId)
      : undefined;
    const target = live ?? board ?? ensureBoard();
    if (!target) return;
    saveBoard(patchStoryboardFrame(target, frameId, patch));
  };

  const runPlan = async () => {
    if (plan.kind === "working") return;
    const base = worldRef.current;
    if (!base) return;
    setPlan({ kind: "working" });
    try {
      const res = await fetch("/api/storyboard/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          world: stripImageData(base),
          channelId,
          partId,
        }),
      });
      if (!res.ok) {
        throw new Error(
          await responseMessage(res, STORYBOARD_PLAN_FAILED_MESSAGE),
        );
      }
      const json = (await res.json()) as { storyboard?: unknown };
      const parsed = StoryboardSchema.safeParse(json.storyboard);
      if (!parsed.success) {
        throw new Error(STORYBOARD_PLAN_FAILED_MESSAGE);
      }
      const live = worldRef.current;
      if (live) updateWorld(upsertStoryboard(live, parsed.data));
      setPlan({ kind: "idle" });
    } catch (e) {
      setPlan({
        kind: "error",
        message:
          e instanceof Error ? e.message : STORYBOARD_PLAN_FAILED_MESSAGE,
      });
    }
  };

  const onPlanClick = () => {
    if (plan.kind === "working") return;
    if (board && board.frames.length > 0) {
      setPlan({ kind: "confirm" });
      return;
    }
    void runPlan();
  };

  const addFrame = () => {
    const target = board ?? ensureBoard();
    if (!target) return;
    saveBoard({
      ...target,
      frames: [
        ...target.frames,
        {
          id: newFrameId(target.frames),
          framing: "wide" as StoryboardFraming,
          action: "",
          characterIds: [],
        },
      ],
    });
  };

  const removeFrame = (frameId: string) => {
    if (!board) return;
    saveBoard({
      ...board,
      frames: board.frames.filter((frame) => frame.id !== frameId),
    });
    if (
      (sketch.kind === "error" || sketch.kind === "blocked") &&
      sketch.frameId === frameId
    ) {
      setSketch({ kind: "idle" });
    }
  };

  const dropFrame = (index: number) => {
    if (!board || dragIndex === null || dragIndex === index) return;
    saveBoard({ ...board, frames: moveFrame(board.frames, dragIndex, index) });
  };

  const requestSketch = async (
    frame: StoryboardFrame,
    description?: string,
  ): Promise<ArtPostResult> => {
    const base = worldRef.current;
    if (!base || !part) {
      return { ok: false, kind: "error", message: "Sketching failed." };
    }
    // Every frame on this board shares the same references in the same
    // order, so the same character looks the same in every sketch.
    const liveBoard =
      storyboardForScene(base, channelId, partId) ?? board ?? null;
    const ids = boardReferenceIds(liveBoard, part.characterIds ?? []);
    const references = await sceneReferences(base, ids);
    let styleImage: string | undefined;
    if (references.length === 0) {
      styleImage = await styleImageFor(base);
    }
    const characters = ids.flatMap((id) => {
      const character = base.characters.find((c) => c.id === id);
      return character ? [{ id: character.id, name: character.name }] : [];
    });
    const payload: Record<string, unknown> = {
      part: { id: part.id, title: part.title, summary: part.summary },
      characters,
      references,
      style: "sketch",
      framing: frame.framing,
    };
    if (styleImage) payload.styleImage = styleImage;
    const text = (description ?? frame.action).trim();
    if (text.length > 0) {
      payload.description = text;
    }
    return postArtRoute("/api/art/scene", payload);
  };

  const sketchSingle = async (frameId: string, description?: string) => {
    if (sketch.kind === "working") return;
    const live = worldRef.current;
    const frame = live
      ? storyboardForScene(live, channelId, partId)?.frames.find(
          (entry) => entry.id === frameId,
        )
      : undefined;
    if (!frame) return;
    setSketch({ kind: "working", frameId });
    const result = await requestSketch(frame, description);
    if (result.ok) {
      patchFrame(frameId, {
        imagePath: await blackAndWhite(
          `data:image/webp;base64,${result.imageBase64}`,
        ),
      });
      setSketch({ kind: "idle" });
    } else if (result.kind === "blocked") {
      setSketch({
        kind: "blocked",
        frameId,
        message: result.message,
        description: result.description,
      });
    } else {
      setSketch({ kind: "error", frameId, message: result.message });
    }
  };

  const runSketchAll = async () => {
    if (sketchAll.kind === "working") return;
    const live = worldRef.current;
    const pending = live
      ? unsketched(
          storyboardForScene(live, channelId, partId)?.frames ?? [],
        )
      : [];
    if (pending.length === 0) return;
    cancelRef.current = false;
    setSketchAll({ kind: "working", done: 0, total: pending.length });
    for (let i = 0; i < pending.length; i += 1) {
      if (cancelRef.current) break;
      const current = worldRef.current
        ? storyboardForScene(worldRef.current, channelId, partId)?.frames.find(
            (entry) => entry.id === pending[i]?.id,
          )
        : undefined;
      if (!current) continue;
      const result = await requestSketch(current);
      if (!result.ok) {
        setSketchAll({ kind: "error", message: result.message });
        return;
      }
      patchFrame(current.id, {
        imagePath: await blackAndWhite(
          `data:image/webp;base64,${result.imageBase64}`,
        ),
      });
      setSketchAll({ kind: "working", done: i + 1, total: pending.length });
    }
    setSketchAll({ kind: "idle" });
  };

  const cancelSketchAll = () => {
    cancelRef.current = true;
    setSketchAll({ kind: "idle" });
  };

  const runGreyAll = async () => {
    if (greyAll.kind === "working") return;
    const live = worldRef.current;
    if (!live) return;
    const sketched = (
      storyboardForScene(live, channelId, partId)?.frames ?? []
    ).filter(
      (entry) =>
        typeof entry.imagePath === "string" &&
        entry.imagePath.startsWith("data:image"),
    );
    if (sketched.length === 0) return;
    setGreyAll({ kind: "working", done: 0, total: sketched.length });
    try {
      for (let i = 0; i < sketched.length; i += 1) {
        const current = sketched[i];
        if (!current?.imagePath) continue;
        patchFrame(current.id, {
          imagePath: await blackAndWhite(current.imagePath),
        });
        setGreyAll({ kind: "working", done: i + 1, total: sketched.length });
      }
      setGreyAll({ kind: "idle" });
    } catch {
      setGreyAll({
        kind: "error",
        message: "Some frames stayed in colour. Try again.",
      });
    }
  };

  const pendingCount = unsketched(frames).length;

  return (
    <div className="storyboard-layout">
      <aside className="storyboard-side" aria-label="Scenes">
        {world.channels.map((entry, i) => {
          const here = beats.filter((b) => b.channelId === entry.id);
          if (here.length === 0) return null;
          return (
            <div className="storyboard-group" key={entry.id}>
              <h4>
                <i
                  className="storyboard-dot"
                  style={{ background: channelColorByIndex(i) }}
                />
                {entry.name}
              </h4>
              {here.map((b) => (
                <button
                  key={b.id}
                  className={`storyboard-item${b.id === beat.id ? " on" : ""}`}
                  onClick={() => go(b.channelId, b.partId)}
                >
                  {b.unitLabel} · {b.title}
                </button>
              ))}
            </div>
          );
        })}
      </aside>
      <main className="storyboard-main">
        <div className="storyboard-head storyboard-controls">
          <span className="storyboard-scene">
            {channel?.name} · {part?.title}
          </span>
          <div className="storyboard-actions">
            <button
              className="pill sm"
              onClick={onPlanClick}
              disabled={plan.kind === "working"}
            >
              {plan.kind === "working"
                ? "Planning…"
                : "Plan the storyboard with Muse"}
            </button>
            {pendingCount > 0 ? (
              sketchAll.kind === "working" ? (
                <>
                  <span className="storyboard-note" role="status">
                    Sketching {sketchAll.done + 1} of {sketchAll.total}…
                  </span>
                  <button className="quiet" onClick={cancelSketchAll}>
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  className="pill light sm"
                  onClick={() => void runSketchAll()}
                >
                  Sketch the missing frames
                </button>
              )
            ) : null}
            {frames.some(
              (frame) =>
                typeof frame.imagePath === "string" &&
                frame.imagePath.startsWith("data:image"),
            ) ? (
              greyAll.kind === "working" ? (
                <span className="storyboard-note" role="status">
                  Making black and white {greyAll.done + 1} of {greyAll.total}…
                </span>
              ) : (
                <button
                  className="pill light sm"
                  onClick={() => void runGreyAll()}
                >
                  Make all frames black and white
                </button>
              )
            ) : null}
            <button
              className="pill light sm"
              onClick={() => window.print()}
            >
              Print or save as PDF
            </button>
          </div>
        </div>
        {plan.kind === "confirm" ? (
          <div className="storyboard-flag storyboard-controls">
            <b>Replace this storyboard?</b>
            <div className="storyboard-row">
              <button className="pill sm" onClick={() => void runPlan()}>
                Replace it
              </button>
              <button
                className="quiet"
                onClick={() => setPlan({ kind: "idle" })}
              >
                Keep mine
              </button>
            </div>
          </div>
        ) : null}
        {plan.kind === "error" ? (
          <p className="storyboard-note" role="status">
            {plan.message}
          </p>
        ) : null}
        {sketchAll.kind === "error" ? (
          <p className="storyboard-note" role="status">
            {sketchAll.message}
          </p>
        ) : null}
        {greyAll.kind === "error" ? (
          <p className="storyboard-note" role="status">
            {greyAll.message}
          </p>
        ) : null}
        {!board || frames.length === 0 ? (
          <div className="storyboard-empty">
            <p>No storyboard for this scene yet.</p>
            <button
              className="pill"
              onClick={onPlanClick}
              disabled={plan.kind === "working"}
            >
              {plan.kind === "working"
                ? "Planning…"
                : "Plan the storyboard with Muse"}
            </button>
          </div>
        ) : (
          <div className="storyboard-grid">
            {frames.map((frame, index) => (
              <div
                key={frame.id}
                className={`storyboard-frame${dragOver === index ? " dragover" : ""}`}
              >
                <div
                  className="storyboard-framenum"
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(index);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropFrame(index);
                    setDragIndex(null);
                    setDragOver(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOver(null);
                  }}
                  aria-label={`Frame ${index + 1}, drag to reorder`}
                >
                  <span>Frame {index + 1}</span>
                  <span>{frame.framing}</span>
                </div>
                {frame.imagePath ? (
                  // A real image element so the sketch prints; background
                  // art would not appear on paper.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="storyboard-sketch"
                    src={frame.imagePath}
                    alt={`Frame ${index + 1} sketch`}
                  />
                ) : (
                  <div className="storyboard-placeholder">
                    <span>Not sketched yet</span>
                    <button
                      className="pill sm storyboard-controls"
                      onClick={() => void sketchSingle(frame.id)}
                      disabled={
                        sketch.kind === "working" ||
                        sketchAll.kind === "working"
                      }
                    >
                      {sketch.kind === "working" &&
                      sketch.frameId === frame.id
                        ? "Sketching…"
                        : "Sketch this frame"}
                    </button>
                  </div>
                )}
                <div className="storyboard-edit storyboard-controls">
                  <label>
                    Framing
                    <select
                      value={frame.framing}
                      onChange={(e) =>
                        patchFrame(frame.id, {
                          framing: e.target.value as StoryboardFraming,
                        })
                      }
                    >
                      {STORYBOARD_FRAMINGS.map((framing) => (
                        <option key={framing} value={framing}>
                          {framing}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Action
                    <textarea
                      rows={2}
                      value={frame.action}
                      placeholder="What happens in this frame."
                      onChange={(e) =>
                        patchFrame(frame.id, { action: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Dialogue
                    <textarea
                      rows={2}
                      value={frame.dialogue ?? ""}
                      placeholder="A spoken line, or nothing."
                      onChange={(e) =>
                        patchFrame(frame.id, { dialogue: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Camera note
                    <textarea
                      rows={2}
                      value={frame.camera ?? ""}
                      placeholder="How the camera sees it."
                      onChange={(e) =>
                        patchFrame(frame.id, { camera: e.target.value })
                      }
                    />
                  </label>
                  <div className="storyboard-row">
                    {frame.imagePath ? (
                      <button
                        className="pill light sm"
                        onClick={() => void sketchSingle(frame.id)}
                        disabled={
                          sketch.kind === "working" ||
                          sketchAll.kind === "working"
                        }
                      >
                        {sketch.kind === "working" &&
                        sketch.frameId === frame.id
                          ? "Sketching…"
                          : "Redraw sketch"}
                      </button>
                    ) : null}
                    <button
                      className="quiet"
                      onClick={() => removeFrame(frame.id)}
                    >
                      Remove
                    </button>
                  </div>
                  {sketch.kind === "error" &&
                  sketch.frameId === frame.id ? (
                    <p className="storyboard-note" role="status">
                      {sketch.message}
                    </p>
                  ) : null}
                  {sketch.kind === "blocked" &&
                  sketch.frameId === frame.id ? (
                    <div className="storyboard-flag">
                      <b>{sketch.message}</b> {sketch.description}
                      <div className="storyboard-row">
                        <button
                          className="pill light sm"
                          onClick={() =>
                            void sketchSingle(frame.id, sketch.description)
                          }
                        >
                          Use this description
                        </button>
                        <button
                          className="quiet"
                          onClick={() => setSketch({ kind: "idle" })}
                        >
                          Keep it
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="storyboard-print" aria-hidden="true">
                  <h4>Frame {index + 1}</h4>
                  <p>{frame.action}</p>
                  {frame.dialogue ? <p>{frame.dialogue}</p> : null}
                </div>
              </div>
            ))}
            <button
              className="storyboard-add storyboard-controls"
              onClick={addFrame}
              aria-label="Add a frame"
            >
              + Add a frame
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function StoryboardPage() {
  return (
    <Suspense>
      <StoryboardPageInner />
    </Suspense>
  );
}
