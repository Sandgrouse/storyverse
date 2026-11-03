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
            : "The story pack failed.";
        setState({ kind: "error", message });
        return;
      }
      const output = PackModelOutputSchema.parse(json);
      onWorld(upsertPack(world, { ...output, partId, channelId }));
      setState({ kind: "idle" });
    } catch {
      setState({ kind: "error", message: "The story pack failed." });
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
      <div className="kicker">Story Pack</div>
      <h2>{part?.title ?? ""}</h2>
      {part?.imagePath && (
        <div
          className="packart"
          style={{ backgroundImage: `url(${part.imagePath})` }}
          role="img"
          aria-label={`Art for ${part.title}`}
        />
      )}
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
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          className="pill"
          onClick={() => void generate()}
          disabled={!channelId || state.kind === "working"}
          tabIndex={open ? 0 : -1}
        >
          {state.kind === "working" ? "Writing…" : pack ? "Regenerate" : "Generate"}
        </button>
      </div>
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
      {pack && (
        <div className="packbody">
          <small>Script</small>
          <p>{pack.script}</p>
          <small>Shots</small>
          <ul>
            {pack.shots.map((shot, i) => (
              <li key={i}>{shot}</li>
            ))}
          </ul>
          <small>Posts</small>
          <ul>
            {pack.posts.map((post, i) => (
              <li key={i}>{post}</li>
            ))}
          </ul>
          <small>Reveals</small>
          {pack.reveals.length > 0 ? (
            <ul>
              {pack.reveals.map((reveal, i) => (
                <li key={i}>{reveal}</li>
              ))}
            </ul>
          ) : (
            <p>Nothing new is revealed in this piece.</p>
          )}
          <small>Additions</small>
          {pack.additions.length > 0 ? (
            <ul>
              {pack.additions.map((addition, i) => (
                <li key={i}>{addition}</li>
              ))}
            </ul>
          ) : (
            <p>Nothing invented: everything above is canon.</p>
          )}
          <div className="acts">
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
          </div>
        </div>
      )}
    </div>
  );
}
