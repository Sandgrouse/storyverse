"use client";

import { useState } from "react";
import type { World } from "@/lib/world/schemas";
import {
  downscaleImageDataUrl,
  isAcceptedFile,
  largestFileName,
  overLimit,
  readFileAsDataUrl,
  readFileAsText,
  type SendableFile,
} from "@/lib/files";
import { gapNoteForKinds } from "@/lib/story";
import type { ClientFile } from "./Experience";

type Card = {
  id: string;
  title: string;
  tag: string;
  color: string;
  image?: string;
  body?: string;
};

const TAG_COLORS = ["#2f5fd0", "#3d7a58", "#a8476a", "#a9771f", "#2c7f93"];

function inferredKind(file: ClientFile): string {
  if (file.kind) return file.kind;
  if (file.type.startsWith("image/") || file.displayUrl) return "scene_art";
  return "story";
}

type Props = {
  active: boolean;
  files: ClientFile[];
  onFiles: (files: ClientFile[]) => void;
  seed: World;
  sample: boolean;
  onSample: () => void;
  onBack: () => void;
  onRead: () => void;
};

export default function BringScene({
  active,
  files,
  onFiles,
  seed,
  sample,
  onSample,
  onBack,
  onRead,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  const cards: Card[] = files.map((file, i) => ({
    id: file.id,
    title: file.name,
    tag: file.label ?? file.name,
    color: TAG_COLORS[i % TAG_COLORS.length] ?? "#6f675a",
    image: file.displayUrl,
    body: file.displayUrl ? undefined : file.sendText?.slice(0, 140) ?? file.name,
  }));

  const sampleCards: Card[] = sample
    ? [
        {
          id: "sample-treatment",
          title: seed.title,
          tag: "Story treatment",
          color: TAG_COLORS[0] ?? "#2f5fd0",
          body: seed.premise,
        },
        ...seed.characters
          .filter((c) => c.artPath)
          .slice(0, 2)
          .map((c, i) => ({
            id: `sample-${c.id}`,
            title: c.name,
            tag: c.name,
            color: TAG_COLORS[(i + 1) % TAG_COLORS.length] ?? "#3d7a58",
            image: c.artPath,
          })),
      ]
    : [];

  // Every dropped file appears in the fan at once: staggering the reveal
  // left later cards invisible when the count changed mid-animation.
  const visible = sample && files.length === 0 ? sampleCards : cards;

  const kinds = new Set(
    files.map((file) => inferredKind(file)).filter((kind) => kind.length > 0),
  );
  if (sample && files.length === 0) {
    kinds.add("story");
    kinds.add("scene_art");
  }
  const gapnote =
    files.length > 0 || sample ? gapNoteForKinds(kinds) : "";

  const toSendable = (list: ClientFile[]): SendableFile[] =>
    list.map((file) => ({
      name: file.name,
      type: file.type,
      dataUrl: file.sendDataUrl ?? (file.displayUrl?.startsWith("data:") ? file.displayUrl : undefined),
      text: file.sendText,
    }));

  const addFiles = async (incoming: FileList | File[]) => {
    setError("");
    const rejected: string[] = [];
    const accepted: File[] = [];
    for (const file of Array.from(incoming)) {
      if (!isAcceptedFile(file.name, file.type)) {
        rejected.push(file.name);
      } else {
        accepted.push(file);
      }
    }
    if (rejected.length > 0) {
      setError(
        `I can read PDF, .md, .txt and images. Skipped: ${rejected.join(", ")}.`,
      );
    }
    if (accepted.length === 0) return;
    setWorking(true);
    try {
      const next: ClientFile[] = [];
      for (const file of accepted) {
        const id = `${file.name}-${file.size}-${Date.now()}-${next.length}`;
        if (file.type.startsWith("image/")) {
          const original = await readFileAsDataUrl(file);
          const small = await downscaleImageDataUrl(original);
          next.push({
            id,
            name: file.name,
            type: file.type,
            size: file.size,
            displayUrl: original,
            sendDataUrl: small,
          });
        } else if (
          file.name.toLowerCase().endsWith(".md") ||
          file.name.toLowerCase().endsWith(".markdown") ||
          file.name.toLowerCase().endsWith(".txt") ||
          file.type.startsWith("text/")
        ) {
          const text = await readFileAsText(file);
          next.push({
            id,
            name: file.name,
            type: file.type || "text/plain",
            size: file.size,
            sendText: text,
          });
        } else {
          const dataUrl = await readFileAsDataUrl(file);
          next.push({
            id,
            name: file.name,
            type: file.type || "application/pdf",
            size: file.size,
            sendDataUrl: dataUrl,
          });
        }
      }
      const combined = [...files, ...next];
      if (overLimit(toSendable(combined))) {
        const big = largestFileName(toSendable(combined)) ?? next[0]?.name ?? "A file";
        setError(
          `${big} is too large. Keep the total under 4MB so it fits in one request.`,
        );
        return;
      }
      onFiles(combined);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "I could not read those files. Try again.",
      );
    } finally {
      setWorking(false);
    }
  };

  const ready = files.length > 0 || sample;
  const spacing = visible.length > 5 ? 140 : 190;

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
          if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
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
                accept="application/pdf,.md,.markdown,.txt,image/*"
                aria-label="Choose files to bring in"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    void addFiles(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
            </div>
            <button type="button" className="pill light" onClick={onSample}>
              Use the sample project
            </button>
          </div>
        )}
        {visible.map((card, i) => {
          const o = i - (visible.length - 1) / 2;
          const placed = `translate(${o * spacing}px, ${Math.abs(o) * 12}px) rotate(${o * 4}deg)`;
          return (
            <div
              key={card.id}
              className={`file${card.body && !card.image ? " doc" : ""} in`}
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
      <p className="gapnote">{error ? error : working ? "Reading those files…" : gapnote}</p>
      <div className="foot">
        <button className="quiet" onClick={onBack}>
          Back
        </button>
        {!sample && (
          <button type="button" className="pill light" onClick={onSample}>
            Use the sample project
          </button>
        )}
        <button className="pill" disabled={!ready || working} onClick={onRead}>
          Read my story
        </button>
      </div>
    </section>
  );
}
