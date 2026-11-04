"use client";

import Link from "next/link";
import CanonBook from "@/components/experience/CanonBook";
import { MissingStory, useProject } from "@/components/projects/ProjectContext";

/** The book with no reading animation. Back goes to Story. */
export default function CanonPage() {
  const { status, world } = useProject();

  if (status === "loading" || !world) {
    if (status === "missing") return <MissingStory />;
    return <main />;
  }

  return (
    <main>
      <CanonBook world={world} />
      <div className="canon-foot">
        <Link className="quiet" href={`/projects/${world.id}/story`}>
          Back
        </Link>
        <span className="canon-status">{world.title}</span>
        <span />
      </div>
    </main>
  );
}
