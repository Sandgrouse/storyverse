"use client";

import { useEffect, useState } from "react";
import type { Character, World } from "@/lib/world/schemas";
import Recorder, { type VoiceTake } from "@/components/voice/Recorder";

type Props = {
  world: World;
  character: Character;
  onWorld: (world: World) => void;
};

const OWNER_CODE_KEY = "voice-owner-code";
const OWNER_CONSENT_TEXT =
  "I have the right and the speaker's consent to create an AI voice from this audio.";

function readOwnerCode(): string {
  try {
    return sessionStorage.getItem(OWNER_CODE_KEY) ?? "";
  } catch {
    return "";
  }
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

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [head, body] = dataUrl.split(",");
    const mime = head?.match(/data:(.*?);/)?.[1] ?? "audio/mpeg";
    const binary = atob(body ?? "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes as unknown as BlobPart], { type: mime });
  } catch {
    return null;
  }
}

async function uploadTake(
  code: string,
  characterId: string,
  blob: Blob,
): Promise<string> {
  const form = new FormData();
  form.set("characterId", characterId);
  form.set("file", blob, "take.m4a");
  const res = await fetch("/api/voice/samples", {
    method: "POST",
    headers: { "x-voice-owner-code": code },
    body: form,
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(voiceErrorMessage(json, "Saving that recording failed."));
  const sampleId = (json as Record<string, unknown>).sampleId;
  if (typeof sampleId !== "string") throw new Error("Saving that recording failed.");
  return sampleId;
}

async function createVoice(
  code: string,
  characterName: string,
  sampleIds: string[],
): Promise<{ voiceId: string }> {
  const res = await fetch("/api/voice/custom", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-voice-owner-code": code },
    body: JSON.stringify({ characterName, sampleIds, consent: true }),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(voiceErrorMessage(json, "Creating that voice failed."));
  const voiceId = (json as Record<string, unknown>).voiceId;
  if (typeof voiceId !== "string") throw new Error("Creating that voice failed.");
  return { voiceId };
}

type Submission = {
  id: string;
  characterId: string;
  lineIndex: number;
  artistName: string;
  consentText: string;
  consentAt: number;
  audioDataUrl: string | null;
  url: string | null;
};

/**
 * "Make a custom voice" under Voice: Record, Upload, or Ask a voice
 * artist. Owner only: without the owner code this shows the gate and
 * nothing else. The code lives in sessionStorage, never in the world.
 */
export default function CustomVoice({ world, character, onWorld }: Props) {
  const [code, setCode] = useState(readOwnerCode);
  const [unlocked, setUnlocked] = useState(readOwnerCode().length > 0);
  const [tab, setTab] = useState<"record" | "upload" | "ask" | "describe">("record");
  const [provider, setProvider] = useState<"fish" | "elevenlabs" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/voice/list")
      .then(async (res) => {
        const json: unknown = await res.json().catch(() => null);
        if (cancelled || !res.ok) return;
        const record =
          json !== null && typeof json === "object"
            ? (json as Record<string, unknown>)
            : null;
        setProvider(record?.provider === "fish" ? "fish" : "elevenlabs");
      })
      .catch(() => {
        // Provider stays unknown; the Describe option stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [lines, setLines] = useState<string[]>(character.lines?.map((l) => l.text) ?? []);
  const [pickingLines, setPickingLines] = useState(false);
  const [takes, setTakes] = useState<VoiceTake[]>([]);
  const [uploads, setUploads] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(character.voice?.kind === "custom" ? character.voice.id : null);
  const [sampleIds, setSampleIds] = useState<string[]>([]);

  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [selected, setSelected] = useState<string[]>([character.id]);
  const [briefs, setBriefs] = useState<Record<string, string>>({});
  const [inviteLines, setInviteLines] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState("Thanks for doing this. Take your time, and read each line as the character would.");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [checking, setChecking] = useState(false);
  const [useTakes, setUseTakes] = useState<string[]>([]);

  const [designing, setDesigning] = useState(false);
  const [designDescription, setDesignDescription] = useState("");
  const [designTestLine, setDesignTestLine] = useState("");
  const [designCandidates, setDesignCandidates] = useState<
    Array<{ id: string; audioDataUrl: string }>
  >([]);
  const [usingCandidate, setUsingCandidate] = useState<string | null>(null);

  const imagineVoice = async () => {
    setDesigning(true);
    setError(null);
    try {
      const res = await fetch("/api/voice/design", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-voice-owner-code": readOwnerCode() },
        body: JSON.stringify({ world, characterId: character.id }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) throw new Error(voiceErrorMessage(json, "Imagining that voice failed."));
      const record = json as Record<string, unknown>;
      if (typeof record.description === "string") setDesignDescription(record.description);
      if (typeof record.testLine === "string") setDesignTestLine(record.testLine);
      if (Array.isArray(record.candidates)) {
        setDesignCandidates(
          (record.candidates as unknown[]).filter(
            (c): c is { id: string; audioDataUrl: string } =>
              c !== null &&
              typeof c === "object" &&
              typeof (c as Record<string, unknown>).id === "string" &&
              typeof (c as Record<string, unknown>).audioDataUrl === "string",
          ),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Imagining that voice failed.");
    } finally {
      setDesigning(false);
    }
  };

  const createDesignedVoice = async (candidate: { id: string; audioDataUrl: string }) => {
    setUsingCandidate(candidate.id);
    setError(null);
    try {
      // No real speaker is involved, so no consent checkbox: the
      // owner's click on "Use this voice" is the confirmation the
      // custom-voice route needs.
      const blob = dataUrlToBlob(candidate.audioDataUrl);
      if (!blob) throw new Error("That recording could not be read.");
      const code = readOwnerCode();
      const sampleId = await uploadTake(code, character.id, blob);
      const { voiceId: id } = await createVoice(code, character.name, [sampleId]);
      setSampleIds([sampleId]);
      setVoiceId(id);
      onWorld({
        ...world,
        characters: world.characters.map((c) =>
          c.id === character.id
            ? {
                ...c,
                voice: { id, name: character.name, kind: "custom" as const, source: "designed" },
              }
            : c,
        ),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Creating that voice failed.");
    } finally {
      setUsingCandidate(null);
    }
  };

  const enterCode = (value: string) => {
    setCode(value);
    const ok = value.trim().length > 0;
    setUnlocked(ok);
    try {
      if (ok) sessionStorage.setItem(OWNER_CODE_KEY, value);
      else sessionStorage.removeItem(OWNER_CODE_KEY);
    } catch {
      // Private mode; the gate simply asks again.
    }
  };

  if (!unlocked) {
    return (
      <div className="sheetwrap">
        <div className="sheethead">
          <span className="kicker">Custom voice</span>
        </div>
        <div className="artstate">
          <p>Custom voices are for this project&apos;s owner.</p>
          <input
            type="password"
            aria-label="Owner code"
            placeholder="Owner code"
            value={code}
            onChange={(e) => enterCode(e.target.value)}
            style={{ font: "inherit", color: "inherit", background: "var(--sheet)", border: "1px solid var(--rule)", borderRadius: 10, padding: "8px 10px", maxWidth: "100%" }}
          />
        </div>
      </div>
    );
  }

  const totalSeconds = takes.reduce((sum, take) => sum + take.seconds, 0);
  const shortTakes = takes.filter((take) => take.seconds < 10);
  // Fish Audio needs every sample to be at least 10 seconds long.
  const longEnough =
    takes.length > 0 &&
    (provider === "fish" ? shortTakes.length === 0 : totalSeconds >= 10);
  const canCreate = consent && !working && longEnough;

  const pickLines = async () => {
    setPickingLines(true);
    setError(null);
    try {
      const res = await fetch("/api/voice/lines", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-voice-owner-code": readOwnerCode() },
        body: JSON.stringify({ world, characterId: character.id }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) throw new Error(voiceErrorMessage(json, "Writing reading lines failed."));
      const picked = (json as Record<string, unknown>).lines;
      if (Array.isArray(picked)) setLines(picked.filter((l): l is string => typeof l === "string"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Writing reading lines failed.");
    } finally {
      setPickingLines(false);
    }
  };

  const setWorldVoice = (voice: { voiceId: string; source: string }) => {
    setVoiceId(voice.voiceId);
    onWorld({
      ...world,
      characters: world.characters.map((c) =>
        c.id === character.id
          ? {
              ...c,
              voice: {
                id: voice.voiceId,
                name: character.name,
                kind: "custom" as const,
                source: voice.source,
                consent: { text: OWNER_CONSENT_TEXT, at: new Date().toISOString() },
              },
            }
          : c,
      ),
    });
  };

  const createFromTakes = async (blobs: Blob[], source: string) => {
    setWorking(true);
    setError(null);
    try {
      const code = readOwnerCode();
      const ids: string[] = [];
      for (const blob of blobs) ids.push(await uploadTake(code, character.id, blob));
      const { voiceId: id } = await createVoice(code, character.name, ids);
      setSampleIds(ids);
      setWorldVoice({ voiceId: id, source });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Creating that voice failed.");
    } finally {
      setWorking(false);
    }
  };

  const deleteSources = async () => {
    try {
      await fetch("/api/voice/samples", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-voice-owner-code": readOwnerCode() },
        body: JSON.stringify({ sampleIds }),
      });
    } catch {
      // Best effort; the voice already exists.
    }
    setSampleIds([]);
  };

  const selectedCharacters = world.characters.filter((c) => selected.includes(c.id));

  const createInvite = async () => {
    setWorking(true);
    setError(null);
    try {
      const characters = selectedCharacters.map((c) => ({
        id: c.id,
        name: c.name,
        brief: briefs[c.id] ?? c.canon,
        lines: (inviteLines[c.id] ?? c.lines?.map((l) => l.text) ?? []).filter((l) => l.trim()),
      }));
      const empty = characters.find((c) => c.lines.length === 0);
      if (empty) throw new Error(`Add at least one line for ${empty.name}.`);
      const res = await fetch("/api/voice/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-voice-owner-code": readOwnerCode() },
        body: JSON.stringify({ projectTitle: world.title, note, characters }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) throw new Error(voiceErrorMessage(json, "Creating that link failed."));
      const record = json as Record<string, unknown>;
      if (typeof record.url === "string") setInviteUrl(record.url);
      if (typeof record.token === "string") setInviteToken(record.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Creating that link failed.");
    } finally {
      setWorking(false);
    }
  };

  const checkRecordings = async () => {
    if (!inviteToken) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/voice/invites/${encodeURIComponent(inviteToken)}/files`, {
        headers: { "x-voice-owner-code": readOwnerCode() },
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) throw new Error(voiceErrorMessage(json, "Reading those recordings failed."));
      const list = (json as Record<string, unknown>).submissions;
      if (Array.isArray(list)) {
        setSubmissions(list as Submission[]);
        setUseTakes((list as Submission[]).map((s) => s.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reading those recordings failed.");
    } finally {
      setChecking(false);
    }
  };

  const createFromArtist = async (characterId: string) => {
    setWorking(true);
    setError(null);
    try {
      const chosen = submissions.filter((s) => s.characterId === characterId && useTakes.includes(s.id));
      const blobs: Blob[] = [];
      for (const take of chosen) {
        if (!take.audioDataUrl) continue;
        const blob = dataUrlToBlob(take.audioDataUrl);
        if (blob) blobs.push(blob);
      }
      if (blobs.length === 0) throw new Error("Choose at least one take first.");
      const target = world.characters.find((c) => c.id === characterId);
      const code = readOwnerCode();
      const ids: string[] = [];
      for (const blob of blobs) ids.push(await uploadTake(code, characterId, blob));
      const { voiceId: id } = await createVoice(code, target?.name ?? character.name, ids);
      setSampleIds(ids);
      if (target) {
        const first = chosen[0];
        onWorld({
          ...world,
          characters: world.characters.map((c) =>
            c.id === target.id
              ? {
                  ...c,
                  voice: {
                    id,
                    name: target.name,
                    kind: "custom" as const,
                    source: "artist",
                    consent: {
                      by: first?.artistName,
                      text: first?.consentText ?? "",
                      at: first ? new Date(first.consentAt).toISOString() : new Date().toISOString(),
                    },
                  },
                }
              : c,
          ),
        });
        setVoiceId(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Creating that voice failed.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="sheetwrap">
      <div className="sheethead">
        <span className="kicker">Custom voice</span>
      </div>
      <h3 style={{ fontSize: 20, margin: "8px 0" }}>Make a custom voice</h3>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        {(["record", "upload", "ask"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "pill" : "pill light"}
            onClick={() => setTab(t)}
          >
            {t === "record" ? "Record" : t === "upload" ? "Upload" : "Ask a voice artist"}
          </button>
        ))}
        {provider === "fish" && (
          <button
            key="describe"
            type="button"
            className={tab === "describe" ? "pill" : "pill light"}
            onClick={() => setTab("describe")}
          >
            Describe
          </button>
        )}
      </div>
      {provider === "fish" && tab !== "describe" && (
        <div className="vx-sub" style={{ marginBottom: 8 }}>
          Fish Audio needs every sample to be at least 10 seconds long.
        </div>
      )}

      {tab === "record" && (
        <div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="vx-sub">Record the lines yourself.</span>
            <button type="button" className="quiet" onClick={() => void pickLines()} disabled={pickingLines}>
              {pickingLines ? "Writing…" : "Pick lines from the story"}
            </button>
          </div>
          {lines.map((text, i) => (
            <div key={i} className="row" style={{ marginBottom: 6 }}>
              <input
                type="text"
                aria-label={`Reading line ${i + 1}`}
                value={text}
                onChange={(e) => setLines((prev) => prev.map((l, j) => (j === i ? e.target.value : l)))}
                style={{ flex: 1, font: "inherit", color: "inherit", background: "var(--sheet)", border: "1px solid var(--rule)", borderRadius: 10, padding: "8px 10px" }}
              />
              <button type="button" className="quiet" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
          <div className="row" style={{ margin: "8px 0" }}>
            <button type="button" className="quiet" onClick={() => setLines((prev) => [...prev, ""])}>
              Add a line
            </button>
          </div>
          <Recorder lines={lines.filter((l) => l.trim())} onChange={setTakes} />
          {provider === "fish" && shortTakes.length > 0 && (
            <div className="artstate">
              <p>
                {shortTakes.length === 1
                  ? "One take is under 10 seconds. Record it again, a little longer."
                  : `${shortTakes.length} takes are under 10 seconds. Record them again, a little longer.`}
              </p>
            </div>
          )}
          <label className="vx-consent" style={{ display: "flex", gap: 8, margin: "12px 0" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{OWNER_CONSENT_TEXT}</span>
          </label>
          <button
            type="button"
            className="pill"
            disabled={!canCreate}
            onClick={() => void createFromTakes(takes.map((t) => t.blob), "recording")}
          >
            {working ? "Creating…" : "Create this voice"}
          </button>
        </div>
      )}

      {tab === "upload" && (
        <div>
          <div className="vx-sub" style={{ marginBottom: 8 }}>
            MP3, WAV or M4A. One to two minutes of one clear voice works best.
          </div>
          <input
            type="file"
            accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"
            multiple
            aria-label="Voice sample"
            onChange={(e) => setUploads([...(e.target.files ?? [])])}
          />
          {uploads.length > 0 && (
            <ul style={{ listStyle: "none", margin: "10px 0", padding: 0 }}>
              {uploads.map((file, i) => (
                <li key={`${file.name}-${i}`} className="vx-sub">
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </li>
              ))}
            </ul>
          )}
          <label className="vx-consent" style={{ display: "flex", gap: 8, margin: "12px 0" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{OWNER_CONSENT_TEXT}</span>
          </label>
          <button
            type="button"
            className="pill"
            disabled={!consent || working || uploads.length === 0}
            onClick={() => void createFromTakes(uploads, "upload")}
          >
            {working ? "Creating…" : "Create this voice"}
          </button>
        </div>
      )}

      {tab === "ask" && (
        <div>
          <div className="vx-sub" style={{ marginBottom: 6 }}>Who should they voice?</div>
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            {world.characters.map((c) => (
              <button
                key={c.id}
                type="button"
                className={selected.includes(c.id) ? "pill" : "pill light"}
                onClick={() =>
                  setSelected((prev) => (prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]))
                }
              >
                {c.name}
              </button>
            ))}
          </div>
          {selectedCharacters.map((c) => (
            <div key={c.id} style={{ marginBottom: 12 }}>
              <div className="vx-sub" style={{ marginBottom: 4 }}>Brief for {c.name}</div>
              <textarea
                aria-label={`Brief for ${c.name}`}
                rows={2}
                value={briefs[c.id] ?? c.canon}
                onChange={(e) => setBriefs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                style={{ width: "100%", font: "inherit", color: "inherit", background: "var(--sheet)", border: "1px solid var(--rule)", borderRadius: 10, padding: "8px 10px" }}
              />
              <div className="vx-sub" style={{ margin: "6px 0 4px" }}>Lines for {c.name}</div>
              {(inviteLines[c.id] ?? c.lines?.map((l) => l.text) ?? []).map((text, i) => (
                <div key={i} className="row" style={{ marginBottom: 6 }}>
                  <input
                    type="text"
                    aria-label={`Line ${i + 1} for ${c.name}`}
                    value={text}
                    onChange={(e) =>
                      setInviteLines((prev) => {
                        const list = [...(prev[c.id] ?? c.lines?.map((l) => l.text) ?? [])];
                        list[i] = e.target.value;
                        return { ...prev, [c.id]: list };
                      })
                    }
                    style={{ flex: 1, font: "inherit", color: "inherit", background: "var(--sheet)", border: "1px solid var(--rule)", borderRadius: 10, padding: "8px 10px" }}
                  />
                  <button
                    type="button"
                    className="quiet"
                    onClick={() =>
                      setInviteLines((prev) => ({
                        ...prev,
                        [c.id]: (prev[c.id] ?? c.lines?.map((l) => l.text) ?? []).filter((_, j) => j !== i),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="quiet"
                onClick={() =>
                  setInviteLines((prev) => ({ ...prev, [c.id]: [...(prev[c.id] ?? c.lines?.map((l) => l.text) ?? []), ""] }))
                }
              >
                Add a line
              </button>
            </div>
          ))}
          <div className="vx-sub" style={{ marginBottom: 4 }}>Note for the artist</div>
          <textarea
            aria-label="Note for the artist"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ width: "100%", font: "inherit", color: "inherit", background: "var(--sheet)", border: "1px solid var(--rule)", borderRadius: 10, padding: "8px 10px" }}
          />
          <div className="vx-sub" style={{ marginTop: 8 }}>
            10 lines each, picked from the story. Secrets are never included.
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="pill" disabled={working || selected.length === 0} onClick={() => void createInvite()}>
              Create link
            </button>
            <button type="button" className="pill light" disabled={!inviteToken || checking} onClick={() => void checkRecordings()}>
              {checking ? "Checking…" : "Check for recordings"}
            </button>
          </div>
          {inviteUrl && (
            <div className="row" style={{ marginTop: 10 }}>
              <span className="vx-sub" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{inviteUrl}</span>
              <button type="button" className="pill light" onClick={() => void navigator.clipboard?.writeText(inviteUrl)}>
                Copy
              </button>
            </div>
          )}
          {submissions.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {selectedCharacters.map((c) => {
                const takes = submissions.filter((s) => s.characterId === c.id);
                if (takes.length === 0) return null;
                return (
                  <div key={c.id} style={{ marginBottom: 10 }}>
                    <div className="vx-sub">{c.name}, {takes.length} takes</div>
                    {takes.map((take) => (
                      <div key={take.id} className="row" style={{ gap: 8, padding: "6px 0" }}>
                        {take.audioDataUrl && (
                          <audio controls preload="none" src={take.audioDataUrl} style={{ maxWidth: 220 }} />
                        )}
                        <span className="vx-sub" style={{ flex: 1 }}>
                          {take.artistName} · consent {new Date(take.consentAt).toLocaleString()}
                        </span>
                        <label className="vx-sub">
                          <input
                            type="checkbox"
                            checked={useTakes.includes(take.id)}
                            onChange={(e) =>
                              setUseTakes((prev) =>
                                e.target.checked ? [...prev, take.id] : prev.filter((id) => id !== take.id),
                              )
                            }
                          />{" "}
                          Use
                        </label>
                      </div>
                    ))}
                    <div className="vx-sub" style={{ fontStyle: "italic" }}>
                      “{takes[0]?.consentText}”
                    </div>
                    <button type="button" className="pill" disabled={working} onClick={() => void createFromArtist(c.id)} style={{ marginTop: 6 }}>
                      Create this voice
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "describe" && provider === "fish" && (
        <div>
          <div className="vx-sub" style={{ marginBottom: 8 }}>
            Let Muse imagine it. No recording, no consent form: there is no real speaker.
          </div>
          <button
            type="button"
            className="pill"
            disabled={designing}
            onClick={() => void imagineVoice()}
          >
            {designing ? "Imagining…" : designCandidates.length > 0 ? "Imagine again" : "Imagine a voice"}
          </button>
          {designCandidates.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="vx-sub" style={{ marginBottom: 4 }}>How it sounds</div>
              <textarea
                aria-label="Voice description"
                rows={3}
                value={designDescription}
                onChange={(e) => setDesignDescription(e.target.value.slice(0, 300))}
                style={{ width: "100%", font: "inherit", color: "inherit", background: "var(--sheet)", border: "1px solid var(--rule)", borderRadius: 10, padding: "8px 10px" }}
              />
              <span className="vx-sub">{designDescription.length} / 300</span>
              {designTestLine && (
                <div className="vx-sub" style={{ margin: "6px 0" }}>Test line: “{designTestLine}”</div>
              )}
              {designCandidates.map((candidate) => (
                <div key={candidate.id} className="row" style={{ gap: 8, padding: "8px 0" }}>
                  <audio controls preload="none" src={candidate.audioDataUrl} style={{ maxWidth: 220 }} />
                  <button
                    type="button"
                    className="pill light"
                    disabled={usingCandidate !== null}
                    onClick={() => void createDesignedVoice(candidate)}
                  >
                    {usingCandidate === candidate.id ? "Creating…" : "Use this voice"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="artstate">
          <p>{error}</p>
        </div>
      )}
      {voiceId && !working && (
        <div className="artstate">
          <p>Custom voice ready.</p>
          {sampleIds.length > 0 && (
            <button type="button" className="quiet" onClick={() => void deleteSources()}>
              Delete the source recordings
            </button>
          )}
        </div>
      )}
    </div>
  );
}
