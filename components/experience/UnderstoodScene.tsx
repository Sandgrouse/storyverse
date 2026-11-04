"use client";

import { useState } from "react";
import type { Fact, World } from "@/lib/world/schemas";

const SOURCE_LINE: Record<Fact["source"], string> = {
  material: "From your treatment",
  muse: "My reading",
  you: "You edited this",
};

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
          {world.facts.length > 0 && (
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
