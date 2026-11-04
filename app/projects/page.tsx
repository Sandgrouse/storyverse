"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

function Cover({ entry }: { entry: ProjectEntry }) {
  const [url, setUrl] = useState<string | null>(null);
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
  return (
    <div
      className="work-cover"
      style={
        url
          ? { backgroundImage: `url(${url})` }
          : { backgroundImage: "none", backgroundColor: "#e5dccf" }
      }
    />
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
          <button type="button" className="pill" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="quiet" onClick={onKeep}>
            {keepLabel}
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
        <h1>Your projects</h1>
        <Link className="pill" href="/projects/new">
          New story
        </Link>
      </div>
      <p className="library-sub">Saved in this browser.</p>
      <div className="library-grid">
        {(entries ?? []).map((entry) => (
          <article key={entry.id} className="work">
            <button
              type="button"
              onClick={() => openProject(entry)}
              aria-label={`Open ${entry.title}`}
              style={{ display: "contents" }}
            >
              <span style={{ display: "contents" }}>
                <Cover entry={entry} />
                <span className="work-body">
                  <h2>{entry.title}</h2>
                  <span className="work-meta">
                    {entry.sample ? <span className="flag">Sample</span> : null}
                    <span>{timeAgo(entry.updatedAt)}</span>
                  </span>
                </span>
              </span>
            </button>
            <button
              type="button"
              className="quiet work-del"
              onClick={() => setConfirmId(entry.id)}
            >
              {entry.sample ? "Reset sample" : "Delete"}
            </button>
          </article>
        ))}
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
