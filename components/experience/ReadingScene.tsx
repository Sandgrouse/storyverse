"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { World } from "@/lib/world/schemas";
import { ReadModelOutputSchema, type ReadModelOutput } from "@/lib/read";
import { buildWorld } from "@/lib/story";
import { toPlanBeats, toPlanChannels, toPlanSecrets } from "@/lib/plan";
import type { ClientFile } from "./Experience";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Props = {
  active: boolean;
  files: ClientFile[];
  idea: string;
  seed: World;
  sample: boolean;
  onFiles: (files: ClientFile[]) => void;
  onDone: (world: World, sample: boolean) => void;
};

type Phase = "idle" | "reading" | "planning" | "showing" | "error";

export default function ReadingScene({
  active,
  files,
  idea,
  seed,
  sample,
  onFiles,
  onDone,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("Reading your files");
  const [canon, setCanon] = useState<ReadModelOutput | null>(null);
  const [failure, setFailure] = useState("");
  const [isSample, setIsSample] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const runId = useRef(0);
  const doneRef = useRef(false);
  const filesRef = useRef(files);
  filesRef.current = files;

  const imageForFile = useMemo(() => {
    const map = new Map<string, string>();
    for (const file of files) {
      if (file.displayUrl) map.set(file.name, file.displayUrl);
      else if (file.sendDataUrl) map.set(file.name, file.sendDataUrl);
    }
    return (name: string) => map.get(name) ?? "";
  }, [files]);

  const displayWorld: World | null = useMemo(() => {
    if (sample && phase !== "error") return seed;
    if (!canon) return null;
    return null;
  }, [sample, seed, phase, canon]);

  const names = useMemo(() => {
    const source = canon
      ? [
          ...canon.characters.map((c) => c.name),
          ...canon.locations.map((l) => l.name),
        ]
      : [...seed.characters.map((c) => c.name), ...seed.locations.map((l) => l.name)];
    return source.sort((a, b) => b.length - a.length);
  }, [canon, seed]);

  const passage = useMemo(() => {
    if (canon) return canon.parts.map((p) => `${p.summary} ${p.excerpt}`).join(" ");
    if (sample) return seed.parts.map((p) => `${p.summary} ${p.excerpt}`).join(" ");
    return filesRef.current.map((f) => f.name).join(" ");
  }, [canon, sample, seed]);

  const segments = useMemo(() => {
    if (names.length === 0) return [passage];
    try {
      const pattern = new RegExp(`(${names.map(escapeRegExp).join("|")})`, "g");
      return passage.split(pattern);
    } catch {
      return [passage];
    }
  }, [passage, names]);

  const hits = useMemo(
    () => segments.filter((s) => names.includes(s)),
    [segments, names],
  );

  const characters = useMemo(() => {
    if (canon) {
      return canon.characters.map((c) => ({
        id: c.id,
        name: c.name,
        art: c.artFile ? imageForFile(c.artFile) : "",
      }));
    }
    return seed.characters.map((c) => ({
      id: c.id,
      name: c.name,
      art: c.artPath ?? "",
    }));
  }, [canon, seed, imageForFile]);

  const fileNames = useMemo(() => files.map((f) => f.name), [files]);

  useEffect(() => {
    if (!active || doneRef.current) return;
    const id = runId.current + 1;
    runId.current = id;
    doneRef.current = true;
    setFailure("");
    setCanon(null);

    if (sample) {
      setIsSample(true);
      setPhase("showing");
      setStatus("Sample");
      const t = window.setTimeout(() => {
        if (runId.current !== id) return;
        setPhase("idle");
        doneRef.current = false;
        onDone(seed, true);
      }, 3000);
      return () => window.clearTimeout(t);
    }

    let cancelled = false;
    setPhase("reading");
    setStatus("Reading your files");

    const run = async () => {
      const sendFiles = filesRef.current.map((file) => ({
        name: file.name,
        type: file.type,
        ...(file.sendText !== undefined ? { text: file.sendText } : {}),
        ...(file.sendDataUrl !== undefined ? { dataUrl: file.sendDataUrl } : {}),
      }));
      let readJson: unknown;
      try {
        const res = await fetch("/api/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: sendFiles,
            ...(idea.trim() ? { idea: idea.trim() } : {}),
          }),
        });
        if (!res.ok) throw new Error(`read failed: ${res.status}`);
        readJson = await res.json();
      } catch {
        if (cancelled || runId.current !== id) return;
        setPhase("error");
        setFailure("I could not read those files. Try again.");
        doneRef.current = false;
        return;
      }
      if (cancelled || runId.current !== id) return;
      const record = readJson as Record<string, unknown>;
      if (record.sample === true && Array.isArray((record as { parts?: unknown }).parts)) {
        const world = record as unknown as World;
        setIsSample(true);
        setPhase("showing");
        setStatus("Sample");
        const t = window.setTimeout(() => {
          if (runId.current !== id) return;
          setPhase("idle");
          doneRef.current = false;
          onDone(world, true);
        }, 3000);
        void t;
        return;
      }
      const parsed = ReadModelOutputSchema.safeParse(readJson);
      if (!parsed.success) {
        setPhase("error");
        setFailure("I could not read those files. Try again.");
        doneRef.current = false;
        return;
      }
      const canonValue = parsed.data;
      const canonAt = Date.now();
      setCanon(canonValue);
      setPhase("planning");
      setStatus("Finding the people and places");
      const labels = new Map(canonValue.files.map((f) => [f.file, f]));
      onFiles(
        filesRef.current.map((file) => {
          const meta = labels.get(file.name);
          if (!meta) return file;
          return { ...file, label: meta.label, kind: meta.kind };
        }),
      );

      await new Promise((resolve) => window.setTimeout(resolve, 600));
      if (cancelled || runId.current !== id) return;
      setStatus("Planning your channels");

      let planJson: unknown;
      try {
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canon: canonValue }),
        });
        if (!res.ok) throw new Error(`plan failed: ${res.status}`);
        planJson = await res.json();
      } catch {
        if (cancelled || runId.current !== id) return;
        setPhase("error");
        setFailure("I could not plan the channels. Try again.");
        doneRef.current = false;
        return;
      }
      if (cancelled || runId.current !== id) return;
      const planRecord = planJson as Record<string, unknown>;
      if (planRecord.sample === true) {
        const world = planJson as unknown as World;
        setPhase("showing");
        setStatus("Sample");
        const wait = Math.max(0, 3000 - (Date.now() - canonAt));
        window.setTimeout(() => {
          if (runId.current !== id) return;
          setPhase("idle");
          doneRef.current = false;
          onDone(world, true);
        }, wait);
        return;
      }
      const channelsRaw = (planRecord as { channels?: unknown }).channels;
      const channels = toPlanChannels(Array.isArray(channelsRaw) ? channelsRaw : []);
      const channelIds = channels.map((c) => c.id);
      const beatsRaw = (planRecord as { beats?: unknown }).beats;
      const beats = toPlanBeats(
        Array.isArray(beatsRaw) ? beatsRaw : [],
        canonValue,
        channelIds,
      );
      const secretsRaw = (planRecord as { secrets?: unknown }).secrets;
      const secrets = toPlanSecrets(
        Array.isArray(secretsRaw) ? secretsRaw : [],
        channelIds,
      );
      const world = buildWorld(canonValue, { channels, beats, secrets }, (name) => {
        const found = filesRef.current.find((f) => f.name === name);
        return found?.displayUrl ?? found?.sendDataUrl ?? "";
      });
      setPhase("showing");
      const wait = Math.max(0, 3000 - (Date.now() - canonAt));
      window.setTimeout(() => {
        if (runId.current !== id) return;
        setPhase("idle");
        doneRef.current = false;
        onDone(world, false);
      }, wait);
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sample, retryKey]);

  const litThrough =
    hits.length === 0 || (!canon && !sample)
      ? -1
      : Math.ceil(hits.length * (phase === "showing" ? 1 : phase === "planning" ? 0.66 : 0.33)) - 1;
  let seen = -1;

  const showPassage = canon || sample;
  const busts = characters.slice(0, 4);

  return (
    <section className={`scene${active ? " on" : ""}`} id="reading">
      <article className="leaf" aria-label="The story being read">
        {!showPassage && (
          <span>
            {fileNames.length > 0 ? fileNames.join(", ") : "Waiting for your files…"}
          </span>
        )}
        {showPassage &&
          segments.map((seg, i) =>
            names.includes(seg) ? (
              (() => {
                seen += 1;
                const lit = seen <= litThrough;
                return (
                  <em key={i} className={lit ? "lit" : ""}>
                    {seg}
                  </em>
                );
              })()
            ) : (
              <span key={i}>{seg}</span>
            ),
          )}
      </article>
      <div className="stack">
        {(canon || sample) &&
          busts.map((bust, i) => (
            <div
              key={bust.id}
              className="bust on"
              style={
                {
                  "--r": i % 2 === 0 ? "-4deg" : "3deg",
                  left: `${(i % 2) * 50}%`,
                  top: `${Math.floor(i / 2) * 48}%`,
                  ...(bust.art
                    ? { backgroundImage: `url(${bust.art})` }
                    : {
                        backgroundColor: "#fbf8f1",
                        backgroundImage: "none",
                      }),
                } as unknown as React.CSSProperties
              }
            >
              <span>{bust.name}</span>
            </div>
          ))}
        {displayWorld && null}
      </div>
      <p className="status">
        {phase === "error" ? (
          <>
            {failure}{" "}
            <button
              type="button"
              className="quiet"
              onClick={() => {
                doneRef.current = false;
                setFailure("");
                setCanon(null);
                setStatus("Reading your files");
                setPhase("reading");
                setRetryKey((k) => k + 1);
              }}
            >
              Retry
            </button>
          </>
        ) : (
          <>
            {isSample || sample ? "Sample · " : ""}
            {status}
          </>
        )}
      </p>
    </section>
  );
}
