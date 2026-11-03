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
        {world.channels.map((channel) => (
          <button
            key={channel.id}
            className="ch"
            style={{ backgroundImage: `url(${channel.imagePath})` }}
            onClick={onOpen}
          >
            <small>{channel.name}</small>
            <h3>{channel.title}</h3>
            <p>
              {channel.tagline} Only here: {channel.secret}.
            </p>
          </button>
        ))}
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
