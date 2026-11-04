"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type PointerEvent } from "react";
import { WorldSchema, type World } from "@/lib/world/schemas";
import {
  deleteProject,
  ensureSample,
  listEntries,
  resetSample,
  timeAgo,
  type ProjectEntry,
} from "@/lib/projects";
import { loadImages } from "@/lib/images";
import seedJson from "@/data/seed/anukili.json";
import {
  pointerRatio,
  tiltBack,
  tiltTo,
} from "@/components/landing/effects";

function seedWorld(): World {
  return WorldSchema.parse(seedJson);
}

function useEntries(): [ProjectEntry[] | null, () => void] {
  const [entries, setEntries] = useState<ProjectEntry[] | null>(null);
  useEffect(() => {
    ensureSample(seedWorld());
    setEntries(listEntries());
  }, []);
  return [entries, () => setEntries(listEntries())];
}

function useFinePointer(): boolean {
  const [fine] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: fine)").matches,
  );
  return fine;
}

function Cover({ entry, onOpen }: { entry: ProjectEntry; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const fine = useFinePointer();
  useEffect(() => {
    let live = true;
    if (!entry.cover) {
      setUrl(null);
      return;
    }
    if (!entry.cover.startsWith("idb:")) {
      setUrl(entry.cover);
      return;
    }
    void loadImages(entry.id).then((images) => {
      if (!live) return;
      setUrl(images[entry.cover.slice(4)] ?? null);
    });
    return () => {
      live = false;
    };
  }, [entry.id, entry.cover]);
  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    const { px, py } = pointerRatio(e.currentTarget, e.clientX, e.clientY);
    tiltTo(e.currentTarget, px, py);
  };
  const onLeave = (e: PointerEvent<HTMLAnchorElement>) => {
    tiltBack(e.currentTarget);
  };
  return (
    <a
      className={`cover${url ? "" : " none"}`}
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onOpen();
      }}
      onPointerMove={fine ? onMove : undefined}
      onPointerLeave={fine ? onLeave : undefined}
      aria-label={`Open ${entry.title}`}
      style={url ? { backgroundImage: `url(${url})` } : undefined}
    >
      {url ? null : entry.title}
    </a>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  keepLabel,
  onConfirm,
  onKeep,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  keepLabel: string;
  onConfirm: () => void;
  onKeep: () => void;
}) {
  return (
    <div className="confirm-veil" role="dialog" aria-modal="true" aria-label={title}>
      <div className="confirm">
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="confirm-acts">
          <button type="button" className="pill light" onClick={onKeep}>
            {keepLabel}
          </button>
          <button type="button" className="pill danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const [entries, refresh] = useEntries();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirming = entries?.find((e) => e.id === confirmId) ?? null;

  const openProject = (entry: ProjectEntry) => {
    router.push(
      entry.channelsConfirmed
        ? `/projects/${entry.id}/story`
        : `/projects/${entry.id}/understood`,
    );
  };

  return (
    <main className="library">
      <div className="library-head">
        <div>
          <h1>Your projects</h1>
          <div className="library-note">Saved in this browser.</div>
        </div>
        <Link className="pill" href="/projects/new">
          New story
        </Link>
      </div>
      <div className="library-grid">
        {(entries ?? []).map((entry) => (
          <article key={entry.id} className="story">
            <Cover entry={entry} onOpen={() => openProject(entry)} />
            <div className="meta">
              <div>
                <h2>
                  {entry.title}
                  {entry.sample ? <span className="tag">Sample</span> : null}
                </h2>
                <div className="sub">{timeAgo(entry.updatedAt)}</div>
              </div>
              <button
                type="button"
                className="act"
                onClick={() => setConfirmId(entry.id)}
              >
                {entry.sample ? "Reset sample" : "Delete"}
              </button>
            </div>
          </article>
        ))}
        <Link className="library-new" href="/projects/new">
          + New story
        </Link>
      </div>
      {confirming ? (
        confirming.sample ? (
          <ConfirmDialog
            title="Reset the sample?"
            body="This removes your changes to the sample and restores the original."
            confirmLabel="Reset sample"
            keepLabel="Keep my changes"
            onKeep={() => setConfirmId(null)}
            onConfirm={() => {
              resetSample(seedWorld());
              setConfirmId(null);
              refresh();
            }}
          />
        ) : (
          <ConfirmDialog
            title={`Delete ${confirming.title}?`}
            body="This removes the story and its images from this browser. This can't be undone."
            confirmLabel="Delete story"
            keepLabel="Keep story"
            onKeep={() => setConfirmId(null)}
            onConfirm={() => {
              deleteProject(confirming.id);
              setConfirmId(null);
              refresh();
            }}
          />
        )
      ) : null}
    </main>
  );
}
