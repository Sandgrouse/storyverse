"use client";

import "@/app/script.css";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { MissingStory, useProject } from "@/components/projects/ProjectContext";
import {
  ACTION_STARTERS,
  CHARACTER_CUE_SUFFIXES,
  DESIGN_BLOCK_HEADINGS,
  DESIGN_CAMERAS,
  DESIGN_CONTROLS,
  DESIGN_GAME_TYPES,
  DESIGN_MECHANICS,
  DESIGN_PROGRESSION,
  DESIGN_SESSION_LENGTHS,
  SCENE_PREFIXES,
  SCENE_TIMES,
  ScriptCheckResponseSchema,
  applyInsertAtCaret,
  applyScriptReplacement,
  composeActionLine,
  composeCameraBlock,
  composeCharacterCue,
  composeControlsBlock,
  composeDialogueBlock,
  composeGameTypeBlock,
  composeGoalBlock,
  composeMechanicsBlock,
  composeProgressionBlock,
  composeSceneHeading,
  filterMentions,
  formatMentionName,
  formForKind,
  highlightSegments,
  highlightTerms,
  initialScriptText,
  insertDesignBlock,
  insertMentionAtCaret,
  mentionCandidates,
  mentionQueryBeforeCaret,
  scriptForScene,
  upsertScript,
  type DesignBlockKind,
  type DesignStoryContext,
  type MentionCandidate,
  type ScriptIssue,
} from "@/lib/script";
import type { World } from "@/lib/world/schemas";
import { channelColorByIndex, stripImageData } from "@/lib/story";

const SAVE_DELAY_MS = 600;

const SCRIPT_HELPERS = [
  { kind: "scene", label: "Scene heading" },
  { kind: "character", label: "Character" },
  { kind: "action", label: "Action" },
  { kind: "dialogue", label: "Dialogue" },
] as const;

type ScriptHelperKind = (typeof SCRIPT_HELPERS)[number]["kind"];

const DESIGN_HELPERS: Array<{ kind: DesignBlockKind; label: string }> = [
  { kind: "gameType", label: "Game type" },
  { kind: "camera", label: "Camera and view" },
  { kind: "mechanics", label: "Core mechanics" },
  { kind: "goal", label: "Goal and ending" },
  { kind: "controls", label: "Controls" },
  { kind: "progression", label: "Progression" },
];

/**
 * Caret position inside the textarea, measured with a hidden mirror
 * that copies the text metrics, so the @ menu opens where the
 * creator is typing. Relative to the textarea's top-left padding box.
 */
function caretOffset(
  area: HTMLTextAreaElement,
  caret: number,
): { top: number; left: number } {
  const style = window.getComputedStyle(area);
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.overflowWrap = "break-word";
  mirror.style.width = `${area.clientWidth}px`;
  mirror.style.font = style.font;
  mirror.style.padding = style.padding;
  mirror.style.border = "0";
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.textContent = area.value.slice(0, caret);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop + Number.parseFloat(style.lineHeight || "0");
  const left = marker.offsetLeft;
  mirror.remove();
  return { top: top - area.scrollTop, left: left - area.scrollLeft };
}

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

/**
 * One helper button with its chooser popover. The popover anchors to
 * the button, takes focus when it opens, closes on Escape and returns
 * focus to the button. Only keyboard and buttons: no pointer-only
 * behavior.
 */
