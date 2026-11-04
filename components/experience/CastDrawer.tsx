"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Character, World } from "@/lib/world/schemas";
import {
  EXTRA_POSES,
  SHEET_VIEWS,
  orderedSheetViews,
  poseIdFor,
  poseLabelFor,
} from "@/lib/art";
import {
  filterCharacters,
  resolveCharacterId,
  scenesForCharacter,
} from "@/lib/cast";
import {
  SHEET_CUTOUT_CONCEPT,
  SHEET_CUTOUT_FALLBACK_CONCEPT,
  CutoutResponseSchema,
  compositeCutout,
  readCutoutError,
  type CutoutResponse,
} from "@/lib/cutout";
import {
  artToDataUrl,
  postArtRoute,
  sheetReferenceFor,
  styleImageFor,
  type ArtPostResult,
} from "@/lib/images";
import { stripImageData } from "@/lib/story";
import type { PremadeVoice } from "@/lib/voice";
import type { CharacterVoice } from "@/lib/world/schemas";
import CustomVoice from "@/components/voice/CustomVoice";

type Props = {
  world: World;
  open: boolean;
  onClose: () => void;
  onWorld: (world: World) => void;
};

type SlotState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; message: string }
  | { kind: "blocked"; message: string; description: string };

type CutoutState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; message: string };



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

function withVoice(base: World, characterId: string, voice: CharacterVoice): World {
  return {
    ...base,
    characters: base.characters.map((c) =>
      c.id === characterId ? { ...c, voice } : c,
    ),
  };
}

/**
 * One character's voice: Muse Spark picks a premade ElevenLabs voice and
 * writes a line, ElevenLabs speaks it. Audio never blocks sheet work:
 * this section keeps its own state and never touches the sheet flags.
 */
