"use client";

import { useEffect, useRef, useState } from "react";
import type { World } from "@/lib/world/schemas";

type Card = {
  id: string;
  title: string;
  tag: string;
  color: string;
  image?: string;
  body?: string;
};

const TAG_COLORS = ["#2f5fd0", "#3d7a58", "#a8476a", "#a9771f", "#2c7f93"];

function tagForFile(file: File): { tag: string; color: string } {
  if (file.type.startsWith("image/")) return { tag: "Image", color: "#2c7f93" };
  if (file.type.startsWith("video/")) return { tag: "Video", color: "#a8476a" };
  if (file.type.startsWith("audio/")) return { tag: "Audio", color: "#a9771f" };
  if (
    file.type.startsWith("text/") ||
    file.type.includes("pdf") ||
    file.type.includes("document") ||
    file.type.includes("word")
  )
    return { tag: "Document", color: "#2f5fd0" };
  return { tag: "File", color: "#6f675a" };
}

function sampleCards(world: World): Card[] {
  const cards: Card[] = [
    {
      id: "sample-treatment",
      title: world.title,
      tag: "Story treatment",
      color: TAG_COLORS[0],
      body: world.premise,
    },
  ];
  world.characters
    .filter((c) => c.artPath)
    .forEach((c, i) => {
      cards.push({
        id: `sample-${c.id}`,
        title: c.name,
        tag: c.name,
        color: TAG_COLORS[(i + 1) % TAG_COLORS.length],
        image: c.artPath,
      });
    });
  const firstChannel = world.channels[0]?.id;
  const scenic = world.parts.filter((p) =>
    world.beats.some((b) => b.partId === p.id && b.channelId !== firstChannel),
  );
  scenic.forEach((p, i) => {
    cards.push({
      id: `sample-${p.id}`,
      title: p.title,
      tag: p.title,
      color: TAG_COLORS[(i + 2) % TAG_COLORS.length],
      image: p.imagePath,
    });
  });
  return cards;
}

type Props = {
  active: boolean;
  world: World;
  onBack: () => void;
  onRead: () => void;
};

export default function BringScene({ active, world, onBack, onRead }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [shown, setShown] = useState(0);
  const [dragging, setDragging] = useState(false);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    if (!active || cards.length === 0) return;
    setShown(0);
    const id = window.setInterval(() => {
      setShown((prev) => {
        if (prev >= cards.length) {
          window.clearInterval(id);
          return prev;
        }
        return prev + 1;
      });
    }, 170);
    return () => window.clearInterval(id);
  }, [active, cards]);

  useEffect(() => {
    const keep = urls.current;
    return () => {
      keep.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const addFiles = (files: FileList | File[]) => {
    setCards((prev) => {
      const next: Card[] = [...prev];
      for (const file of Array.from(files)) {
        const { tag, color } = tagForFile(file);
        const card: Card = {
          id: `${file.name}-${file.size}-${next.length}`,
          title: file.name,
          tag,
          color,
        };
        if (file.type.startsWith("image/")) {
          const url = URL.createObjectURL(file);
          urls.current.push(url);
          card.image = url;
        } else {
          card.body = file.name;
        }
        next.push(card);
      }
      return next;
    });
  };

  const ready = cards.length > 0;
  const spacing = cards.length > 5 ? 140 : 190;

  return (
    <section className={`scene${active ? " on" : ""}`} id="bring">
      <div className="logo">Storyverse</div>
      <div className="top">
        <h1 className="big" style={{ fontSize: "clamp(34px, 4.2vw, 60px)" }}>
          Bring me what you have.
        </h1>
        <p className="lede">Don&rsquo;t sort it first. I&rsquo;ll work out what each piece is.</p>
      </div>
      <div
        className="fan"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
        style={dragging ? { outline: "2px solid var(--clay)", borderRadius: 14 } : undefined}
      >
        {!ready && (
          <div className="bring-empty">
            <div className="drop">
              <b>Drop files here</b>
              <span>or choose them from your device</span>
              <input
                type="file"
                multiple
                aria-label="Choose files to bring in"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
                }}
              />
            </div>
            <button
              type="button"
              className="pill light"
              onClick={() => setCards(sampleCards(world))}
            >
              Use the sample project
            </button>
          </div>
        )}
        {cards.map((card, i) => {
          const o = i - (cards.length - 1) / 2;
          const placed =
            i < shown
              ? `translate(${o * spacing}px, ${Math.abs(o) * 12}px) rotate(${o * 4}deg)`
              : `translate(${o * 40}px, 50px) rotate(${o * 2}deg)`;
          return (
            <div
              key={card.id}
              className={`file${card.body && !card.image ? " doc" : ""}${i < shown ? " in" : ""}`}
              style={{
                ...(card.image ? { backgroundImage: `url(${card.image})` } : undefined),
                transform: placed,
                zIndex: 10 - Math.abs(o),
              }}
            >
              {card.body && !card.image && (
                <>
                  <h4>{card.title}</h4>
                  {card.body}
                </>
              )}
              <span className="tag" style={{ background: card.color }}>
                {card.tag}
              </span>
            </div>
          );
        })}
      </div>
      <p className="gapnote">
        {ready
          ? "You have a story and some art. You don't have character sheets or a channel plan yet. I can make both."
          : ""}
      </p>
      <div className="foot">
        <button className="quiet" onClick={onBack}>
          Back
        </button>
        <button className="pill" disabled={!ready} onClick={onRead}>
          Read my story
        </button>
      </div>
    </section>
  );
}
