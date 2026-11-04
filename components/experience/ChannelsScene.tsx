"use client";

import { useState } from "react";
import type { Channel, ChannelKind, Secret, World } from "@/lib/world/schemas";
import {
  CHANNEL_KIND_LABELS,
  removeChannel,
  updateChannel,
} from "@/lib/channels";

type Props = {
  active?: boolean;
  world: World;
  onWorld: (world: World) => void;
  onOpen: () => void;
};

function secretForChannel(
  world: World,
  channelId: string,
): Secret | undefined {
  return world.secrets.find((s) => s.knownThrough.includes(channelId));
}

const KIND_OPTIONS: Array<{ label: string; kind: ChannelKind }> = [
  { label: "Series", kind: "series" },
  { label: "Game", kind: "game" },
  { label: "Shorts", kind: "shorts" },
  { label: "Film", kind: "film" },
  { label: "Website", kind: "website" },
  { label: "Ad", kind: "ad" },
  { label: "Other", kind: "other" },
];

export default function ChannelsScene({
  active = true,
  world,
  onWorld,
  onOpen,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<ChannelKind>("series");
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing =
    editingId !== null
      ? (world.channels.find((c) => c.id === editingId) ?? null)
      : null;

  const openEditor = (channelId: string) => setEditingId(channelId);
  const closeEditor = () => setEditingId(null);

  const acceptSecret = (secretId: string) => {
    onWorld({
      ...world,
      secrets: world.secrets.map((s) =>
        s.id === secretId ? { ...s, suggested: false } : s,
      ),
    });
  };

  const removeSecret = (secretId: string) => {
    onWorld({
      ...world,
      secrets: world.secrets.filter((s) => s.id !== secretId),
    });
  };

  const addChannel = () => {
    const label =
      KIND_OPTIONS.find((option) => option.kind === kind)?.label ?? "Screen";
    const title = name.trim() || label;
    const id = `screen-${Date.now().toString(36)}`;
    onWorld({
      ...world,
      channels: [
        ...world.channels,
        {
          id,
          name: label,
          kind,
          title,
          tagline: "",
          pitch: "",
          secret: "",
          imagePath: "",
        },
      ],
    });
    setAdding(false);
    setKind("series");
    setName("");
  };

  const openCard =
    (channelId: string) => (event: React.KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if ((event.target as HTMLElement).closest("button")) return;
      event.preventDefault();
      openEditor(channelId);
    };

  return (
    <section className={`scene${active ? " on" : ""}`} id="channels">
      <div className="chanwrap">
        <div className="kicker">Where your story goes</div>
        <h1 className="big" style={{ fontSize: "clamp(32px, 3.8vw, 54px)" }}>
          Choose the screens it will live on.
        </h1>
        <p className="sub">
          Each one tells the story its own way, and keeps one secret the
          others don&rsquo;t know. People who want the whole truth have to
          follow them all.
        </p>
        <div className="chanrow">
          {world.channels.map((channel) => {
            const covering = world.beats.filter((b) => b.channelId === channel.id);
            const partForArt = covering
              .map((b) => world.parts.find((p) => p.id === b.partId))
              .find((p) => p?.imagePath);
            const tint =
              covering
                .map((b) => world.parts.find((p) => p.id === b.partId))
                .find((p) => p?.tint)?.tint ?? "#e9e0ce";
            const secret = secretForChannel(world, channel.id);
            const secretText = secret?.text ?? channel.secret ?? "";
            const pitch = channel.pitch || channel.tagline;
            return (
              <div
                key={channel.id}
                className="chancard"
                role="button"
                tabIndex={0}
                aria-label={`${channel.name}: ${channel.title}`}
                style={
                  partForArt?.imagePath
                    ? { backgroundImage: `url(${partForArt.imagePath})` }
                    : { backgroundImage: "none", backgroundColor: tint }
                }
                onClick={() => openEditor(channel.id)}
                onKeyDown={openCard(channel.id)}
              >
                <small>{channel.name}</small>
                <h3>{channel.title}</h3>
                {pitch ? <p title={pitch}>{pitch}</p> : null}
                {secretText ? (
                  <p className="sec" title={`Only here: ${secretText}.`}>
                    <b>Only here</b>
                    {secretText}.
                  </p>
                ) : null}
                {secret?.suggested ? (
                  <span className="sugrow" onClick={(e) => e.stopPropagation()}>
                    <span className="sug">Suggested</span>
                    <button
                      type="button"
                      className="sugbtn"
                      onClick={(e) => {
                        e.stopPropagation();
                        acceptSecret(secret.id);
                      }}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="sugbtn"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSecret(secret.id);
                      }}
                    >
                      Remove
                    </button>
                  </span>
                ) : null}
              </div>
            );
          })}
          {adding ? (
            <div className="chanadd" style={{ cursor: "default" }}>
              <select
                aria-label="Screen kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as ChannelKind)}
                style={{ maxWidth: "100%" }}
              >
                {KIND_OPTIONS.map((option) => (
                  <option key={option.kind} value={option.kind}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                aria-label="Screen name"
                placeholder="Name this screen"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ maxWidth: "100%" }}
              />
              <button type="button" className="pill small" onClick={addChannel}>
                Add
              </button>
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setAdding(false);
                  setKind("series");
                  setName("");
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="chanadd"
              onClick={() => setAdding(true)}
              aria-label="Add a screen"
            >
              <b>+</b>
              Add a screen
              <small>Series, game, shorts, film, website, ad…</small>
            </button>
          )}
        </div>
        {editing && (
          <ChannelEditor
            world={world}
            channel={editing}
            onWorld={onWorld}
            onClose={closeEditor}
          />
        )}
        <p className="help" style={{ maxWidth: 560, margin: "22px auto 0", color: "var(--soft)", fontSize: 14 }}>
          A screen can be anything the story is told on. A secret is optional.
          A single ad on one screen may not need one.
        </p>
        <div className="foot" style={{ position: "static", width: "100%", marginTop: "auto", padding: "22px 0" }}>
          <span />
          <button className="pill" onClick={onOpen}>
            Open my world
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * One screen's editor: title, pitch, kind and an optional secret, saved
 * as you type, plus Remove behind a confirm. Only "Open my world"
 * opens the world; clicking a card lands here.
 */
function ChannelEditor({
  world,
  channel,
  onWorld,
  onClose,
}: {
  world: World;
  channel: Channel;
  onWorld: (world: World) => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const attached = secretForChannel(world, channel.id);
  const apply = (next: {
    title?: string;
    pitch?: string;
    kind?: ChannelKind;
    name?: string;
    secret?: string;
  }) => onWorld(updateChannel(world, channel.id, next));

  const remove = () => {
    onWorld(removeChannel(world, channel.id));
    onClose();
  };

  return (
    <div
      className="chanedit-wrap"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div
        className="chanedit"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit the ${channel.title} screen`}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Edit this screen</h3>
        <p className="lede">Saved as you type.</p>
        <label htmlFor="chanedit-title">Title</label>
        <input
          id="chanedit-title"
          type="text"
          autoFocus
          autoComplete="off"
          value={channel.title}
          onChange={(event) => apply({ title: event.target.value })}
        />
        <label htmlFor="chanedit-pitch">Pitch</label>
        <textarea
          id="chanedit-pitch"
          rows={3}
          value={channel.pitch}
          onChange={(event) => apply({ pitch: event.target.value })}
        />
        <label htmlFor="chanedit-kind">Kind</label>
        <select
          id="chanedit-kind"
          value={channel.kind}
          onChange={(event) => {
            const kind = event.target.value as ChannelKind;
            apply({ kind, name: CHANNEL_KIND_LABELS[kind] ?? kind });
          }}
        >
          {(
            Object.entries(CHANNEL_KIND_LABELS) as Array<[ChannelKind, string]>
          ).map(([kind, label]) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </select>
        <label htmlFor="chanedit-secret">Secret (optional)</label>
        <input
          id="chanedit-secret"
          type="text"
          autoComplete="off"
          placeholder="Only this screen knows…"
          value={channel.secret}
          onChange={(event) => apply({ secret: event.target.value })}
        />
        {attached && attached.text.length > 0 && (
          <p className="lede" style={{ marginTop: 10 }}>
            This screen also reveals a story secret: {attached.text}
          </p>
        )}
        {confirming ? (
          <div className="confirm">
            <p>Remove this screen?</p>
            <div className="row" style={{ marginTop: 0 }}>
              <button type="button" className="quiet danger" onClick={remove}>
                Remove it
              </button>
              <button
                type="button"
                className="quiet"
                onClick={() => setConfirming(false)}
              >
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button
              type="button"
              className="quiet danger"
              onClick={() => setConfirming(true)}
            >
              Remove
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" className="pill" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
