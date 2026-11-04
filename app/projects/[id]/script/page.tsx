"use client";

import "@/app/script.css";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { MissingStory, useProject } from "@/components/projects/ProjectContext";
import {
  ScriptCheckResponseSchema,
  applyScriptReplacement,
  highlightSegments,
  highlightTerms,
  initialScriptText,
  scriptForScene,
  upsertScript,
  type ScriptIssue,
} from "@/lib/script";
import type { World } from "@/lib/world/schemas";
import { channelColorByIndex, stripImageData } from "@/lib/story";

const SAVE_DELAY_MS = 600;

const KIND_LABEL: Record<ScriptIssue["kind"], string> = {
  contradiction: "Contradicts the canon.",
  leak: "Leaks what this channel must not know.",
};

type DraftState =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "working" }
  | { kind: "error"; message: string };

type CheckState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; message: string };

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

/** The paper page: a textarea over a mirrored highlight backdrop. */
function ScriptEditor({
  world,
  onWorld,
  channelId,
  partId,
  beatId,
}: {
  world: World;
  onWorld: (world: World) => void;
  channelId: string;
  partId: string;
  beatId: string;
}) {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const initial = useMemo(
    () => initialScriptText(world, channelId, partId),
    // Hydrate once per scene; the key remounts on scene change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [text, setText] = useState(initial);
  const initialRef = useRef(initial);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const [draft, setDraft] = useState<DraftState>({ kind: "idle" });
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });
  const [issues, setIssues] = useState<ScriptIssue[]>([]);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [ranCheck, setRanCheck] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const beat = world.beats.find((b) => b.id === beatId);
  const terms = useMemo(() => highlightTerms(world), [world]);
  const strongQuotes = useMemo(
    () => issues.map((issue) => issue.quote),
    [issues],
  );
  const segments = useMemo(
    () => highlightSegments(text, terms, strongQuotes),
    [text, terms, strongQuotes],
  );

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  // Typing saves after a short debounce, once the text differs from load.
  useEffect(() => {
    if (text === initialRef.current) return;
    const stored = scriptForScene(world, channelId, partId)?.text;
    if (text === stored) return;
    const timer = window.setTimeout(() => {
      onWorld(upsertScript(world, channelId, partId, text));
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // The world is read fresh from closure on each keystroke's timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, channelId, partId]);

  const syncScroll = () => {
    const area = areaRef.current;
    const backdrop = backdropRef.current;
    if (area && backdrop) {
      backdrop.scrollTop = area.scrollTop;
      backdrop.scrollLeft = area.scrollLeft;
    }
  };

  const readSelection = () => {
    const area = areaRef.current;
    if (!area) return null;
    if (area.selectionStart === area.selectionEnd) return null;
    return { start: area.selectionStart, end: area.selectionEnd };
  };

  const runDraft = async (
    mode: "draft" | "rewrite",
    range: { start: number; end: number } | null,
  ) => {
    setDraft({ kind: "working" });
    try {
      const res = await fetch("/api/script/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          world: stripImageData(world),
          channelId,
          partId,
          mode,
          text,
          selection: range ? text.slice(range.start, range.end) : "",
          instruction: "",
        }),
      });
      if (!res.ok) {
        throw new Error(await responseMessage(res, "The draft failed."));
      }
      const json = (await res.json()) as { text?: unknown };
      if (typeof json.text !== "string" || json.text.length === 0) {
        throw new Error("The draft failed.");
      }
      if (mode === "rewrite" && range) {
        setText(text.slice(0, range.start) + json.text + text.slice(range.end));
      } else {
        setText(json.text);
      }
      setDraft({ kind: "idle" });
    } catch (e) {
      setDraft({
        kind: "error",
        message: e instanceof Error ? e.message : "The draft failed.",
      });
    }
  };

  const onDraftClick = () => {
    if (draft.kind === "working") return;
    if (text.length > 0) {
      setDraft({ kind: "confirm" });
      return;
    }
    void runDraft("draft", null);
  };

  const onRewriteClick = () => {
    if (draft.kind === "working") return;
    const range = readSelection();
    if (!range) return;
    void runDraft("rewrite", range);
  };

  const runCheck = async () => {
    if (check.kind === "working") return;
    setCheck({ kind: "working" });
    setIssues([]);
    setRevealed([]);
    try {
      const res = await fetch("/api/script/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          world: stripImageData(world),
          channelId,
          partId,
          text,
        }),
      });
      if (!res.ok) {
        throw new Error(
          await responseMessage(res, "Checking the script failed."),
        );
      }
      const json = ScriptCheckResponseSchema.parse(await res.json());
      setIssues(json.issues);
      setRanCheck(true);
      setCheck({ kind: "idle" });
    } catch (e) {
      setCheck({
        kind: "error",
        message:
          e instanceof Error ? e.message : "Checking the script failed.",
      });
    }
  };

  const keepIssue = (quote: string) => {
    setIssues((prev) => prev.filter((issue) => issue.quote !== quote));
  };

  const applyFix = (issue: ScriptIssue) => {
    setText(applyScriptReplacement(text, issue.quote, issue.replacement));
    keepIssue(issue.quote);
  };

  const playLine = (audioPath: string) => {
    audioRef.current?.pause();
    const audio = new Audio(audioPath);
    audioRef.current = audio;
    void audio.play().catch(() => {
      // A failed play leaves the draft untouched.
    });
  };

  const selection = readSelectionForRender(sel, text);

  return (
    <>
      <main className="script-desk">
        <div className="script-page">
          <div
            className="script-backdrop"
            aria-hidden="true"
            ref={backdropRef}
          >
            {segments.map((segment, i) =>
              segment.mark ? (
                <mark key={i} className={segment.strong ? "bad" : undefined}>
                  {segment.text}
                </mark>
              ) : (
                <span key={i}>{segment.text}</span>
              ),
            )}
          </div>
          <textarea
            ref={areaRef}
            className="script-area"
            aria-label="Scene script"
            placeholder="Write this scene, or ask Muse to draft it."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onSelect={(e) =>
              setSel(
                e.currentTarget.selectionStart === e.currentTarget.selectionEnd
                  ? null
                  : {
                      start: e.currentTarget.selectionStart,
                      end: e.currentTarget.selectionEnd,
                    },
              )
            }
            onScroll={syncScroll}
            spellCheck={false}
          />
        </div>
      </main>
      <aside className="script-tools">
        <div className="script-tool">
          <div className="script-kicker">Muse</div>
          <h3>Write with your story</h3>
          <p className="script-sub">
            Muse knows your canon, and what this channel is allowed to know.
          </p>
          <div className="script-row">
            <button
              className="pill sm"
              onClick={onDraftClick}
              disabled={draft.kind === "working"}
            >
              {draft.kind === "working" ? "Drafting…" : "Draft this scene"}
            </button>
            <button
              className="pill light sm"
              onClick={onRewriteClick}
              disabled={!selection || draft.kind === "working"}
            >
              Rewrite selection
            </button>
          </div>
          {draft.kind === "confirm" ? (
            <div className="script-flag">
              <b>Replace this draft?</b>
              <div className="script-row">
                <button
                  className="pill sm"
                  onClick={() => void runDraft("draft", null)}
                >
                  Replace it
                </button>
                <button
                  className="quiet"
                  onClick={() => setDraft({ kind: "idle" })}
                >
                  Keep my draft
                </button>
              </div>
            </div>
          ) : null}
          {draft.kind === "error" ? (
            <p className="script-note" role="status">
              {draft.message}
            </p>
          ) : null}
        </div>
        <div className="script-tool">
          <h3>Check against canon</h3>
          <div className="script-row">
            <button
              className="pill light sm"
              onClick={() => void runCheck()}
              disabled={check.kind === "working"}
            >
              {check.kind === "working" ? "Checking…" : "Check this script"}
            </button>
          </div>
          {check.kind === "error" ? (
            <p className="script-note" role="status">
              {check.message}
            </p>
          ) : null}
          {ranCheck && check.kind === "idle" && issues.length === 0 ? (
            <p className="script-note" role="status">
              Nothing to fix. This matches your story.
            </p>
          ) : null}
          {issues.map((issue) => (
            <div className="script-flag" key={issue.quote}>
              <b>{KIND_LABEL[issue.kind]}</b> {issue.problem}
              <div className="script-row">
                {revealed.includes(issue.quote) ? null : (
                  <button
                    className="pill light sm"
                    onClick={() =>
                      setRevealed((prev) => [...prev, issue.quote])
                    }
                  >
                    Show fix
                  </button>
                )}
                <button className="quiet" onClick={() => keepIssue(issue.quote)}>
                  Keep it
                </button>
              </div>
              {revealed.includes(issue.quote) ? (
                <div className="script-fix">
                  {issue.replacement.length > 0
                    ? issue.replacement
                    : "Remove this line"}
                  <div className="script-row">
                    <button
                      className="pill sm"
                      onClick={() => applyFix(issue)}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="script-tool">
          <h3>In this scene</h3>
          {(beat?.characterIds ?? []).map((id) => {
            const character = world.characters.find((c) => c.id === id);
            if (!character) return null;
            const lines = character.lines ?? [];
            const latest = lines[lines.length - 1];
            return (
              <div className="script-face" key={id}>
                <i
                  style={
                    character.artPath
                      ? { backgroundImage: `url(${character.artPath})` }
                      : undefined
                  }
                />
                <span>{character.name}</span>
                <button
                  className="script-play"
                  aria-label={`Hear ${character.name}`}
                  disabled={!latest}
                  onClick={() => {
                    if (latest) playLine(latest.audioPath);
                  }}
                >
                  ▶
                </button>
              </div>
            );
          })}
        </div>
        <div className="script-tool">
          <Link
            className="pill"
            style={{ width: "100%" }}
            href={`/projects/${projectId}/video?channel=${encodeURIComponent(channelId)}&part=${encodeURIComponent(partId)}`}
          >
            Turn this into a short
          </Link>
        </div>
      </aside>
    </>
  );
}

/** Selection text for the rewrite button state, derived at render. */
function readSelectionForRender(
  sel: { start: number; end: number } | null,
  text: string,
): string {
  if (!sel || sel.start === sel.end) return "";
  return text.slice(sel.start, sel.end);
}

function ScriptPageInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, world, updateWorld } = useProject();

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

  const go = (channelId: string, partId: string) => {
    router.push(
      `/projects/${params.id}/script?channel=${encodeURIComponent(channelId)}&part=${encodeURIComponent(partId)}`,
    );
  };

  return (
    <div className="script-layout">
      <aside className="script-side" aria-label="Scenes">
        {world.channels.map((channel, i) => {
          const here = beats.filter((b) => b.channelId === channel.id);
          if (here.length === 0) return null;
          return (
            <div className="script-group" key={channel.id}>
              <h4>
                <i
                  className="script-dot"
                  style={{ background: channelColorByIndex(i) }}
                />
                {channel.name}
              </h4>
              {here.map((b) => (
                <button
                  key={b.id}
                  className={`script-item${b.id === beat.id ? " on" : ""}`}
                  onClick={() => go(b.channelId, b.partId)}
                >
                  {b.unitLabel} · {b.title}
                </button>
              ))}
            </div>
          );
        })}
      </aside>
      <ScriptEditor
        key={`${beat.channelId}::${beat.partId}`}
        world={world}
        onWorld={updateWorld}
        channelId={beat.channelId}
        partId={beat.partId}
        beatId={beat.id}
      />
    </div>
  );
}

export default function ScriptPage() {
  return (
    <Suspense>
      <ScriptPageInner />
    </Suspense>
  );
}
