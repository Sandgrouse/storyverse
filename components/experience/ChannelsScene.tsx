"use client";

import type { World } from "@/lib/world/schemas";

type Props = {
  active: boolean;
  world: World;
  onOpen: () => void;
};

export default function ChannelsScene({ active, world, onOpen }: Props) {
  return (
    <section className={`scene${active ? " on" : ""}`} id="channels">
      <div className="logo">Storyverse</div>
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
          const secret =
            world.secrets.find((s) => s.knownThrough.includes(channel.id))?.text ??
            channel.secret ??
            "";
          const pitch = channel.pitch || channel.tagline;
          return (
            <button
              key={channel.id}
              className="ch"
              style={
                partForArt?.imagePath
                  ? { backgroundImage: `url(${partForArt.imagePath})` }
                  : { backgroundImage: "none", backgroundColor: tint }
              }
              onClick={onOpen}
            >
              <small>{channel.name}</small>
              <h3>{channel.title}</h3>
              <p>
                {pitch}
                {secret ? ` Only here: ${secret}.` : ""}
              </p>
            </button>
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
