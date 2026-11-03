"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Character, World } from "@/lib/world/schemas";
import { SHEET_VIEWS } from "@/lib/art";
import {
  postArtRoute,
  sheetReferenceFor,
  styleImageFor,
  type ArtPostResult,
} from "@/lib/images";

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



export default function CastDrawer({ world, open, onClose, onWorld }: Props) {
  const [selectedId, setSelectedId] = useState(world.characters[0]?.id);
  const selected: Character | undefined =
    world.characters.find((c) => c.id === selectedId) ?? world.characters[0];

  const [slots, setSlots] = useState<Record<string, SlotState>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const runRef = useRef(0);
  const respIds = useRef<Record<string, string>>({});

  // A new character gets fresh slots.
  useEffect(() => {
    setSlots({});
    setDrafts({});
    setRunning(false);
    runRef.current += 1;
  }, [selected?.id]);

  const appearsIn = useMemo(() => {
    if (!selected) return "";
    return world.beats
      .filter((b) => b.characterIds.includes(selected.id))
      .map((b) => {
        const channel = world.channels.find((c) => c.id === b.channelId);
        return `${channel?.name ?? ""} ${b.unitLabel}`.trim();
      })
      .join("; ");
  }, [world, selected]);

  const figures = world.characters.filter((c) => c.artPath);

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

    // Start clean; each view fills its slot as it arrives.
    current = {
      ...current,
      characters: current.characters.map((c) =>
        c.id === character.id ? { ...c, sheet: [] } : c,
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
      for (const view of SHEET_VIEWS) {
        if (next[view.id]?.kind === "working") next[view.id] = { kind: "idle" };
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
      <h2>{selected?.name ?? ""}</h2>
      <div className="castlist">
        {world.characters.map((c) => (
          <button
            key={c.id}
            className={c.id === selected?.id ? "on" : ""}
            onClick={() => setSelectedId(c.id)}
            tabIndex={open ? 0 : -1}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="who">
        {figures.map((c) => (
          <div
            key={c.id}
            className="fig"
            style={{ backgroundImage: `url(${c.artPath})` }}
            role="img"
            aria-label={c.name}
          />
        ))}
        <div className="txt">
          <small>Canon</small>
          <p>{selected?.canon ?? ""}</p>
          {selected?.secret && (
            <>
              <small>Secret</small>
              <p>{selected.secret}</p>
            </>
          )}
          <small>Appears in</small>
          <p>{appearsIn}</p>
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
                tabIndex={open ? 0 : -1}
              >
                Generate full sheet
              </button>
            ))}
        </div>
        <div className="sheetgrid">
          {SHEET_VIEWS.map((view) => {
            const image = sheetByView.get(view.id);
            const state = slots[view.id] ?? { kind: "idle" as const };
            return (
              <div key={view.id} className="slot">
                <div
                  className={`slotimg${state.kind === "working" ? " busy" : ""}`}
                  style={
                    image ? { backgroundImage: `url(${image})` } : undefined
                  }
                  role={image ? "img" : undefined}
                  aria-label={image ? `${selected?.name} ${view.label}` : undefined}
                >
                  {!image && state.kind === "working" && <span>Drawing…</span>}
                  {!image && state.kind === "idle" && <span>No image yet</span>}
                  {!image && state.kind === "error" && (
                    <span className="slotmsg">{state.message}</span>
                  )}
                  {!image && state.kind === "blocked" && (
                    <span className="slotmsg">{state.message}</span>
                  )}
                </div>
                <small>{view.label}</small>
                {(state.kind === "error" || state.kind === "blocked") && (
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => selected && void retryView(selected, view.id)}
                    tabIndex={open ? 0 : -1}
                  >
                    Retry
                  </button>
                )}
                {state.kind === "blocked" && (
                  <textarea
                    aria-label={`Describe the ${view.label} view`}
                    value={drafts[view.id] ?? state.description}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [view.id]: e.target.value }))
                    }
                    rows={3}
                    tabIndex={open ? 0 : -1}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
