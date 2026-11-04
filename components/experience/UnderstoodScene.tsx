"use client";

import { useState } from "react";
import { z } from "zod";
import { FactSchema, type Fact, type World } from "@/lib/world/schemas";
import { VISUAL_PRESETS, visualStyleSourceLine } from "@/lib/style";

const SOURCE_LINE: Record<Fact["source"], string> = {
  material: "From your treatment",
  muse: "My reading",
  you: "You edited this",
};

/** The Visual style card in the basics grid, with its own editor state. */
function StyleCard({
  world,
  onWorld,
}: {
  world: World;
  onWorld: (world: World) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [preset, setPreset] = useState("");
  const [notes, setNotes] = useState("");

  const style = world.visualStyle ?? { preset: "", notes: "" };
  const line = visualStyleSourceLine(world.visualStyleSource);

  const open = () => {
    setPreset(style.preset);
    setNotes(style.notes);
    setEditing(true);
  };

  const save = () => {
    const next = preset.trim();
    if (!next) return;
    onWorld({
      ...world,
      visualStyle: { preset: next, notes: notes.trim() },
      visualStyleSource: "you",
    });
    setEditing(false);
  };

  if (!editing && style.preset.trim().length === 0) {
    return (
      <div className="fact miss" key="visual-style">
        <small>Visual style</small>
        <p>No visual style yet</p>
        <button type="button" onClick={open}>
          Choose a style
        </button>
      </div>
    );
  }

  return (
    <div className="fact wide" key="visual-style">
      <small>
        Visual style
        {!editing && (
          <button type="button" className="edit" onClick={open}>
            Edit
          </button>
        )}
      </small>
      {editing ? (
        <div className="styleedit">
          <div className="stylechips" role="group" aria-label="Visual style presets">
            {VISUAL_PRESETS.map((entry) => (
              <button
                key={entry.preset}
                type="button"
                className={preset === entry.preset ? "on" : ""}
                aria-pressed={preset === entry.preset}
                title={entry.description}
                onClick={() => setPreset(entry.preset)}
              >
                {entry.preset}
              </button>
            ))}
          </div>
          <textarea
            aria-label="Visual style notes"
            placeholder="Palette and mood, in your own words"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="stylerow">
            <button
              type="button"
              className="quiet"
              disabled={!preset.trim()}
              onClick={save}
            >
              Save
            </button>
            <button type="button" className="quiet" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p>
            {style.preset}
            {style.notes.trim().length > 0 ? ` — ${style.notes.trim()}` : ""}
          </p>
          {line && <span className="src">{line}</span>}
        </>
      )}
    </div>
  );
}

type Props = {
  active?: boolean;
  world: World;
  onWorld: (world: World) => void;
  onAddMaterial: () => void;
  onOpen: () => void;
};

export default function UnderstoodScene({ active = true, world, onWorld, onAddMaterial, onOpen }: Props) {
  const [handled, setHandled] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editingFact, setEditingFact] = useState<string | null>(null);
  const [factDraft, setFactDraft] = useState("");
  const [readingBasics, setReadingBasics] = useState(false);
  const [basicsFailure, setBasicsFailure] = useState("");
  /** The server's message when it has one, so a budget stop reads as one. */
  const readBasics = async () => {
    if (readingBasics) return;
    setReadingBasics(true);
    setBasicsFailure("");
    try {
      const res = await fetch("/api/facts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ world }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const record =
          json !== null && typeof json === "object"
            ? (json as Record<string, unknown>)
            : null;
        const error =
          record?.error !== null && typeof record?.error === "object"
            ? (record.error as Record<string, unknown>)
            : null;
        setBasicsFailure(
          typeof error?.message === "string" && error.message.length > 0
            ? error.message
            : "I could not read the story's basics. Try again.",
        );
        return;
      }
      const record =
        json !== null && typeof json === "object"
          ? (json as Record<string, unknown>)
          : null;
      const facts = Array.isArray(record?.facts) ? record.facts : null;
      const parsed = z.array(FactSchema).safeParse(facts);
      if (!parsed.success) {
        setBasicsFailure("I could not read the story's basics. Try again.");
        return;
      }
      onWorld({ ...world, facts: parsed.data });
    } catch {
      setBasicsFailure("I could not read the story's basics. Try again.");
    } finally {
      setReadingBasics(false);
    }
  };

  const saveFact = (factId: string) => {
    const value = factDraft.trim();
    if (!value) return;
    onWorld({
      ...world,
      facts: world.facts.map((fact) =>
        fact.id === factId ? { ...fact, value, source: "you" as const } : fact,
      ),
    });
    setEditingFact(null);
    setFactDraft("");
  };
  // The left page shows the first available art from any file. With no
  // art at all it is a tinted plate with the story's title.
  const art = [
    ...world.channels.map((c) => c.imagePath),
    ...world.parts.map((p) => p.imagePath),
    ...world.characters.map((c) => c.artPath ?? ""),
    ...world.beats.map((b) => b.imagePath ?? ""),
  ].find((path) => typeof path === "string" && path.length > 0);
  const tint = world.parts[0]?.tint ?? "#e9e0ce";

  const markHandled = (id: string) =>
    setHandled((prev) => (prev.includes(id) ? prev : [...prev, id]));

  const answerGap = (gapId: string) => {
    const gap = world.gaps.find((g) => g.id === gapId);
    const answer = draft.trim();
    if (!gap || !answer) return;
    onWorld({
      ...world,
      canonChanges: [...world.canonChanges, `${gap.question} — ${answer}`],
    });
    markHandled(gapId);
    setOpenId(null);
    setDraft("");
  };

  const keepSecret = (gapId: string) => {
    const gap = world.gaps.find((g) => g.id === gapId);
    if (!gap) return;
    const secretId = `secret-${gap.id}`;
    const exists = world.secrets.some((s) => s.id === secretId);
    onWorld({
      ...world,
      secrets: exists
        ? world.secrets
        : [
            ...world.secrets,
            {
              id: secretId,
              text: gap.question,
              knownThrough: [],
              note: "Not revealed yet",
              suggested: false,
            },
          ],
    });
    markHandled(gapId);
    setOpenId(null);
    setDraft("");
  };

  return (
    <section className={`scene${active ? " on" : ""}`} id="understood">
      <div className="spread">
        <div className="pg">
          {art ? (
            <div
              className="plate"
              style={{ backgroundImage: `url(${art})` }}
            />
          ) : (
            <div
              className="plate bare"
              style={{ backgroundImage: "none", backgroundColor: tint }}
            >
              <span>{world.title}</span>
            </div>
          )}
          <p className="logline">{world.logline}</p>
        </div>
        <div className="pg">
          <div className="kicker">Here&rsquo;s what I understood</div>
          <h2>Your story, so far</h2>
          <div className="names">
            {world.characters.map((c) => (
              <span key={c.id}>{c.name}</span>
            ))}
            {world.locations.map((l) => (
              <span key={l.id}>{l.name}</span>
            ))}
          </div>
          {world.facts.length > 0 ? (
            <div className="facts">
              {world.facts.map((fact) =>
                fact.value.trim().length === 0 ? (
                  <div className="fact miss" key={fact.id}>
                    <small>{fact.label}</small>
                    <p>Not in your material yet</p>
                    {editingFact === fact.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveFact(fact.id);
                        }}
                        style={{ display: "flex", gap: 8, marginTop: 6 }}
                      >
                        <input
                          aria-label={`Add ${fact.label}`}
                          placeholder={fact.label}
                          autoComplete="off"
                          value={factDraft}
                          onChange={(e) => setFactDraft(e.target.value)}
                        />
                        <button
                          type="submit"
                          className="quiet"
                          disabled={!factDraft.trim()}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => {
                            setEditingFact(null);
                            setFactDraft("");
                          }}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFact(fact.id);
                          setFactDraft("");
                        }}
                      >
                        Add
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    className={`fact${fact.value.length > 70 ? " wide" : ""}`}
                    key={fact.id}
                  >
                    <small>
                      {fact.label}
                      {editingFact !== fact.id && (
                        <button
                          type="button"
                          className="edit"
                          onClick={() => {
                            setEditingFact(fact.id);
                            setFactDraft(fact.value);
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </small>
                    {editingFact === fact.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveFact(fact.id);
                        }}
                        style={{ display: "flex", gap: 8, marginTop: 6 }}
                      >
                        <input
                          aria-label={`Edit ${fact.label}`}
                          autoComplete="off"
                          value={factDraft}
                          onChange={(e) => setFactDraft(e.target.value)}
                        />
                        <button
                          type="submit"
                          className="quiet"
                          disabled={!factDraft.trim()}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => {
                            setEditingFact(null);
                            setFactDraft("");
                          }}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <p>{fact.value}</p>
                        <span className="src">{SOURCE_LINE[fact.source]}</span>
                      </>
                    )}
                  </div>
                ),
              )}
              <StyleCard world={world} onWorld={onWorld} />
            </div>
          ) : (
            <div className="facts">
              <button
                type="button"
                className="pill"
                onClick={readBasics}
                disabled={readingBasics}
              >
                {readingBasics ? "Reading the basics…" : "Read the story's basics"}
              </button>
              {basicsFailure && <p className="status">{basicsFailure}</p>}
              <StyleCard world={world} onWorld={onWorld} />
            </div>
          )}
          {world.gaps.map((gap) => (
            <div className="gq" key={gap.id}>
              <div className="kicker" style={{ margin: 0 }}>
                A gap
              </div>
              <p>{gap.question}</p>
              {handled.includes(gap.id) ? (
                <div>
                  <span className="handled">Handled</span>
                </div>
              ) : openId === gap.id ? (
                <div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      answerGap(gap.id);
                    }}
                    style={{ display: "flex", gap: 8, marginTop: 6 }}
                  >
                    <input
                      aria-label="Answer this gap"
                      placeholder="Your answer"
                      autoComplete="off"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="quiet"
                      disabled={!draft.trim()}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => {
                        setOpenId(null);
                        setDraft("");
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                </div>
              ) : (
                <div>
                  <button
                    className="quiet"
                    onClick={() => {
                      setOpenId(gap.id);
                      setDraft("");
                    }}
                  >
                    Answer now
                  </button>
                  <button className="quiet" onClick={() => keepSecret(gap.id)}>
                    Keep it a secret
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="rings" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="foot">
        <button className="quiet" onClick={onAddMaterial}>
          Add more material
        </button>
        <button className="pill" onClick={onOpen}>
          That&rsquo;s my story
        </button>
      </div>
    </section>
  );
}
