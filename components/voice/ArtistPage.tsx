"use client";

import { useEffect, useState } from "react";
import Recorder, { type VoiceTake } from "@/components/voice/Recorder";

type InviteCharacter = {
  id: string;
  name: string;
  brief: string;
  lines: string[];
};

type Invite = {
  token: string;
  projectTitle: string;
  note: string;
  characters: InviteCharacter[];
};

function consentWording(projectTitle: string): string {
  return (
    "I'm the person speaking, and I agree that the owner of " +
    `${projectTitle} may create an AI voice from these recordings ` +
    "for the characters listed here."
  );
}

/**
 * The voice artist's page: paper style, no project navigation. Shows
 * only the project title, the owner's note, each character with its
 * brief and lines, the recorder, a name field and consent, then Send.
 */
export default function ArtistPage({ token }: { token: string }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [missing, setMissing] = useState(false);
  const [takes, setTakes] = useState<Record<string, VoiceTake[]>>({});
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/voice/invites/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setMissing(true);
          return;
        }
        setInvite((await res.json()) as Invite);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (sent) {
    return (
      <main className="vx-artist">
        <div className="vx-logo">Storyverse</div>
        <h2>Thanks, your recordings were sent.</h2>
        <p className="vx-sub">You can close this page.</p>
      </main>
    );
  }

  if (missing) {
    return (
      <main className="vx-artist">
        <div className="vx-logo">Storyverse</div>
        <h1>That link isn&apos;t working.</h1>
        <p className="vx-note">It may have expired. Ask the owner for a fresh link.</p>
      </main>
    );
  }

  if (!invite) {
    return (
      <main className="vx-artist">
        <div className="vx-logo">Storyverse</div>
        <p className="vx-note">Loading…</p>
      </main>
    );
  }

  const allTakes = Object.values(takes).flat();
  const totalSeconds = allTakes.reduce((sum, take) => sum + take.seconds, 0);
  const ready =
    name.trim().length > 0 && consent && allTakes.length > 0 && totalSeconds >= 10 && !sending;

  const send = async () => {
    if (!ready) return;
    setSending(true);
    setError(null);
    try {
      for (const [characterId, list] of Object.entries(takes)) {
        for (const take of list) {
          const form = new FormData();
          form.set("file", take.blob, "take.m4a");
          form.set("characterId", characterId);
          form.set("lineIndex", String(take.lineIndex));
          form.set("artistName", name.trim());
          form.set("consent", "true");
          const res = await fetch(`/api/voice/invites/${encodeURIComponent(token)}/files`, {
            method: "POST",
            body: form,
          });
          if (!res.ok) {
            const json: unknown = await res.json().catch(() => null);
            const message =
              json !== null && typeof json === "object"
                ? ((json as Record<string, unknown>).error as Record<string, unknown> | undefined)?.message
                : undefined;
            throw new Error(typeof message === "string" ? message : "Sending those recordings failed.");
          }
        }
      }
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sending those recordings failed.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="vx-artist">
      <div className="vx-logo">Storyverse</div>
      <div className="kicker">A voice request</div>
      <h1>{invite.projectTitle}</h1>
      {invite.note && <p className="vx-note">{invite.note}</p>}
      {invite.characters.map((character) => (
        <section key={character.id} className="vx-panel">
          <h3>{character.name}</h3>
          {character.brief && <p className="vx-brief">{character.brief}</p>}
          <Recorder
            lines={character.lines}
            onChange={(list) => setTakes((prev) => ({ ...prev, [character.id]: list }))}
          />
        </section>
      ))}
      <section className="vx-panel">
        <input
          type="text"
          placeholder="Your name"
          aria-label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="vx-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{consentWording(invite.projectTitle)}</span>
        </label>
        <button type="button" className="pill" disabled={!ready} onClick={() => void send()}>
          {sending ? "Sending…" : "Send recordings"}
        </button>
        {totalSeconds > 0 && totalSeconds < 10 && (
          <p className="vx-sub" style={{ marginTop: 8 }}>
            Record at least 10 seconds before sending.
          </p>
        )}
        {error && <p className="vx-sub">{error}</p>}
      </section>
    </main>
  );
}
