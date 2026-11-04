"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { shouldRedirectFromReading } from "@/lib/nav";
import type { World } from "@/lib/world/schemas";
import ReadingScene from "@/components/experience/ReadingScene";
import { MissingStory, useProject } from "@/components/projects/ProjectContext";
import {
  MERGE_INSTRUCTION,
  canonTextFor,
  mergeWorldAssets,
} from "@/lib/projects";

export default function AddReadingPage() {
  const router = useRouter();
  const { status, world, updateWorld, appendFiles, setAppendFiles } =
    useProject();
  const empty = appendFiles.length === 0;
  // Same race as the new-project reading page: set the moment
  // "See what I found" runs so emptying the list cannot bounce back.
  const leavingRef = useRef(false);

  useEffect(() => {
    if (
      shouldRedirectFromReading({
        ready: status === "ready",
        empty,
        leaving: leavingRef.current,
      })
    ) {
      router.replace(`/projects/${world?.id}/material`);
    }
  }, [status, empty, router, world?.id]);

  if (status === "loading" || !world) {
    if (status === "missing") return <MissingStory />;
    return <main />;
  }
  if (empty) return <main />;

  return (
    <main>
      <ReadingScene
        files={appendFiles}
        seed={world}
        sample={false}
        instruction={MERGE_INSTRUCTION}
        extraTextFiles={[{ name: "current-story.txt", text: canonTextFor(world) }]}
        backHref={`/projects/${world.id}/material`}
        onLabels={setAppendFiles}
        onDone={(result: World) => {
          leavingRef.current = true;
          const merged = mergeWorldAssets(world, { ...result, id: world.id });
          setAppendFiles([]);
          updateWorld(merged);
          router.push(`/projects/${world.id}/understood`);
        }}
      />
    </main>
  );
}