function HelperButton({
  label,
  open,
  onToggle,
  onClose,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      panelRef.current
        ?.querySelector<HTMLElement>("button, input, select, textarea")
        ?.focus();
    }
    if (!open && wasOpen.current) {
      btnRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open ]);

  return (
    <div className="script-helper">
      <button
        ref={btnRef}
        type="button"
        className={`script-chip${open ? " on" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={onToggle}
      >
        {label}
      </button>
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          className="script-pop"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            }
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function PopLabel({ children }: { children: React.ReactNode }) {
  return <div className="script-poplabel">{children}</div>;
}

function SceneHeadingChooser({
  places,
  onPick,
}: {
  places: string[];
  onPick: (snippet: string) => void;
}) {
  const [prefix, setPrefix] = useState<string>(SCENE_PREFIXES[0]);
  const [picked, setPicked] = useState<string>(places[0] ?? "");
  const [typed, setTyped] = useState("");
  const [time, setTime] = useState<string>(SCENE_TIMES[0]);
  const location = typed.trim() || picked;
  return (
    <div>
      <PopLabel>Interior or exterior</PopLabel>
      <div className="script-row" role="group" aria-label="Interior or exterior">
        {SCENE_PREFIXES.map((item) => (
          <button
            key={item}
            type="button"
            className={`script-chip sm${item === prefix ? " on" : ""}`}
            aria-pressed={item === prefix}
            onClick={() => setPrefix(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <PopLabel>Location</PopLabel>
      {places.length > 0 ? (
        <div className="script-row" role="group" aria-label="Location">
          {places.map((name) => (
            <button
              key={name}
              type="button"
              className={`script-chip sm${name === picked && !typed.trim() ? " on" : ""}`}
              aria-pressed={name === picked && !typed.trim()}
              onClick={() => {
                setPicked(name);
                setTyped("");
              }}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}
      <input
        type="text"
        className="script-popinput"
        aria-label="Or type a location"
        placeholder="Or type a location"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      <PopLabel>Time</PopLabel>
      <div className="script-row" role="group" aria-label="Time">
        {SCENE_TIMES.map((item) => (
          <button
            key={item}
            type="button"
            className={`script-chip sm${item === time ? " on" : ""}`}
            aria-pressed={item === time}
            onClick={() => setTime(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="script-row">
        <button
          type="button"
          className="pill sm"
          onClick={() => onPick(`${composeSceneHeading(prefix, location, time)}\n`)}
        >
          Insert heading
        </button>
      </div>
    </div>
  );
}

function CharacterChooser({
  names,
  onPick,
}: {
  names: string[];
  onPick: (snippet: string) => void;
}) {
  const [name, setName] = useState(names[0] ?? "");
  const [suffix, setSuffix] = useState("");
  return (
    <div>
      <PopLabel>Character</PopLabel>
      {names.length > 0 ? (
        <div className="script-row" role="group" aria-label="Character">
          {names.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={`script-chip sm${candidate === name ? " on" : ""}`}
              aria-pressed={candidate === name}
              onClick={() => setName(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>
      ) : (
        <p className="script-note">No characters yet.</p>
      )}
      <PopLabel>Voice tag</PopLabel>
      <div className="script-row" role="group" aria-label="Voice tag">
        {CHARACTER_CUE_SUFFIXES.map((item) => (
          <button
            key={item || "plain"}
            type="button"
            className={`script-chip sm${item === suffix ? " on" : ""}`}
            aria-pressed={item === suffix}
            onClick={() => setSuffix(item)}
          >
            {item || "Plain"}
          </button>
        ))}
      </div>
      <div className="script-row">
        <button
          type="button"
          className="pill sm"
          onClick={() => onPick(`${composeCharacterCue(name, suffix)}\n`)}
        >
          Insert cue
        </button>
      </div>
    </div>
  );
}

function DialogueChooser({
  names,
  onPick,
}: {
  names: string[];
  onPick: (snippet: string) => void;
}) {
  const [speaker, setSpeaker] = useState(names[0] ?? "");
  const [aside, setAside] = useState("");
  return (
    <div>
      <PopLabel>Speaker</PopLabel>
      {names.length > 0 ? (
        <div className="script-row" role="group" aria-label="Speaker">
          {names.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={`script-chip sm${candidate === speaker ? " on" : ""}`}
              aria-pressed={candidate === speaker}
              onClick={() => setSpeaker(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>
      ) : (
        <p className="script-note">No characters yet.</p>
      )}
      <PopLabel>Parenthetical (optional)</PopLabel>
      <input
        type="text"
        className="script-popinput"
        aria-label="Parenthetical"
        placeholder="e.g. softly"
        value={aside}
        onChange={(e) => setAside(e.target.value)}
      />
      <div className="script-row">
        <button
          type="button"
          className="pill sm"
          onClick={() => onPick(composeDialogueBlock(speaker, aside))}
        >
          Insert dialogue
        </button>
      </div>
    </div>
  );
}

function ActionChooser({ onPick }: { onPick: (snippet: string) => void }) {
  const [starter, setStarter] = useState("");
  return (
    <div>
      <PopLabel>Start with (optional)</PopLabel>
      <div className="script-row" role="group" aria-label="Action starter">
        <button
          type="button"
          className={`script-chip sm${starter === "" ? " on" : ""}`}
          aria-pressed={starter === ""}
          onClick={() => setStarter("")}
        >
          Blank line
        </button>
        {ACTION_STARTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={`script-chip sm${item === starter ? " on" : ""}`}
            aria-pressed={item === starter}
            onClick={() => setStarter(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="script-row">
        <button
          type="button"
          className="pill sm"
          onClick={() => onPick(composeActionLine(starter))}
        >
          Insert action
        </button>
      </div>
    </div>
  );
}

function SingleChooser({
  options,
  initial,
  action,
  onConfirm,
}: {
  options: readonly string[];
  initial: string;
  action: string;
  onConfirm: (choice: string) => void;
}) {
  const [choice, setChoice] = useState(initial);
  return (
    <div>
      <div className="script-row" role="group" aria-label={action}>
        {options.map((item) => (
          <button
            key={item}
            type="button"
            className={`script-chip sm${item === choice ? " on" : ""}`}
            aria-pressed={item === choice}
            onClick={() => setChoice(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="script-row">
        <button type="button" className="pill sm" onClick={() => onConfirm(choice)}>
          {action}
        </button>
      </div>
    </div>
  );
}

function MultiChooser({
  options,
  action,
  onConfirm,
}: {
  options: readonly string[];
  action: string;
  onConfirm: (choices: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (item: string) =>
    setPicked((prev) =>
      prev.includes(item) ? prev.filter((entry) => entry !== item) : [...prev, item],
    );
  return (
    <div>
      <div className="script-row" role="group" aria-label={action}>
        {options.map((item) => (
          <button
            key={item}
            type="button"
            className={`script-chip sm${picked.includes(item) ? " on" : ""}`}
            aria-pressed={picked.includes(item)}
            onClick={() => toggle(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="script-row">
        <button
          type="button"
          className="pill sm"
          disabled={picked.length === 0}
          onClick={() => onConfirm(picked)}
        >
          {action}
        </button>
      </div>
    </div>
  );
}

function GoalChooser({ onConfirm }: { onConfirm: (goal: { win: string; lose: string; session: string }) => void }) {
  const [win, setWin] = useState("");
  const [lose, setLose] = useState("");
  const [session, setSession] = useState("");
  return (
    <div>
      <PopLabel>Win condition</PopLabel>
      <input
        type="text"
        className="script-popinput"
        aria-label="Win condition"
        placeholder="e.g. reach the far bank"
        value={win}
        onChange={(e) => setWin(e.target.value)}
      />
      <PopLabel>Lose condition</PopLabel>
      <input
        type="text"
        className="script-popinput"
        aria-label="Lose condition"
        placeholder="e.g. the current takes Ada"
        value={lose}
        onChange={(e) => setLose(e.target.value)}
      />
      <PopLabel>Session length</PopLabel>
      <div className="script-row" role="group" aria-label="Session length">
        {DESIGN_SESSION_LENGTHS.map((item) => (
          <button
            key={item}
            type="button"
            className={`script-chip sm${item === session ? " on" : ""}`}
            aria-pressed={item === session}
            onClick={() => setSession((prev) => (prev === item ? "" : item))}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="script-row">
        <button
          type="button"
          className="pill sm"
          onClick={() => onConfirm({ win, lose, session })}
        >
          Insert goal
        </button>
      </div>
    </div>
  );
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
  const [mention, setMention] = useState<{
    query: string;
    active: number;
  } | null>(null);
  const [mentionAt, setMentionAt] = useState({ top: 0, left: 0 });

  const beat = world.beats.find((b) => b.id === beatId);
  const form = formForKind(
    world.channels.find((c) => c.id === channelId)?.kind ?? "series",
  );
  const candidates = useMemo(() => mentionCandidates(world), [world]);
  const matches = useMemo(
    () => (mention ? filterMentions(candidates, mention.query) : []),
    [mention, candidates],
  );
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

  const refreshMention = (value: string, caret: number) => {
    const query = mentionQueryBeforeCaret(value, caret);
    if (query === null) {
      setMention(null);
      return;
    }
    setMention((prev) => ({ query, active: prev ? prev.active : 0 }));
    const area = areaRef.current;
    if (area) {
      try {
        setMentionAt(caretOffset(area, caret));
      } catch {
        // The menu stays where it was; typing still filters it.
      }
    }
  };

  const pickMention = (candidate: MentionCandidate) => {
    const area = areaRef.current;
    const caret = area ? area.selectionStart : text.length;
    const next = insertMentionAtCaret(
      text,
      caret,
      formatMentionName(candidate, form),
    );
    setText(next.text);
    setMention(null);
    requestAnimationFrame(() => {
      if (!area) return;
      area.focus();
      area.setSelectionRange(next.caret, next.caret);
    });
  };

  const onTextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mention || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMention((prev) =>
        prev
          ? { query: prev.query, active: (prev.active + 1) % matches.length }
          : prev,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMention((prev) =>
        prev
          ? {
              query: prev.query,
              active: (prev.active - 1 + matches.length) % matches.length,
            }
          : prev,
      );
    } else if (e.key === "Enter") {
      const picked = matches[Math.min(mention.active, matches.length - 1)];
      if (picked) {
        e.preventDefault();
        pickMention(picked);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMention(null);
    }
  };

  const [helper, setHelper] = useState<string | null>(null);
  const helperAt = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  const openHelper = (kind: string) => {
    const area = areaRef.current;
    helperAt.current = area
      ? { start: area.selectionStart, end: area.selectionEnd }
      : { start: text.length, end: text.length };
    setHelper((prev) => (prev === kind ? null : kind));
  };

  const focusAfterInsert = (caret: number) => {
    requestAnimationFrame(() => {
      const area = areaRef.current;
      if (!area) return;
      area.focus();
      area.setSelectionRange(caret, caret);
    });
  };

  const pickSnippet = (snippet: string) => {
    const { start, end } = helperAt.current;
    const next = applyInsertAtCaret(text, start, end, snippet);
    setText(next.text);
    setMention(null);
    setHelper(null);
    focusAfterInsert(next.caret);
  };

  const pickDesignBlock = (heading: string, block: string) => {
    const next = insertDesignBlock(text, heading, block);
    setText(next.text);
    setMention(null);
    setHelper(null);
    focusAfterInsert(next.caret);
  };

  const designContext: DesignStoryContext = useMemo(() => {
    const part = world.parts.find((entry) => entry.id === partId);
    return {
      partTitle: part?.title,
      partSummary: part?.summary,
      characterNames: world.characters.map((c) => c.name),
      locationNames: world.locations.map((l) => l.name),
    };
  }, [world, partId]);

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
        {form === "script" ? (
          <div className="script-insert" role="toolbar" aria-label="Insert a line">
            {SCRIPT_HELPERS.map((button) => (
              <HelperButton
                key={button.kind}
                label={button.label}
                open={helper === button.kind}
                onToggle={() => openHelper(button.kind)}
                onClose={() => setHelper(null)}
              >
                {button.kind === "scene" ? (
                  <SceneHeadingChooser
                    places={designContext.locationNames ?? []}
                    onPick={pickSnippet}
                  />
                ) : button.kind === "character" ? (
                  <CharacterChooser
                    names={designContext.characterNames ?? []}
                    onPick={pickSnippet}
                  />
                ) : button.kind === "dialogue" ? (
                  <DialogueChooser
                    names={designContext.characterNames ?? []}
                    onPick={pickSnippet}
                  />
                ) : (
                  <ActionChooser onPick={pickSnippet} />
                )}
              </HelperButton>
            ))}
          </div>
        ) : null}
        {form === "design" ? (
          <div className="script-insert" role="toolbar" aria-label="Insert a design block">
            {DESIGN_HELPERS.map((button) => (
              <HelperButton
                key={button.kind}
                label={button.label}
                open={helper === button.kind}
                onToggle={() => openHelper(button.kind)}
                onClose={() => setHelper(null)}
              >
                {button.kind === "gameType" ? (
                  <SingleChooser
                    options={DESIGN_GAME_TYPES}
                    initial="Hunt and chase"
                    action="Insert game type"
                    onConfirm={(choice) =>
                      pickDesignBlock(
                        DESIGN_BLOCK_HEADINGS.gameType,
                        composeGameTypeBlock(choice, designContext),
                      )
                    }
                  />
                ) : button.kind === "camera" ? (
                  <SingleChooser
                    options={DESIGN_CAMERAS}
                    initial={DESIGN_CAMERAS[0]}
                    action="Insert camera"
                    onConfirm={(choice) =>
                      pickDesignBlock(
                        DESIGN_BLOCK_HEADINGS.camera,
                        composeCameraBlock(choice),
                      )
                    }
                  />
                ) : button.kind === "mechanics" ? (
                  <MultiChooser
                    options={DESIGN_MECHANICS}
                    action="Insert mechanics"
                    onConfirm={(choices) =>
                      pickDesignBlock(
                        DESIGN_BLOCK_HEADINGS.mechanics,
                        composeMechanicsBlock(choices),
                      )
                    }
                  />
                ) : button.kind === "goal" ? (
                  <GoalChooser
                    onConfirm={(goal) =>
                      pickDesignBlock(
                        DESIGN_BLOCK_HEADINGS.goal,
                        composeGoalBlock(goal),
                      )
                    }
                  />
                ) : button.kind === "controls" ? (
                  <MultiChooser
                    options={DESIGN_CONTROLS}
                    action="Insert controls"
                    onConfirm={(choices) =>
                      pickDesignBlock(
                        DESIGN_BLOCK_HEADINGS.controls,
                        composeControlsBlock(choices),
                      )
                    }
                  />
                ) : (
                  <MultiChooser
                    options={DESIGN_PROGRESSION}
                    action="Insert progression"
                    onConfirm={(choices) =>
                      pickDesignBlock(
                        DESIGN_BLOCK_HEADINGS.progression,
                        composeProgressionBlock(choices),
                      )
                    }
                  />
                )}
              </HelperButton>
            ))}
          </div>
        ) : null}
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
            aria-label={
              form === "design"
                ? "Game design document"
                : form === "copy"
                  ? "Page copy"
                  : "Scene script"
            }
            placeholder={
              form === "design"
                ? "Write the design, or ask Muse to draft it. Type @ for names."
                : form === "copy"
                  ? "Write the copy, or ask Muse to draft it. Type @ for names."
                  : "Write this scene, or ask Muse to draft it. Type @ for names."
            }
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              refreshMention(e.target.value, e.target.selectionStart);
            }}
            onKeyDown={onTextKeyDown}
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
          {mention && matches.length > 0 ? (
            <div
              className="script-mentions"
              role="listbox"
              aria-label="Mention a name"
              style={{ top: mentionAt.top, left: mentionAt.left }}
            >
              {matches
                .slice(0, 8)
                .map((candidate, index) => (
                  <button
                    key={`${candidate.kind}:${candidate.name}`}
                    role="option"
                    aria-selected={index === Math.min(mention.active, 7)}
                    className={
                      index === Math.min(mention.active, 7)
                        ? "script-mention on"
                        : "script-mention"
                    }
                    onMouseDown={(e) => {
                      // Pick before the textarea loses focus.
                      e.preventDefault();
                      pickMention(candidate);
                    }}
                  >
                    <span>{candidate.name}</span>
                    <i>{candidate.kind}</i>
                  </button>
                ))}
            </div>
          ) : null}
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
              {draft.kind === "working"
                ? "Drafting…"
                : form === "design"
                  ? "Draft the design"
                  : form === "copy"
                    ? "Draft the copy"
                    : "Draft this scene"}
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
              {check.kind === "working"
                ? "Checking…"
                : form === "design"
                  ? "Check this design"
                  : form === "copy"
                    ? "Check this copy"
                    : "Check this script"}
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
        {form === "copy" ? null : (
          <div className="script-tool">
            {form === "design" ? (
              <Link
                className="pill"
                style={{ width: "100%" }}
                href={`/projects/${projectId}/package`}
              >
                Open the agent package
              </Link>
            ) : (
              <>
                <Link
                  className="pill"
                  style={{ width: "100%" }}
                  href={`/projects/${projectId}/storyboard?channel=${encodeURIComponent(channelId)}&part=${encodeURIComponent(partId)}`}
                >
                  Make a storyboard
                </Link>
                <Link
                  className="pill light"
                  style={{ width: "100%", marginTop: 8 }}
                  href={`/projects/${projectId}/video?channel=${encodeURIComponent(channelId)}&part=${encodeURIComponent(partId)}`}
                >
                  Make a video
                </Link>
              </>
            )}
          </div>
        )}
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
