"use client";

import { useEffect, useState } from "react";
import type { StoryPack, World } from "@/lib/world/schemas";
import { stripImageData } from "@/lib/story";
import {
  PackModelOutputSchema,
  channelsForPart,
  packForPart,
  packToMarkdown,
  upsertPack,
} from "@/lib/pack";

type Props = {
  world: World;
  partId: string;
  open: boolean;
  onClose: () => void;
  onWorld: (world: World) => void;
};

type PackState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; message: string };

export default function StoryPackDrawer({
  world,
  partId,
  open,
  onClose,
  onWorld,
}: Props) {
  const part = world.parts.find((p) => p.id === partId);
  const covering = channelsForPart(world, partId);
  const [channelId, setChannelId] = useState(
    covering[0]?.id ?? world.channels[0]?.id ?? "",
  );
  const [state, setState] = useState<PackState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ids = new Set(covering.map((c) => c.id));
    setChannelId((prev) =>
      prev && ids.has(prev) ? prev : (covering[0]?.id ?? ""),
    );
    setState({ kind: "idle" });
    setCopied(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partId, world.id]);

  const pack: StoryPack | undefined = channelId
    ? packForPart(world, partId, channelId)
    : undefined;

  const generate = async () => {
    if (!channelId || state.kind === "working") return;
    setState({ kind: "working" });
    try {
      const res = await fetch("/api/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          world: stripImageData(world),
          partId,
          channelId,
        }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          json !== null && typeof json === "object" &&
          (json as Record<string, unknown>).error !== null &&
          typeof (json as Record<string, unknown>).error === "object"
            ? String(
                ((json as Record<string, { message?: unknown }>).error as { message?: unknown }).message ??
                  "The story pack failed.",
              )
            : "The scene notes failed.";
        setState({ kind: "error", message });
        return;
      }
      const output = PackModelOutputSchema.parse(json);
      onWorld(upsertPack(world, { ...output, partId, channelId }));
      setState({ kind: "idle" });
    } catch {
      setState({ kind: "error", message: "The scene notes failed." });
    }
  };

  const copy = async () => {
    if (!pack) return;
    try {
      await navigator.clipboard.writeText(packToMarkdown(world, pack));
      setCopied(true);
    } catch {
      setState({ kind: "error", message: "Copy failed." });
    }
  };

  const sections: Array<{
    title: string;
    blurb: string;
    body: string[] | null;
    empty: string;
  }> = [
    {
      title: "Scene outline",
      blurb: "The beats of the scene in order, in this screen's voice.",
      body: pack ? [pack.script] : null,
      empty: "",
    },
    {
      title: "Shot ideas",
      blurb: "What to show, in plain words.",
      body: pack ? pack.shots : null,
      empty: "",
    },
    {
      title: "Posts",
      blurb: "Short lines to share while the scene is out.",
      body: pack ? pack.posts : null,
      empty: "",
    },
    {
      title: "Reveals",
      blurb: "What this screen lets the audience learn, and when.",
      body: pack ? pack.reveals : null,
      empty: "Nothing new is revealed in this piece.",
    },
  ];

  const download = () => {
    if (!pack) return;
    const blob = new Blob([packToMarkdown(world, pack)], {
      type: "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${partId}-${channelId}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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
      <div className="kicker">Scene notes</div>
      <h2>{part?.title ?? ""}</h2>
      <p style={{ color: "var(--soft)", fontSize: 14, marginTop: 8 }}>
        Working notes for this scene, written for one screen at a time. Pick
        the screen, then ask Muse.
      </p>
      <div className="castlist">
        {covering.map((channel) => (
          <button
            key={channel.id}
            className={channel.id === channelId ? "on" : ""}
            onClick={() => {
              setChannelId(channel.id);
              setState({ kind: "idle" });
              setCopied(false);
            }}
            tabIndex={open ? 0 : -1}
          >
            {channel.name}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          className="pill"
          onClick={() => void generate()}
          disabled={!channelId || state.kind === "working"}
          tabIndex={open ? 0 : -1}
        >
          {state.kind === "working" ? "Writing…" : pack ? "Regenerate" : "Write the notes"}
        </button>
        {pack && (
          <>
            <button
              type="button"
              className="quiet"
              onClick={() => void copy()}
              tabIndex={open ? 0 : -1}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="quiet"
              onClick={download}
              tabIndex={open ? 0 : -1}
            >
              Download .md
            </button>
          </>
        )}
      </div>
      <p className="hint" style={{ color: "var(--soft)", fontSize: 13, marginTop: 12 }}>
        Uses only what that screen is allowed to know.
      </p>
      {state.kind === "error" && (
        <div className="artstate" role="status">
          <p>{state.message}</p>
          <button
            type="button"
            className="quiet"
            onClick={() => void generate()}
            tabIndex={open ? 0 : -1}
          >
            Retry
          </button>
        </div>
      )}
      <div className="notewhat">
        {sections.map((section) => (
          <div className="notew" key={section.title}>
            <b>{section.title}</b>
            <p>{section.blurb}</p>
            {section.body === null ? (
              <>
                <div className="sk" />
                <div className="sk" />
                <div className="sk" />
              </>
            ) : section.body.length > 0 ? (
              section.title === "Scene outline" ? (
                <p style={{ color: "var(--ink)", marginTop: 10 }}>{section.body[0]}</p>
              ) : (
                <ul>
                  {section.body.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )
            ) : (
              <p>{section.empty}</p>
            )}
          </div>
        ))}
        <div className="notew" style={{ gridColumn: "1 / -1", background: "transparent", border: "1.5px dashed rgba(31,27,22,.25)", boxShadow: "none" }}>
          <b>Want the full script or a storyboard?</b>
          <p>Use Script for the scene itself and Storyboard to see it shot by shot. Notes are the quick planning page.</p>
        </div>
      </div>
      {pack && pack.additions.length > 0 && (
        <p className="hint" style={{ color: "var(--soft)", fontSize: 13, marginTop: 12 }}>
          Suggested additions: {pack.additions.join(" ")}
        </p>
      )}
    </div>
  );
}
