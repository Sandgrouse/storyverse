"use client";

import { useState } from "react";
import type { ChannelKind, Secret, World } from "@/lib/world/schemas";

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

  const openCard = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    onOpen();
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
                onClick={onOpen}
                onKeyDown={openCard}
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
