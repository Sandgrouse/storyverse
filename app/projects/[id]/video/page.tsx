"use client";

import "@/app/video.css";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { PlayerRef } from "@remotion/player";
import { MissingStory, useProject } from "@/components/projects/ProjectContext";
import { StoryShort, type StoryShortShot } from "@/components/video/StoryShort";
import {
  postArtRoute,
  sceneReferences,
  styleImageFor,
} from "@/lib/images";
import {
  channelColorByIndex,
  slugForTitle,
  stripImageData,
} from "@/lib/story";
import { ShortSchema, type Short, type ShortShot, type World } from "@/lib/world/schemas";
import {
  EDIT_SHOT_MAX_SEC,
  EDIT_SHOT_MIN_SEC,
  VIDEO_FPS,
  VIDEO_PLAN_FAILED_MESSAGE,
  availableArtPaths,
  clockLabel,
  fitPlayer,
  isPortraitArt,
  moveShot,
  scenesByChannel,
  shortForScene,
  shotStartFrames,
  totalFrames,
  totalSeconds,
  upsertShort,
} from "@/lib/video";

const ShortPlayer = dynamic(
  () =>
    import("@/components/video/ShortPlayer").then((mod) => mod.ShortPlayer),
  { ssr: false },
);

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

function voiceErrorMessage(json: unknown, fallback: string): string {
  if (json !== null && typeof json === "object") {
    const error = (json as Record<string, unknown>).error;
    if (error !== null && typeof error === "object") {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string" && message.length > 0) return message;
    }
  }
  return fallback;
}

function newShotId(shots: ShortShot[]): string {
  let index = shots.length + 1;
  const taken = new Set(shots.map((shot) => shot.id));
  while (taken.has(`shot-${index}`)) index += 1;
  return `shot-${index}`;
}

