"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { shouldRedirectFromReading } from "@/lib/nav";
import { WorldSchema, type World } from "@/lib/world/schemas";
import ReadingScene from "@/components/experience/ReadingScene";
import { useNewDraft } from "@/components/projects/DraftContext";
import {
  SAMPLE_ID,
  createProjectId,
  ensureSample,
  saveProject,
} from "@/lib/projects";
import seedJson from "@/data/seed/anukili.json";

export default function NewReadingPage() {
  const router = useRouter();
  const { files, setFiles, idea, sample, clear } = useNewDraft();
  const seed = WorldSchema.parse(seedJson) as World;
  // Render the safe initial state first so the first client paint matches
  // the server, then decide after mount: no hydration errors.
  const [mounted, setMounted] = useState(false);
  // Set the moment "See what I found" runs: clear() empties the draft
  // before navigation finishes, and without this the bounce below wins.
  const leavingRef = useRef(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const empty = !sample && files.length === 0 && idea.trim().length === 0;

  useEffect(() => {
    if (
      shouldRedirectFromReading({
        ready: mounted,
        empty,
        leaving: leavingRef.current,
      })
    ) {
      router.replace("/projects/new/material");
    }
  }, [mounted, empty, router]);

  if (!mounted || empty) return <main />;

  return (
    <main>
      <ReadingScene
        files={files}
        idea={idea}
        seed={seed}
        sample={sample}
        backHref="/projects/new/material"
        onLabels={setFiles}
        onDone={(world: World, nextSample: boolean) => {
          leavingRef.current = true;
          if (nextSample || sample) {
            ensureSample(seed);
            clear();
            router.push(`/projects/${SAMPLE_ID}/understood`);
            return;
          }
          const id = createProjectId(world.title);
          saveProject({ ...world, id });
          clear();
          router.push(`/projects/${id}/understood`);
        }}
      />
    </main>
  );
}
