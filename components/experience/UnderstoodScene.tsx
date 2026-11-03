"use client";

import { useState } from "react";
import type { World } from "@/lib/world/schemas";

type Props = {
  active: boolean;
  world: World;
  onWorld: (world: World) => void;
  onBack: () => void;
  onOpen: () => void;
};

export default function UnderstoodScene({ active, world, onWorld, onBack, onOpen }: Props) {
  const [handled, setHandled] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const plate = world.channels[0]?.imagePath;

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
          <div
            className="plate"
            style={plate ? { backgroundImage: `url(${plate})` } : undefined}
          />
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
        <button className="quiet" onClick={onBack}>
          Add more material
        </button>
        <button className="pill" onClick={onOpen}>
          That&rsquo;s my story
        </button>
      </div>
    </section>
  );
}