function newLineId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `line-${crypto.randomUUID()}`;
    }
  } catch {
    // Fall through to the timestamp fallback.
  }
  return `line-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Which shot images are portrait, by path. Loads each image once and
 * reads its natural size; anything unknown or failed stays centred.
 */
function usePortraitArt(imagePaths: string[]): Record<string, boolean> {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const seen = useRef(new Set<string>());
  // Keyed on the joined paths so the 150ms transport tick re-rendering
  // this page never restarts an image load already in flight.
  const key = imagePaths.join("\n");
  useEffect(() => {
    let cancelled = false;
    for (const path of key.split("\n").filter((entry) => entry.length > 0)) {
      if (seen.current.has(path)) continue;
      seen.current.add(path);
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const portrait = isPortraitArt(img.naturalWidth, img.naturalHeight);
        setFlags((prev) =>
          prev[path] === undefined ? { ...prev, [path]: portrait } : prev,
        );
      };
      img.onerror = () => {
        seen.current.delete(path);
      };
      img.src = path;
    }
    return () => {
      cancelled = true;
    };
  }, [key]);
  return flags;
}

/**
 * The stage box the player must fit inside, measured live so the tall
 * player sizes from the stage's height instead of overflowing it.
 */
function useFrameBox(): {
  ref: (el: HTMLDivElement | null) => void;
  box: { width: number; height: number };
} {
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  // Stable identity so React only attaches it on mount, not on the
  // 150ms transport tick re-renders.
  const ref = useCallback((el: HTMLDivElement | null) => {
    setFrameEl(el);
  }, []);
  useEffect(() => {
    if (!frameEl) return;
    const update = () => {
      const rect = frameEl.getBoundingClientRect();
      setBox((prev) => {
        if (prev.width === rect.width && prev.height === rect.height) {
          return prev;
        }
        return { width: rect.width, height: rect.height };
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frameEl);
    return () => observer.disconnect();
  }, [frameEl]);
  return { ref, box };
}

/** Audio for one shot: the saved line's data URL, if it is playable. */
function audioForShot(world: World, shot: ShortShot): string | undefined {
  const lineId = shot.voice?.lineId;
  if (!lineId) return undefined;
  const character = world.characters.find(
    (entry) => entry.id === shot.voice?.characterId,
  );
  const audioPath = character?.lines?.find(
    (line) => line.id === lineId,
  )?.audioPath;
  if (!audioPath || audioPath.startsWith("idb:")) return undefined;
  return audioPath;
}

type PlanButton = "panel" | "timeline";

type PlanState =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "working" }
  | { kind: "error"; message: string; source: PlanButton };

type ExportState =
  | { kind: "idle"; note?: string }
  | { kind: "working"; pct: number; ext: string }
  | { kind: "error"; message: string };

type RedrawState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; message: string }
  | { kind: "blocked"; message: string; description: string };

type SpeakState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; message: string };

function VideoPageInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, world, updateWorld } = useProject();
  const worldRef = useRef<World | null>(null);
  worldRef.current = world;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanState>({ kind: "idle" });
  const [exportState, setExportState] = useState<ExportState>({ kind: "idle" });
  const [redraw, setRedraw] = useState<RedrawState>({ kind: "idle" });
  const [speak, setSpeak] = useState<SpeakState>({ kind: "idle" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const playerRef = useRef<PlayerRef | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { ref: frameRef, box: frameBox } = useFrameBox();
  const portraitPaths = world
    ? [
        ...new Set(
          (world.shorts ?? []).flatMap((entry) =>
            entry.shots.map((shot) => shot.imagePath),
          ),
        ),
      ]
    : [];
  const portraitFlags = usePortraitArt(portraitPaths);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        setFrame(player.getCurrentFrame());
        setPlaying(player.isPlaying());
      } catch {
        // The player is not ready yet; keep the transport as it was.
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, []);

  if (status === "loading" || !world) {
    if (status === "missing") return <MissingStory />;
    return <main />;
  }

  const beats = [...world.beats].sort((a, b) => a.order - b.order);
  if (beats.length === 0) {
    return (
      <main className="script-empty">
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

  const go = (nextChannelId: string, nextPartId: string) => {
    router.push(
      `/projects/${params.id}/video?channel=${encodeURIComponent(nextChannelId)}&part=${encodeURIComponent(nextPartId)}`,
    );
  };
  const short = shortForScene(world, channelId, partId) ?? null;
  const shots = short?.shots ?? [];
  const selected = shots.find((shot) => shot.id === selectedId) ?? shots[0] ?? null;
  const selectedIndex = selected ? shots.indexOf(selected) : -1;
  const starts = shotStartFrames(shots);
  const frames = totalFrames(shots);
  const seconds = totalSeconds(shots);
  const tall = short?.aspect === "9:16";
  const width = tall ? 720 : 1280;
  const height = tall ? 1280 : 720;
  const playerShots: StoryShortShot[] = shots.map((shot) => ({
    imagePath: shot.imagePath,
    caption: shot.caption,
    durationSec: shot.durationSec,
    motion: shot.motion,
    audioSrc: audioForShot(world, shot),
    portrait: portraitFlags[shot.imagePath] ?? false,
  }));
  // Exact pixels from the measured stage box, so the tall player fits the
  // available height instead of covering the transport and the timeline.
  // Before the first measure the CSS aspect-ratio sizing stands in.
  const fittedPlayer =
    frameBox.height > 0
      ? fitPlayer(frameBox.width, frameBox.height, tall)
      : null;
  const art = availableArtPaths(world);
  const usedArt = new Set(
    shots.map((shot) => shot.imagePath).filter((path) => path.length > 0),
  );
  const sceneCharacters = (part?.characterIds ?? [])
    .map((id) => world.characters.find((c) => c.id === id))
    .filter((c) => c !== undefined);
  const voiceCharacter =
    world.characters.find((c) => c.id === selected?.voice?.characterId) ??
    sceneCharacters[0] ??
    null;
  const matchedLine =
    selected?.voice && voiceCharacter
      ? (voiceCharacter.lines ?? []).find(
          (line) => line.id === selected.voice?.lineId,
        ) ?? null
      : null;
  const suggestedText =
    selected?.voice && !matchedLine ? selected.voice.text : null;

  const saveShort = (next: Short) => {
    const base = worldRef.current;
    if (base) updateWorld(upsertShort(base, next));
  };

  const patchShot = (shotId: string, patch: Partial<ShortShot>) => {
    if (!short) return;
    saveShort({
      ...short,
      shots: short.shots.map((shot) =>
        shot.id === shotId ? { ...shot, ...patch } : shot,
      ),
    });
  };

  const ensureShort = (): Short | null => {
    if (short) return short;
    const base = worldRef.current;
    if (!part) return null;
    const created: Short = {
      id: `${channelId}::${partId}`,
      channelId,
      partId,
      title: part.title,
      aspect: "16:9",
      shots: [],
    };
    if (base) updateWorld(upsertShort(base, created));
    return created;
  };

  const runPlan = async (source: PlanButton) => {
    if (plan.kind === "working") return;
    const base = worldRef.current;
    if (!base) return;
    setPlan({ kind: "working" });
    try {
      const res = await fetch("/api/video/plan", {
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
          await responseMessage(res, VIDEO_PLAN_FAILED_MESSAGE),
        );
      }
      const json = (await res.json()) as { short?: unknown };
      const parsed = ShortSchema.safeParse(json.short);
      if (!parsed.success) {
        throw new Error(VIDEO_PLAN_FAILED_MESSAGE);
      }
      const live = worldRef.current;
      if (live) updateWorld(upsertShort(live, parsed.data));
      setSelectedId(parsed.data.shots[0]?.id ?? null);
      setPlan({ kind: "idle" });
    } catch (e) {
      setPlan({
        kind: "error",
        message:
          e instanceof Error ? e.message : VIDEO_PLAN_FAILED_MESSAGE,
        source,
      });
    }
  };

  const onPlanClick = (source: PlanButton) => {
    if (plan.kind === "working") return;
    if (short && short.shots.length > 0) {
      setPlan({ kind: "confirm" });
      return;
    }
    void runPlan(source);
  };

  const redrawShot = async (description?: string) => {
    if (!selected || !part || redraw.kind === "working") return;
    const base = worldRef.current;
    if (!base) return;
    setRedraw({ kind: "working" });
    try {
      const references = await sceneReferences(base, part.characterIds);
      let styleImage: string | undefined;
      if (references.length === 0) {
        styleImage = await styleImageFor(base);
      }
      const characters = part.characterIds.flatMap((id) => {
        const character = base.characters.find((c) => c.id === id);
        return character ? [{ id: character.id, name: character.name }] : [];
      });
      const payload: Record<string, unknown> = {
        part: { id: part.id, title: part.title, summary: part.summary },
        characters,
        references,
        stylePreset: base.visualStyle?.preset ?? "",
        styleNotes: base.visualStyle?.notes ?? "",
      };
      if (styleImage) payload.styleImage = styleImage;
      if (description) payload.description = description;
      else if (selected.caption.trim().length > 0) {
        payload.description = selected.caption.trim();
      }
      const result = await postArtRoute("/api/art/scene", payload);
      if (result.ok) {
        patchShot(selected.id, {
          imagePath: `data:image/webp;base64,${result.imageBase64}`,
        });
        setRedraw({ kind: "idle" });
      } else if (result.kind === "blocked") {
        setRedraw({
          kind: "blocked",
          message: result.message,
          description: result.description,
        });
      } else {
        setRedraw({ kind: "error", message: result.message });
      }
    } catch {
      setRedraw({ kind: "error", message: "Redrawing the shot failed." });
    }
  };

  const speakLine = async () => {
    if (!selected || !suggestedText || !voiceCharacter?.voice || speak.kind === "working") {
      return;
    }
    const base = worldRef.current;
    if (!base) return;
    const text = suggestedText.slice(0, 300);
    setSpeak({ kind: "working" });
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: voiceCharacter.voice.id, text }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setSpeak({
          kind: "error",
          message: voiceErrorMessage(json, "The voice failed."),
        });
        return;
      }
      const record = json !== null && typeof json === "object" ? (json as Record<string, unknown>) : null;
      const audioDataUrl = record?.audioDataUrl;
      if (typeof audioDataUrl !== "string" || !audioDataUrl.startsWith("data:audio/")) {
        setSpeak({ kind: "error", message: "The voice failed." });
        return;
      }
      const entry = { id: newLineId(), text, audioPath: audioDataUrl };
      const live = worldRef.current;
      if (!live || !short) return;
      updateWorld({
        ...upsertShort(live, {
          ...short,
          shots: short.shots.map((shot) =>
            shot.id === selected.id && shot.voice
              ? { ...shot, voice: { ...shot.voice, lineId: entry.id, text } }
              : shot,
          ),
        }),
        characters: live.characters.map((c) =>
          c.id === voiceCharacter.id
            ? { ...c, lines: [...(c.lines ?? []), entry] }
            : c,
        ),
      });
      setSpeak({ kind: "idle" });
    } catch {
      setSpeak({ kind: "error", message: "The voice failed." });
    }
  };

  const togglePlay = () => {
    const player = playerRef.current;
    if (!player || shots.length === 0) return;
    if (player.isPlaying()) {
      player.pause();
    } else {
      if (player.getCurrentFrame() >= Math.max(1, frames) - 1) {
        player.seekTo(0);
      }
      player.play();
    }
  };

  const seekShot = (index: number) => {
    const player = playerRef.current;
    const shot = shots[index];
    if (!player || !shot) return;
    setSelectedId(shot.id);
    player.seekTo(starts[index] ?? 0);
  };

  const runExport = async () => {
    if (!short || shots.length === 0 || exportState.kind === "working") return;
    const controller = new AbortController();
    abortRef.current = controller;
    setExportState({ kind: "working", pct: 0, ext: "mp4" });
    try {
      const { renderMediaOnWeb, canRenderMediaOnWeb } = await import(
        "@remotion/web-renderer"
      );
      const inputProps = { shots: playerShots };
      const composition = {
        component: StoryShort,
        id: "story-short",
        width,
        height,
        fps: VIDEO_FPS,
        durationInFrames: Math.max(1, frames),
        inputProps,
        defaultProps: inputProps,
      };
      const onProgress = ({ progress }: { progress: number }) => {
        setExportState((prev) =>
          prev.kind === "working"
            ? { ...prev, pct: Math.round(progress * 100) }
            : prev,
        );
      };
      let ext = "mp4";
      const attempt = async (container: "mp4" | "webm") => {
        const { getBlob } = await renderMediaOnWeb({
          composition,
          inputProps,
          container,
          videoCodec: container === "mp4" ? "h264" : "vp8",
          audioCodec: container === "mp4" ? "aac" : "opus",
          signal: controller.signal,
          onProgress,
        });
        return getBlob();
      };
      let blob: Blob;
      try {
        const supported = await canRenderMediaOnWeb({
          container: "mp4",
          videoCodec: "h264",
          width,
          height,
        }).catch(() => null);
        if (supported && !supported.canRender) {
          throw new Error("mp4/h264 is not supported in this browser.");
        }
        blob = await attempt("mp4");
      } catch (error) {
        if (controller.signal.aborted) throw error;
        ext = "webm";
        setExportState({ kind: "working", pct: 0, ext });
        blob = await attempt("webm");
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slugForTitle(world.title)}-${slugForTitle(short.title)}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      setExportState({ kind: "idle", note: "Saved to your downloads." });
    } catch (error) {
      if (controller.signal.aborted) {
        setExportState({ kind: "idle" });
        return;
      }
      console.error(
        `[video-export] failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      setExportState({
        kind: "error",
        message: "This browser couldn't make the file. Try Chrome on a computer.",
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const addShot = (imagePath: string) => {
    const target = ensureShort() ?? short;
    if (!target) return;
    const id = newShotId(target.shots);
    saveShort({
      ...target,
      shots: [
        ...target.shots,
        { id, imagePath, caption: "", durationSec: 4, motion: "push" },
      ],
    });
    setSelectedId(id);
    setPickerOpen(false);
  };

  const removeShot = () => {
    if (!short || !selected) return;
    const at = shots.indexOf(selected);
    const rest = shots.filter((shot) => shot.id !== selected.id);
    saveShort({ ...short, shots: rest });
    setSelectedId(rest[Math.min(at, rest.length - 1)]?.id ?? null);
  };

  const dropShot = (index: number) => {
    if (!short || dragIndex === null || dragIndex === index) return;
    saveShort({ ...short, shots: moveShot(short.shots, dragIndex, index) });
  };

  const voiceLines = voiceCharacter?.lines ?? [];
  const selectValue = matchedLine?.id ?? (suggestedText ? "__suggested" : "");

  const onVoiceChange = (value: string) => {
    if (!selected || !voiceCharacter || value === "__suggested") return;
    if (value === "") {
      patchShot(selected.id, { voice: undefined });
      return;
    }
    const line = voiceLines.find((entry) => entry.id === value);
    if (!line) return;
    patchShot(selected.id, {
      voice: { characterId: voiceCharacter.id, lineId: line.id, text: line.text },
    });
  };

  return (
    <div className="video-page">
      <aside className="video-side" aria-label="Scenes">
        {scenesByChannel(world).map(({ channel: entry, beats: here }, i) => (
          <div className="video-group" key={entry.id}>
            <h4>
              <i
                className="video-dot"
                style={{ background: channelColorByIndex(i) }}
              />
              {entry.name}
            </h4>
            {here.map((b) => (
              <button
                key={b.id}
                className={`video-item${b.id === beat.id ? " on" : ""}`}
                onClick={() => go(b.channelId, b.partId)}
              >
                {b.unitLabel} · {b.title}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <div className="video-stage">
        <div className="video-framewrap" ref={frameRef}>
          {shots.length > 0 && short ? (
            <div
              className={`video-player${tall ? " tall" : ""}`}
              style={
                fittedPlayer
                  ? {
                      width: fittedPlayer.width,
                      height: fittedPlayer.height,
                    }
                  : undefined
              }
            >
              <ShortPlayer
                key={`${short.id}::${short.aspect}`}
                ref={playerRef}
                shots={playerShots}
                width={width}
                height={height}
                durationInFrames={Math.max(1, frames)}
              />
            </div>
          ) : (
            <div className="video-quiet">
              <p>Your cut will play here.</p>
              <p>Plan the shots, or add the project&apos;s art with +.</p>
            </div>
          )}
        </div>
        <div className="video-transport">
          <button
            className="big"
            onClick={togglePlay}
            disabled={shots.length === 0}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <span>{clockLabel(frame / VIDEO_FPS, seconds)}</span>
        </div>
      </div>
      <aside className="video-props">
        {selected && short ? (
          <>
            <div className="kicker">
              Shot {selectedIndex + 1} of {shots.length}
            </div>
            <h3>{short.title}</h3>
            <label htmlFor="shot-caption">Caption</label>
            <textarea
              id="shot-caption"
              rows={3}
              value={selected.caption}
              onChange={(e) => patchShot(selected.id, { caption: e.target.value })}
            />
            <label htmlFor="shot-voice">Voice line</label>
            <select
              id="shot-voice"
              value={selectValue}
              disabled={!voiceCharacter}
              onChange={(e) => onVoiceChange(e.target.value)}
            >
              {suggestedText ? (
                <option value="__suggested">
                  Suggested: &ldquo;{suggestedText.slice(0, 60)}&rdquo;
                </option>
              ) : null}
              {voiceLines.map((line) => (
                <option key={line.id} value={line.id}>
                  {voiceCharacter?.name}: &ldquo;{line.text.slice(0, 60)}&rdquo;
                </option>
              ))}
              <option value="">No voice</option>
            </select>
            {suggestedText && voiceCharacter ? (
              <div className="video-flag">
                <b>Suggested line.</b> &ldquo;{suggestedText}&rdquo;
                <div className="video-row">
                  {voiceCharacter.voice ? (
                    <button
                      className="pill sm"
                      onClick={() => void speakLine()}
                      disabled={speak.kind === "working"}
                    >
                      {speak.kind === "working" ? "Speaking…" : "Speak this line"}
                    </button>
                  ) : (
                    <span className="video-note">
                      Choose a voice in{" "}
                      <Link href={`/projects/${params.id}/characters`}>
                        Characters
                      </Link>{" "}
                      first.
                    </span>
                  )}
                </div>
                {speak.kind === "error" ? (
                  <p className="video-note" role="status">
                    {speak.message}
                  </p>
                ) : null}
              </div>
            ) : null}
            <label htmlFor="shot-length">
              Length · {selected.durationSec}s
            </label>
            <input
              id="shot-length"
              type="range"
              min={EDIT_SHOT_MIN_SEC}
              max={EDIT_SHOT_MAX_SEC}
              step={0.5}
              value={selected.durationSec}
              onChange={(e) =>
                patchShot(selected.id, {
                  durationSec: Number(e.target.value),
                })
              }
            />
            <label>Motion</label>
            <div className="seg" role="group" aria-label="Motion">
              {(
                [
                  ["push", "Slow push"],
                  ["pan", "Pan"],
                  ["still", "Still"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={selected.motion === value ? "on" : ""}
                  onClick={() => patchShot(selected.id, { motion: value })}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="video-row" style={{ marginTop: 18 }}>
              <button
                className="pill light sm"
                onClick={() => void redrawShot()}
                disabled={redraw.kind === "working"}
              >
                {redraw.kind === "working" ? "Redrawing…" : "Redraw this shot"}
              </button>
              <button className="quiet" onClick={removeShot}>
                Remove
              </button>
            </div>
            {redraw.kind === "error" ? (
              <p className="video-note" role="status">
                {redraw.message}
              </p>
            ) : null}
            {redraw.kind === "blocked" ? (
              <div className="video-flag">
                <b>{redraw.message}</b> {redraw.description}
                <div className="video-row">
                  <button
                    className="pill light sm"
                    onClick={() => void redrawShot(redraw.description)}
                  >
                    Use this description
                  </button>
                  <button className="quiet" onClick={() => setRedraw({ kind: "idle" })}>
                    Keep it
                  </button>
                </div>
              </div>
            ) : null}
            <div className="video-divider" />
            <label>Shape</label>
            <div className="seg" role="group" aria-label="Shape">
              <button
                className={short.aspect === "16:9" ? "on" : ""}
                onClick={() => saveShort({ ...short, aspect: "16:9" })}
              >
                Wide 16:9
              </button>
              <button
                className={short.aspect === "9:16" ? "on" : ""}
                onClick={() => saveShort({ ...short, aspect: "9:16" })}
              >
                Tall 9:16
              </button>
            </div>
            <div className="video-row" style={{ marginTop: 18 }}>
              {exportState.kind === "working" ? (
                <>
                  <span className="video-note" role="status">
                    Making your video… {exportState.pct}%
                  </span>
                  <button
                    className="quiet"
                    onClick={() => abortRef.current?.abort()}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  className="pill"
                  style={{ width: "100%" }}
                  onClick={() => void runExport()}
                  disabled={shots.length === 0}
                >
                  Export video
                </button>
              )}
            </div>
            {exportState.kind === "error" ? (
              <p className="video-note" role="status">
                {exportState.message}
              </p>
            ) : null}
            {exportState.kind === "idle" && exportState.note ? (
              <p className="video-note" role="status">
                {exportState.note}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className="kicker">No shots yet</div>
            <h3>{part?.title ?? "This scene"}</h3>
            <p className="video-note">
              Plan the cut with Muse, or add the project&apos;s art with +.
            </p>
            <div className="video-row">
              <button
                className="pill sm"
                onClick={() => onPlanClick("panel")}
                disabled={plan.kind === "working"}
              >
                {plan.kind === "working" ? "Planning…" : "Plan shots with Muse"}
              </button>
            </div>
            {plan.kind === "error" && plan.source === "panel" ? (
              <p className="video-note" role="status">
                {plan.message}
              </p>
            ) : null}
          </>
        )}
      </aside>
      <div className="video-timeline">
        <div className="video-tlhead">
          <span className="video-scene">
            {channel?.name} · {part?.title} · Drag to reorder.
          </span>
          {shots.length > 0 ? (
            <button
              className="pill light sm"
              onClick={() => onPlanClick("timeline")}
              disabled={plan.kind === "working"}
            >
              {plan.kind === "working" ? "Planning…" : "Plan shots with Muse"}
            </button>
          ) : null}
        </div>
        {plan.kind === "confirm" ? (
          <div className="video-flag" style={{ marginBottom: 8 }}>
            <b>Replace this cut?</b>
            <div className="video-row">
              <button
                className="pill sm"
                onClick={() => void runPlan("timeline")}
              >
                Replace it
              </button>
              <button className="quiet" onClick={() => setPlan({ kind: "idle" })}>
                Keep my cut
              </button>
            </div>
          </div>
        ) : null}
        {plan.kind === "error" && plan.source === "timeline" ? (
          <p className="video-note" role="status">
            {plan.message}
          </p>
        ) : null}
        <div className="video-track">
          {shots.map((shot, index) => (
            <button
              key={shot.id}
              className={`video-shot${shot.id === selected?.id ? " on" : ""}${dragOver === index ? " dragover" : ""}`}
              style={{
                width: Math.max(48, shot.durationSec * 30),
                backgroundImage: shot.imagePath ? `url(${shot.imagePath})` : undefined,
              }}
              draggable
              onClick={() => seekShot(index)}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropShot(index);
                setDragIndex(null);
                setDragOver(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDragOver(null);
              }}
              aria-label={`Shot ${index + 1}: ${shot.caption || "untitled"}`}
            >
              <span>{shot.durationSec}s</span>
            </button>
          ))}
          <button
            className="video-add"
            onClick={() => setPickerOpen(true)}
            aria-label="Add a shot"
          >
            +
          </button>
        </div>
        <div className="video-audio" aria-hidden="true">
          {shots.map((shot) => (
            <div
              key={shot.id}
              className={`video-wave${audioForShot(world, shot) ? "" : " none"}`}
              style={{ width: Math.max(48, shot.durationSec * 30) }}
            />
          ))}
        </div>
      </div>
      {pickerOpen ? (
        <div
          className="video-picker"
          onClick={() => setPickerOpen(false)}
          role="dialog"
          aria-label="Add a shot"
        >
          <div
            className="video-pickerbox"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Add a shot</h3>
            <p className="video-note">
              Pick from the project&apos;s art.
            </p>
            <div className="video-pickgrid">
              {art.map((path) => (
                <button
                  key={path}
                  className="video-pick"
                  style={{ backgroundImage: `url(${path})` }}
                  onClick={() => addShot(path)}
                  aria-label={
                    usedArt.has(path)
                      ? "Use this art for a new shot (already in use)"
                      : "Use this art for a new shot"
                  }
                >
                  {usedArt.has(path) ? (
                    <span className="video-inuse">In use</span>
                  ) : null}
                </button>
              ))}
            </div>
            {art.length === 0 ? (
              <p className="video-note">There is no art yet.</p>
            ) : null}
            <div className="video-row">
              <button className="quiet" onClick={() => setPickerOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function VideoPage() {
  return (
    <Suspense>
      <VideoPageInner />
    </Suspense>
  );
}