function VoiceSection({
  world,
  open,
  character,
  onWorld,
}: {
  world: World;
  open: boolean;
  character: Character;
  onWorld: (world: World) => void;
}) {
  const [voices, setVoices] = useState<PremadeVoice[] | null>(null);
  const [provider, setProvider] = useState<"fish" | "elevenlabs" | null>(null);
  const [listState, setListState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [listError, setListError] = useState("");
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(character.voice?.reason ?? null);
  const [line, setLine] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [speakError, setSpeakError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadList = async () => {
    setListState("loading");
    setListError("");
    try {
      const res = await fetch("/api/voice/list");
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 503) {
          setListState("missing");
          return;
        }
        setListState("error");
        setListError(voiceErrorMessage(json, "The voices failed to load."));
        return;
      }
      const list =
        json !== null && typeof json === "object" && Array.isArray((json as Record<string, unknown>).voices)
          ? ((json as Record<string, unknown>).voices as PremadeVoice[])
          : [];
      const record = json !== null && typeof json === "object" ? (json as Record<string, unknown>) : null;
      setVoices(list);
      setProvider(record?.provider === "fish" ? "fish" : "elevenlabs");
      setListState("ready");
    } catch {
      setListState("error");
      setListError("The voices failed to load.");
    }
  };

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const storedVoice = character.voice;
  const lines = character.lines ?? [];
  const selectedId = pickedId ?? storedVoice?.id ?? null;
  const customOption =
    storedVoice?.kind === "custom"
      ? { id: storedVoice.id, name: `${storedVoice.name} (custom)`, labels: {}, previewUrl: "" }
      : null;
  const orderedVoices: PremadeVoice[] = [...(customOption ? [customOption] : []), ...(voices ?? [])];
  const selected = orderedVoices.find((v) => v.id === selectedId) ?? null;
  const tabIndex = open ? 0 : -1;

  const stopAudio = () => {
    audioRef.current?.pause();
    setPlaying(null);
  };

  const playSrc = (key: string, src: string) => {
    if (!src) return;
    let el = audioRef.current;
    if (!el) {
      el = new Audio();
      el.onended = () => setPlaying(null);
      audioRef.current = el;
    }
    if (playing === key) {
      el.pause();
      setPlaying(null);
      return;
    }
    try {
      el.src = src;
      el.play()
        .then(() => setPlaying(key))
        .catch(() => setPlaying(null));
    } catch {
      setPlaying(null);
    }
  };

  const findVoice = async () => {
    if (finding || !voices) return;
    setFinding(true);
    setFindError(null);
    try {
      const res = await fetch("/api/voice/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          world: stripImageData(world),
          characterId: character.id,
          voices: voices.map((voice) => ({
            id: voice.id,
            name: voice.name,
            labels: voice.labels,
          })),
        }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 503) {
          setListState("missing");
          return;
        }
        setFindError(voiceErrorMessage(json, "Choosing a voice failed."));
        return;
      }
      const record = json !== null && typeof json === "object" ? (json as Record<string, unknown>) : null;
      const voiceId = record?.voiceId;
      const suggestion = record?.reason;
      const suggestionLine = record?.line;
      if (typeof voiceId !== "string" || typeof suggestionLine !== "string") {
        setFindError("Choosing a voice failed.");
        return;
      }
      const match = voices.find((voice) => voice.id === voiceId);
      if (!match) {
        setFindError("That voice isn't in the list.");
        return;
      }
      const nextReason = typeof suggestion === "string" ? suggestion : null;
      setPickedId(voiceId);
      setReason(nextReason);
      setLine(suggestionLine);
      onWorld(withVoice(world, character.id, { id: voiceId, name: match.name, reason: nextReason ?? undefined }));
    } catch {
      setFindError("Choosing a voice failed.");
    } finally {
      setFinding(false);
    }
  };

  const chooseVoice = (id: string) => {
    if (customOption && id === customOption.id && storedVoice) {
      setPickedId(id);
      setReason(null);
      onWorld(withVoice(world, character.id, storedVoice));
      return;
    }
    const match = voices?.find((voice) => voice.id === id);
    if (!match) return;
    setPickedId(id);
    setReason(null);
    onWorld(withVoice(world, character.id, { id: match.id, name: match.name }));
  };

  const speak = async () => {
    const text = line.trim();
    if (speaking || !selectedId || text.length === 0 || text.length > 300) return;
    setSpeaking(true);
    setSpeakError(null);
    const isCustom = customOption?.id === selectedId;
    let ownerCode = "";
    try {
      ownerCode = sessionStorage.getItem("voice-owner-code") ?? "";
    } catch {
      ownerCode = "";
    }
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(isCustom ? { "x-voice-owner-code": ownerCode } : {}),
        },
        body: JSON.stringify({
          voiceId: selectedId,
          text,
          pronunciations: world.pronunciations ?? [],
        }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 503) {
          setListState("missing");
          return;
        }
        setSpeakError(voiceErrorMessage(json, "The voice failed."));
        return;
      }
      const record = json !== null && typeof json === "object" ? (json as Record<string, unknown>) : null;
      const audioDataUrl = record?.audioDataUrl;
      if (typeof audioDataUrl !== "string" || !audioDataUrl.startsWith("data:audio/")) {
        setSpeakError("The voice failed.");
        return;
      }
      const entry = { id: newLineId(), text, audioPath: audioDataUrl };
      onWorld({
        ...world,
        characters: world.characters.map((c) =>
          c.id === character.id ? { ...c, lines: [...(c.lines ?? []), entry] } : c,
        ),
      });
    } catch {
      setSpeakError("The voice failed.");
    } finally {
      setSpeaking(false);
    }
  };

  const removeLine = (id: string) => {
    if (playing === id) stopAudio();
    onWorld({
      ...world,
      characters: world.characters.map((c) =>
        c.id === character.id ? { ...c, lines: (c.lines ?? []).filter((entry) => entry.id !== id) } : c,
      ),
    });
  };

  if (listState === "missing") {
    return (
      <div className="sheetwrap">
        <div className="sheethead">
          <span className="kicker">Voice</span>
        </div>
        <div className="artstate">
          <p>Voices aren&apos;t set up here yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sheetwrap">
      <div className="sheethead">
        <span className="kicker">Voice</span>
      </div>
      {listState === "loading" && (
        <div className="artstate">
          <p>Loading voices…</p>
        </div>
      )}
      {listState === "error" && (
        <div className="artstate">
          <p>{listError}</p>
          <button type="button" className="quiet" onClick={() => void loadList()} tabIndex={tabIndex}>
            Retry
          </button>
        </div>
      )}
      {listState === "ready" && !selectedId && !finding && (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="pill" onClick={() => void findVoice()} tabIndex={tabIndex}>
            Find a voice
          </button>
        </div>
      )}
      {listState === "ready" && finding && (
        <div className="artstate">
          <p>Listening for {character.name}&apos;s voice…</p>
        </div>
      )}
      {findError && (
        <div className="artstate">
          <p>{findError}</p>
        </div>
      )}
      {listState === "ready" && selectedId && (
        <>
          <div style={{ marginTop: 10 }}>
            <select
              aria-label={`Voice for ${character.name}`}
              value={selectedId}
              onChange={(e) => chooseVoice(e.target.value)}
              tabIndex={tabIndex}
              style={{
                font: "inherit",
                color: "inherit",
                background: "var(--sheet)",
                border: "1px solid var(--rule)",
                borderRadius: 10,
                padding: "8px 10px",
                maxWidth: "100%",
              }}
            >
              {orderedVoices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>
          {reason && (
            <div className="artstate">
              <p>{reason}</p>
            </div>
          )}
          <div>
            <button
              type="button"
              className="quiet"
              onClick={() => selected?.previewUrl && playSrc("preview", selected.previewUrl)}
              disabled={!selected?.previewUrl}
              tabIndex={tabIndex}
            >
              {playing === "preview" ? "Stop the preview" : "Hear this voice"}
            </button>
          </div>
          <div className="artstate">
            <textarea
              aria-label={`Line for ${character.name}`}
              value={line}
              onChange={(e) => setLine(e.target.value)}
              rows={3}
              tabIndex={tabIndex}
            />
            <span>{line.length} / 300</span>
            <div>
              <button
                type="button"
                className="pill"
                onClick={() => void speak()}
                disabled={speaking || line.trim().length === 0 || line.trim().length > 300}
                tabIndex={tabIndex}
              >
                {speaking ? "Speaking…" : "Speak this line"}
              </button>
            </div>
            {speakError && <p>{speakError}</p>}
          </div>
          {lines.length > 0 && (
            <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {lines.map((entry) => (
                <li key={entry.id} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <button type="button" className="quiet" onClick={() => playSrc(entry.id, entry.audioPath)} tabIndex={tabIndex}>
                    {playing === entry.id ? "Stop" : "Play"}
                  </button>
                  <span style={{ flex: 1, fontSize: 13 }}>{entry.text}</span>
                  <button type="button" className="quiet" onClick={() => removeLine(entry.id)} tabIndex={tabIndex}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Pronunciations world={world} onWorld={onWorld} tabIndex={tabIndex} />
      <div className="artstate">
        <p>{provider === "fish" ? "Voices by Fish Audio." : "Voices by ElevenLabs."}</p>
      </div>
    </div>
  );
}

/**
 * "How names are said": the story keeps real names everywhere; only
 * spoken audio uses these. Fish Audio gets them as a pronunciation
 * dictionary, ElevenLabs as plain text replacements.
 */
function Pronunciations({
  world,
  onWorld,
  tabIndex,
}: {
  world: World;
  onWorld: (world: World) => void;
  tabIndex: number;
}) {
  const entries = world.pronunciations ?? [];
  const setEntry = (index: number, patch: { name?: string; sayAs?: string }) => {
    onWorld({
      ...world,
      pronunciations: entries.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry,
      ),
    });
  };
  return (
    <div style={{ marginTop: 12 }}>
      <div className="vx-sub" style={{ marginBottom: 4 }}>How names are said</div>
      {entries.map((entry, i) => (
        <div key={i} className="row" style={{ marginBottom: 6 }}>
          <input
            type="text"
            aria-label="Name"
            placeholder="Name"
            value={entry.name}
            onChange={(e) => setEntry(i, { name: e.target.value })}
            tabIndex={tabIndex}
            style={{ flex: 1, font: "inherit", color: "inherit", background: "var(--sheet)", border: "1px solid var(--rule)", borderRadius: 10, padding: "8px 10px" }}
          />
          <input
            type="text"
            aria-label="Say it as"
            placeholder="Say it as"
            value={entry.sayAs}
            onChange={(e) => setEntry(i, { sayAs: e.target.value })}
            tabIndex={tabIndex}
            style={{ flex: 1, font: "inherit", color: "inherit", background: "var(--sheet)", border: "1px solid var(--rule)", borderRadius: 10, padding: "8px 10px" }}
          />
          <button
            type="button"
            className="quiet"
            onClick={() =>
              onWorld({ ...world, pronunciations: entries.filter((_, j) => j !== i) })
            }
            tabIndex={tabIndex}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="quiet"
        onClick={() =>
          onWorld({ ...world, pronunciations: [...entries, { name: "", sayAs: "" }] })
        }
        tabIndex={tabIndex}
      >
        Add a name
      </button>
    </div>
  );
}

/** The `?c=` query value, if the browser has one. */
function paramCharacterId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get("c");
  } catch {
    return null;
  }
}

function portraitFor(character: Character): string | undefined {
  return character.artPath ?? character.sheet[0]?.imagePath;
}

export default function CastDrawer({ world, open, onClose, onWorld }: Props) {
  // The selection lives in the URL as `?c=<character-id>`: it survives
  // reloads and other pages can link to one character. Next's router
  // is left alone so this also renders in tests without a router.
  const [urlChar, setUrlChar] = useState<string | null>(() => paramCharacterId());
  useEffect(() => {
    const sync = () => setUrlChar(paramCharacterId());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const select = (id: string) => {
    setUrlChar(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("c", id);
      window.history.replaceState(null, "", url);
    } catch {
      // A URL that cannot be rewritten still keeps the local selection.
    }
  };
  const selected: Character | undefined =
    world.characters.find((c) => c.id === (urlChar ?? resolveCharacterId(world, null))) ??
    world.characters[0];

  const [slots, setSlots] = useState<Record<string, SlotState>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [cutouts, setCutouts] = useState<Record<string, CutoutState>>({});
  const [running, setRunning] = useState(false);
  const [cuttingAll, setCuttingAll] = useState(false);
  const [poseText, setPoseText] = useState("");
  const runRef = useRef(0);
  const respIds = useRef<Record<string, string>>({});

  // A new character gets fresh slots.
  useEffect(() => {
    setSlots({});
    setDrafts({});
    setCutouts({});
    setRunning(false);
    setCuttingAll(false);
    setPoseText("");
    runRef.current += 1;
  }, [selected?.id]);

  /** True while any cutout is in flight: sheet work waits for cutouts. */
  const cutting =
    cuttingAll || Object.values(cutouts).some((s) => s.kind === "working");

  const [query, setQuery] = useState("");
  const visible = useMemo(
    () => filterCharacters(world.characters, query),
    [world.characters, query],
  );

  const scenes = useMemo(
    () => (selected ? scenesForCharacter(world, world.id, selected.id) : []),
    [world, selected],
  );

  const largeArt = selected ? portraitFor(selected) : undefined;

  const markSlot = (view: string, state: SlotState) =>
    setSlots((prev) => ({ ...prev, [view]: state }));

  const postView = (payload: Record<string, unknown>): Promise<ArtPostResult> =>
    postArtRoute("/api/art/sheet-view", payload);

  const applyView = (
    base: World,
    characterId: string,
    view: string,
    imageBase64: string,
    hadArt: boolean,
  ): World => ({
    ...base,
    characters: base.characters.map((c) => {
      if (c.id !== characterId) return c;
      const sheet = c.sheet.some((v) => v.view === view)
        ? c.sheet.map((v) =>
            v.view === view
              ? { ...v, imagePath: `data:image/webp;base64,${imageBase64}` }
              : v,
          )
        : [...c.sheet, { view, imagePath: `data:image/webp;base64,${imageBase64}` }];
      const artPath =
        !hadArt && view === "front"
          ? `data:image/webp;base64,${imageBase64}`
          : c.artPath;
      return { ...c, sheet, artPath };
    }),
  });

  const runSheet = async (character: Character) => {
    if (cutting) return;
    const run = runRef.current + 1;
    runRef.current = run;
    respIds.current = {};
    setRunning(true);
    const fresh: Record<string, SlotState> = {};
    for (const view of SHEET_VIEWS) fresh[view.id] = { kind: "working" };
    setSlots(fresh);
    setDrafts({});

    let current: World = world;
    const hadArt = (character.artPath?.length ?? 0) > 0;
    const reference = await sheetReferenceFor(character.artPath);
    if (runRef.current !== run) return;
    const style = reference ? undefined : await styleImageFor(world);
    if (runRef.current !== run) return;

    // Start clean, but keep extra poses already made; each base
    // view fills its slot as it arrives.
    current = {
      ...current,
      characters: current.characters.map((c) =>
        c.id === character.id
          ? {
              ...c,
              sheet: c.sheet.filter(
                (v) => !SHEET_VIEWS.some((base) => base.id === v.view),
              ),
            }
          : c,
      ),
    };
    onWorld(current);

    for (const view of SHEET_VIEWS) {
      if (runRef.current !== run) return;
      markSlot(view.id, { kind: "working" });
      const payload: Record<string, unknown> = {
        view: view.id,
        character: {
          id: character.id,
          name: character.name,
          canon: character.canon,
        },
      };
      if (view.id === "front") {
        if (reference) payload.referenceImage = reference;
        else if (style) payload.styleImage = style;
      } else {
        const index = SHEET_VIEWS.findIndex((v) => v.id === view.id);
        const prevId = index > 0 ? SHEET_VIEWS[index - 1]?.id : undefined;
        const prevResponse = prevId ? respIds.current[prevId] : undefined;
        if (prevResponse) payload.previousResponseId = prevResponse;
        else if (reference) payload.referenceImage = reference;
        else if (style) payload.styleImage = style;
      }
      const result = await postView(payload);
      if (runRef.current !== run) return;
      if (result.ok) {
        respIds.current[view.id] = result.responseId;
        current = applyView(current, character.id, view.id, result.imageBase64, hadArt);
        onWorld(current);
        markSlot(view.id, { kind: "idle" });
      } else if (result.kind === "blocked") {
        markSlot(view.id, {
          kind: "blocked",
          message: result.message,
          description: result.description,
        });
        setDrafts((prev) =>
          prev[view.id] === undefined
            ? { ...prev, [view.id]: result.description }
            : prev,
        );
      } else {
        markSlot(view.id, { kind: "error", message: result.message });
      }
    }
    if (runRef.current === run) setRunning(false);
  };

  const retryView = async (character: Character, viewId: string) => {
    if (running || cutting) return;
    const run = runRef.current + 1;
    runRef.current = run;
    setRunning(true);
    markSlot(viewId, { kind: "working" });

    const index = SHEET_VIEWS.findIndex((v) => v.id === viewId);
    const payload: Record<string, unknown> = {
      view: viewId,
      character: {
        id: character.id,
        name: character.name,
        canon: character.canon,
      },
    };
    const draft = drafts[viewId]?.trim();
    if (draft) payload.description = draft;
    if (index <= 0) {
      const reference = await sheetReferenceFor(character.artPath);
      if (runRef.current !== run) return;
      if (reference && !draft) payload.referenceImage = reference;
    } else {
      const prevId = SHEET_VIEWS[index - 1]?.id;
      const prevResponse = prevId ? respIds.current[prevId] : undefined;
      if (prevResponse && !draft) {
        payload.previousResponseId = prevResponse;
      } else {
        const reference = await sheetReferenceFor(character.artPath);
        if (runRef.current !== run) return;
        if (reference && !draft) payload.referenceImage = reference;
      }
    }

    let current: World = world;
    const result = await postView(payload);
    if (runRef.current !== run) return;
    if (result.ok) {
      respIds.current[viewId] = result.responseId;
      const hadArt = (character.artPath?.length ?? 0) > 0;
      current = applyView(current, character.id, viewId, result.imageBase64, hadArt);
      onWorld(current);
      markSlot(viewId, { kind: "idle" });
    } else if (result.kind === "blocked") {
      markSlot(viewId, {
        kind: "blocked",
        message: result.message,
        description: result.description,
      });
      setDrafts((prev) => ({ ...prev, [viewId]: result.description }));
    } else {
      markSlot(viewId, { kind: "error", message: result.message });
    }
    if (runRef.current === run) setRunning(false);
  };

  const stop = () => {
    runRef.current += 1;
    setRunning(false);
    setSlots((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key]?.kind === "working") next[key] = { kind: "idle" };
      }
      return next;
    });
  };

  const sheetByView = useMemo(() => {
    const map = new Map<string, string>();
    for (const view of selected?.sheet ?? []) {
      if (view.imagePath) map.set(view.view, view.imagePath);
    }
    return map;
  }, [selected]);

  const cutoutByView = useMemo(() => {
    const map = new Map<string, string>();
    for (const view of selected?.sheet ?? []) {
      if (view.cutoutPath) map.set(view.view, view.cutoutPath);
    }
    return map;
  }, [selected]);

  /**
   * Every tile in the views grid, in grid order: the base six views,
   * then extra poses already made (or still drawing). Pure order comes
   * from orderedSheetViews so the grid and tests share it.
   */
  const tileIds = useMemo(() => {
    const base = new Set<string>(SHEET_VIEWS.map((view) => view.id));
    const ids: string[] = [...base];
    const push = (view: string) => {
      if (!base.has(view) && !ids.includes(view)) ids.push(view);
    };
    for (const view of selected?.sheet ?? []) push(view.view);
    for (const [view, state] of Object.entries(slots)) {
      if (state.kind !== "idle") push(view);
    }
    return orderedSheetViews(ids.map((view) => ({ view }))).map(
      (entry) => entry.view,
    );
  }, [selected, slots]);

  const labelForTile = (viewId: string): string => poseLabelFor(viewId);

  /** Generate one extra pose view through the sheet-view route. */
  const makePose = async (character: Character, viewId: string) => {
    if (!viewId || running || cutting) return;
    await retryView(character, viewId);
  };

  const makeCustomPose = async (character: Character) => {
    const viewId = poseIdFor(poseText);
    if (!viewId) return;
    setPoseText("");
    await makePose(character, viewId);
  };

  const applyCutout = (
    base: World,
    characterId: string,
    viewId: string,
    cutoutPath: string,
  ): World => ({
    ...base,
    characters: base.characters.map((c) => {
      if (c.id !== characterId) return c;
      return {
        ...c,
        sheet: c.sheet.map((v) =>
          v.view === viewId ? { ...v, cutoutPath } : v,
        ),
      };
    }),
  });

  type CutoutFetch =
    | { ok: true; cutout: CutoutResponse }
    | { ok: false; code?: string; message: string };

  const postCutout = async (
    dataUrl: string,
    concept: string,
  ): Promise<CutoutFetch> => {
    let res: Response;
    try {
      res = await fetch("/api/art/cutout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl, concept }),
      });
    } catch {
      return { ok: false, message: "The cutout failed." };
    }
    if (!res.ok) {
      return { ok: false, ...readCutoutError(await res.json().catch(() => null)) };
    }
    const parsed = CutoutResponseSchema.safeParse(
      await res.json().catch(() => null),
    );
    if (!parsed.success) return { ok: false, message: "The cutout failed." };
    return { ok: true, cutout: parsed.data };
  };

  /** Cut one view out of its background. A failure fails only this view. */
  const runCutout = async (
    base: World,
    character: Character,
    viewId: string,
    source: string,
  ): Promise<World> => {
    if (running) return base;
    setCutouts((prev) => ({ ...prev, [viewId]: { kind: "working" } }));
    try {
      const dataUrl = await artToDataUrl(source);
      if (!dataUrl) throw new Error("Could not read that image.");
      let result = await postCutout(dataUrl, SHEET_CUTOUT_CONCEPT);
      if (!result.ok && result.code === "NO_CUTOUT") {
        result = await postCutout(dataUrl, SHEET_CUTOUT_FALLBACK_CONCEPT);
      }
      if (!result.ok) throw new Error(result.message);
      const png = await compositeCutout(dataUrl, result.cutout);
      const next = applyCutout(base, character.id, viewId, png);
      onWorld(next);
      setCutouts((prev) => ({ ...prev, [viewId]: { kind: "idle" } }));
      return next;
    } catch (error) {
      setCutouts((prev) => ({
        ...prev,
        [viewId]: {
          kind: "error",
          message:
            error instanceof Error ? error.message : "The cutout failed.",
        },
      }));
      return base;
    }
  };

  /**
   * Cut every generated view one at a time, in order. Each view stands
   * alone: one failure blocks nothing else.
   */
  const runCutoutAll = async (character: Character) => {
    if (running || cuttingAll) return;
    setCuttingAll(true);
    try {
      let current: World = world;
      const views = orderedSheetViews(
        (current.characters.find((c) => c.id === character.id)?.sheet ?? []).filter(
          (v) => v.imagePath,
        ),
      );
      for (const view of views) {
        const entry = current.characters
          .find((c) => c.id === character.id)
          ?.sheet.find((v) => v.view === view.view);
        if (!entry?.imagePath) continue;
        current = await runCutout(current, character, view.view, entry.imagePath);
      }
    } finally {
      setCuttingAll(false);
    }
  };

  return (
    <div className={`drawer${open ? " on" : ""}`} aria-hidden={!open}>
      <button
        className="quiet close"
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      >
        Close
      </button>
      <div className="kicker">Characters</div>
      <h2>{selected?.name ?? "Characters"}</h2>
      <div className="castlayout">
        <div className="castside">
          {world.characters.length > 8 && (
            <input
              type="search"
              className="castsearch"
              aria-label="Search characters"
              placeholder="Search characters"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              tabIndex={open ? 0 : -1}
            />
          )}
          <select
            className="castselect"
            aria-label="Choose a character"
            value={selected?.id ?? ""}
            onChange={(e) => {
              if (e.target.value) select(e.target.value);
            }}
            tabIndex={open ? 0 : -1}
          >
            {world.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <ul className="castlistbox" aria-label="Characters">
            {visible.map((c) => {
              const portrait = portraitFor(c);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`castitem${c.id === selected?.id ? " on" : ""}`}
                    aria-current={c.id === selected?.id ? "true" : undefined}
                    onClick={() => select(c.id)}
                    tabIndex={open ? 0 : -1}
                  >
                    {portrait ? (
                      <span
                        className="castthumb"
                        style={{ backgroundImage: `url(${portrait})` }}
                        role="img"
                        aria-label={c.name}
                      />
                    ) : (
                      <span className="castthumb empty" aria-hidden="true" />
                    )}
                    <span className="castname">{c.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {visible.length === 0 && (
            <p className="castempty" role="status">
              No characters match.
            </p>
          )}
        </div>
        <div className="castdetail">
          {selected ? (
            <>
              <div
                className={`castart${largeArt ? "" : " empty"}`}
                style={largeArt ? { backgroundImage: `url(${largeArt})` } : undefined}
                role={largeArt ? "img" : undefined}
                aria-label={largeArt ? selected.name : undefined}
              >
                {!largeArt && <span>No art yet</span>}
              </div>
              <small>Canon</small>
              <p>{selected.canon}</p>
              {selected.secret && (
                <>
                  <small>Secret</small>
                  <p>{selected.secret}</p>
                </>
              )}
              <small>Appears in</small>
              {scenes.length > 0 ? (
                <ul className="appearchips">
                  {scenes.map((scene) => (
                    <li key={`${scene.channelId}::${scene.partId}`}>
                      <Link
                        className="appearchip"
                        href={scene.href}
                        tabIndex={open ? 0 : -1}
                      >
                        {scene.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nowhere yet.</p>
              )}
            </>
          ) : (
            <p role="status">No characters yet.</p>
          )}
        </div>
        <div className="castviews" aria-label="Sheet views">
            {tileIds.map((viewId) => {
              const image = sheetByView.get(viewId);
              const label = labelForTile(viewId);
              const state = slots[viewId] ?? { kind: "idle" as const };
              const cutout = cutoutByView.get(viewId);
              const cutoutState = cutouts[viewId] ?? { kind: "idle" as const };
              return (
                <div key={viewId} className="slot">
                  <div
                    className={`slotimg${state.kind === "working" ? " busy" : ""}${!image && state.kind === "idle" ? " empty" : ""}`}
                    style={
                      image ? { backgroundImage: `url(${image})` } : undefined
                    }
                    role={image ? "img" : undefined}
                    aria-label={image ? `${selected?.name ?? "Character"} ${label}` : undefined}
                  >
                    {!image && state.kind === "working" && <span>Drawing…</span>}
                    {!image && state.kind === "idle" && <span>{label}</span>}
                    {!image && state.kind === "error" && (
                      <span className="slotmsg">{state.message}</span>
                    )}
                    {!image && state.kind === "blocked" && (
                      <span className="slotmsg">{state.message}</span>
                    )}
                  </div>
                  <small>{label}</small>
                  {selected && !image && state.kind === "idle" && (
                    <button
                      type="button"
                      className="pill light sm castmake"
                      onClick={() => selected && void makePose(selected, viewId)}
                      disabled={running || cutting}
                      tabIndex={open ? 0 : -1}
                    >
                      Make this view
                    </button>
                  )}
                  {(state.kind === "error" || state.kind === "blocked") && (
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => selected && void retryView(selected, viewId)}
                      disabled={running || cutting}
                      tabIndex={open ? 0 : -1}
                    >
                      Retry
                    </button>
                  )}
                  {state.kind === "blocked" && (
                    <textarea
                      aria-label={`Describe the ${label} view`}
                      value={drafts[viewId] ?? state.description}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [viewId]: e.target.value }))
                      }
                      rows={3}
                      tabIndex={open ? 0 : -1}
                    />
                  )}
                  {image && cutout && (
                    <div
                      className="slotimg"
                      style={{
                        backgroundImage: `url(${cutout}), conic-gradient(#d9d3c5 0 25%, #f5f2ea 0 50%, #d9d3c5 0 75%, #f5f2ea 0)`,
                        backgroundSize: "contain, 14px 14px",
                        backgroundRepeat: "no-repeat, repeat",
                        backgroundPosition: "center",
                      }}
                      role="img"
                      aria-label={`${selected?.name ?? "Character"} ${label} cutout`}
                    />
                  )}
                  {image && !cutout && cutoutState.kind === "working" && (
                    <div className="slotimg busy">
                      <span>Cutting…</span>
                    </div>
                  )}
                  {image && !cutout && cutoutState.kind === "error" && (
                    <span className="slotmsg">{cutoutState.message}</span>
                  )}
                  {image && !cutout && cutoutState.kind !== "working" && (
                    <button
                      type="button"
                      className="quiet"
                      onClick={() =>
                        selected && void runCutout(world, selected, viewId, image)
                      }
                      disabled={running || cutting}
                      tabIndex={open ? 0 : -1}
                    >
                      {cutoutState.kind === "error" ? "Retry cutout" : "Cut out"}
                    </button>
                  )}
                  {image && cutout && (
                    <button
                      type="button"
                      className="quiet"
                      onClick={() =>
                        selected && void runCutout(world, selected, viewId, image)
                      }
                      disabled={running || cutting}
                      tabIndex={open ? 0 : -1}
                    >
                      Cut out again
                    </button>
                  )}
                </div>
              );
            })}
          </div>
      </div>
      <div className="sheetwrap">
        <div className="sheethead">
          <span className="kicker">Character sheet</span>
          {selected &&
            (running ? (
              <button
                type="button"
                className="quiet"
                onClick={stop}
                tabIndex={open ? 0 : -1}
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                className="pill"
                onClick={() => void runSheet(selected)}
                disabled={cutting}
                tabIndex={open ? 0 : -1}
              >
                Generate full sheet
              </button>
            ))}
          {selected && selected.sheet.some((view) => view.imagePath) && (
            <button
              type="button"
              className="quiet"
              onClick={() => void runCutoutAll(selected)}
              disabled={running || cutting}
              tabIndex={open ? 0 : -1}
            >
              Cut out all
            </button>
          )}
        </div>
        {selected && (
          <div className="posewrap">
            <span className="kicker">More poses</span>
            <div className="poserow" role="group" aria-label="More poses">
              {EXTRA_POSES.map((pose) => (
                <button
                  key={pose.id}
                  type="button"
                  className="posechip"
                  onClick={() => selected && void makePose(selected, pose.id)}
                  disabled={running || cutting}
                  tabIndex={open ? 0 : -1}
                >
                  {pose.label}
                </button>
              ))}
            </div>
            <div className="poserow">
              <input
                type="text"
                className="castsearch posebox"
                aria-label="Describe another pose"
                placeholder="Another pose, e.g. dancing"
                value={poseText}
                onChange={(e) => setPoseText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (selected) void makeCustomPose(selected);
                  }
                }}
                tabIndex={open ? 0 : -1}
              />
              <button
                type="button"
                className="pill light sm"
                onClick={() => selected && void makeCustomPose(selected)}
                disabled={!poseIdFor(poseText) || running || cutting}
                tabIndex={open ? 0 : -1}
              >
                Make this pose
              </button>
            </div>
          </div>
        )}
      </div>
      {selected && (
        <div className="voicerow">
          <VoiceSection
            key={selected.id}
            world={world}
            open={open}
            character={selected}
            onWorld={onWorld}
          />
          <CustomVoice
            key={`custom-${selected.id}`}
            world={world}
            character={selected}
            onWorld={onWorld}
          />
        </div>
      )}
    </div>
  );
}
