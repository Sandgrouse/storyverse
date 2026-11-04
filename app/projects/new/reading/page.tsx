"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  useEffect(() => {
    setMounted(true);
  }, []);
  const empty = !sample && files.length === 0 && idea.trim().length === 0;

  useEffect(() => {
    if (mounted && empty) router.replace("/projects/new/material");
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
