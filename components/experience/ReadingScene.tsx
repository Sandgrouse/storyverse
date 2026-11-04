"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { World } from "@/lib/world/schemas";
import { ReadModelOutputSchema, type ReadModelOutput } from "@/lib/read";
import { buildWorld } from "@/lib/story";
import { toPlanBeats, toPlanChannels, toPlanSecrets } from "@/lib/plan";
import type { ClientFile } from "@/components/projects/DraftContext";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Props = {
  files: ClientFile[];
  idea?: string;
  seed: World;
  sample: boolean;
  /** Merge instruction for the add-material read. Kept in the same route. */
  instruction?: string;
  /** Extra text files sent with the read, e.g. current-story.txt. */
  extraTextFiles?: Array<{ name: string; text: string }>;
  backHref?: string;
  onLabels?: (files: ClientFile[]) => void;
  /** Called only when the user presses "See what I found". */
  onDone: (world: World, sample: boolean) => void;
};

type Phase = "idle" | "reading" | "planning" | "showing" | "error";

/** The server's message when it has one, so a budget stop reads as one. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  const json: unknown = await res.clone().json().catch(() => null);
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

export default function ReadingScene({
  files,
  idea = "",
  seed,
  sample,
  instruction,
  extraTextFiles,
  backHref,
  onLabels,
  onDone,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("Reading your files");
  const [canon, setCanon] = useState<ReadModelOutput | null>(null);
  const [result, setResult] = useState<{ world: World; sample: boolean } | null>(
    null,
  );
  const [failure, setFailure] = useState("");
  const [isSample, setIsSample] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const runId = useRef(0);
  const filesRef = useRef(files);
  filesRef.current = files;
  const onLabelsRef = useRef(onLabels);
  onLabelsRef.current = onLabels;

  const imageForFile = useMemo(() => {
    const map = new Map<string, string>();
    for (const file of files) {
      if (file.displayUrl) map.set(file.name, file.displayUrl);
      else if (file.sendDataUrl) map.set(file.name, file.sendDataUrl);
    }
    return (name: string) => map.get(name) ?? "";
  }, [files]);

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
    const id = runId.current + 1;
    runId.current = id;
    setFailure("");
    setCanon(null);
    setResult(null);

    if (sample) {
      setIsSample(true);
      setPhase("showing");
      setStatus("Finished reading");
      setResult({ world: seed, sample: true });
      return;
    }

    let cancelled = false;
    setPhase("reading");
    setStatus("Reading your files");

    const run = async () => {
      const sendFiles = [
        ...filesRef.current.map((file) => ({
          name: file.name,
          type: file.type,
          ...(file.sendText !== undefined ? { text: file.sendText } : {}),
          ...(file.sendDataUrl !== undefined
            ? { dataUrl: file.sendDataUrl }
            : {}),
        })),
        ...(extraTextFiles ?? []).map((file) => ({
          name: file.name,
          type: "text/plain",
          text: file.text,
        })),
      ];
      let readJson: unknown;
      try {
        const res = await fetch("/api/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: sendFiles,
            ...(idea.trim() ? { idea: idea.trim() } : {}),
            ...(instruction ? { instruction } : {}),
          }),
        });
        if (!res.ok) {
          throw new Error(
            await errorMessage(res, "I could not read those files. Try again."),
          );
        }
        readJson = await res.json();
      } catch (e) {
        if (cancelled || runId.current !== id) return;
        setPhase("error");
        setFailure(
          e instanceof Error ? e.message : "I could not read those files. Try again.",
        );
        return;
      }
      if (cancelled || runId.current !== id) return;
      const record = readJson as Record<string, unknown>;
      if (record.sample === true && Array.isArray((record as { parts?: unknown }).parts)) {
        const world = record as unknown as World;
        setIsSample(true);
        setPhase("showing");
        setStatus("Finished reading");
        setResult({ world, sample: true });
        return;
      }
      const parsed = ReadModelOutputSchema.safeParse(readJson);
      if (!parsed.success) {
        setPhase("error");
        setFailure("I could not read those files. Try again.");
        return;
      }
      const canonValue = parsed.data;
      setCanon(canonValue);
      setPhase("planning");
      setStatus("Finding the people and places");
      const labels = new Map(canonValue.files.map((f) => [f.file, f]));
      onLabelsRef.current?.(
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
        if (!res.ok) {
          throw new Error(
            await errorMessage(res, "I could not plan the channels. Try again."),
          );
        }
        planJson = await res.json();
      } catch (e) {
        if (cancelled || runId.current !== id) return;
        setPhase("error");
        setFailure(
          e instanceof Error ? e.message : "I could not plan the channels. Try again.",
        );
        return;
      }
      if (cancelled || runId.current !== id) return;
      const planRecord = planJson as Record<string, unknown>;
      if (planRecord.sample === true) {
        const world = planJson as unknown as World;
        setPhase("showing");
        setStatus("Finished reading");
        setResult({ world, sample: true });
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
      setStatus("Finished reading");
      setResult({ world, sample: false });
    };

    void run();
    // Leaving while a read is running cancels it.
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample, retryKey]);

  const litThrough =
    hits.length === 0 || (!canon && !sample)
      ? -1
      : Math.ceil(hits.length * (phase === "showing" ? 1 : phase === "planning" ? 0.66 : 0.33)) - 1;
  let seen = -1;

  const showPassage = canon || sample;
  const busts = characters.slice(0, 4);
  const finished = phase === "showing" && result !== null;
  const failed = phase === "error";

  const retry = () => {
    setFailure("");
    setCanon(null);
    setResult(null);
    setStatus("Reading your files");
    setPhase("reading");
    setRetryKey((k) => k + 1);
  };

  return (
    <section className="scene on" id="reading">
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
              className={`bust on${bust.art ? "" : " bare"}`}
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
      </div>
      <p className="status">
        {failed ? (
          <>{failure}</>
        ) : (
          <>
            {isSample || sample ? "Sample · " : ""}
            {status}
          </>
        )}
      </p>
      <div className="foot">
        <span>
          {failed && backHref ? (
            <Link className="quiet" href={backHref}>
              Back
            </Link>
          ) : null}
        </span>
        {failed ? (
          <button type="button" className="pill" onClick={retry}>
            Try again
          </button>
        ) : finished && result ? (
          <button
            type="button"
            className="pill"
            onClick={() => onDone(result.world, result.sample)}
          >
            See what I found
          </button>
        ) : (
          <button type="button" className="pill" disabled>
            See what I found
          </button>
        )}
      </div>
    </section>
  );
}
