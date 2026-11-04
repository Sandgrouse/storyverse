"use client";

import type { Secret, World } from "@/lib/world/schemas";

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

export default function ChannelsScene({
  active = true,
  world,
  onWorld,
  onOpen,
}: Props) {
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

  const openCard = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    onOpen();
  };

  return (
    <section className={`scene${active ? " on" : ""}`} id="channels">
      <div className="top" style={{ top: "7vh" }}>
        <h1 className="big" style={{ fontSize: "clamp(32px, 3.8vw, 54px)" }}>
          Give each screen its own secret.
        </h1>
        <p className="lede">
          Here&rsquo;s how I&rsquo;d split it, so fans follow you across all
          three.
        </p>
      </div>
      <div className="tall">
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
              className="ch chbtn"
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
              <p className="pitch" title={pitch}>
                {pitch}
              </p>
              {secretText ? (
                <p className="only" title={`Only here: ${secretText}.`}>
                  Only here: {secretText}.
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
      </div>
      <div className="foot">
        <button className="quiet">Add a channel</button>
        <button className="pill" onClick={onOpen}>
          Open my world
        </button>
      </div>
    </section>
  );
}
