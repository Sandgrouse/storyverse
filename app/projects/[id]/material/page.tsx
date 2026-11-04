"use client";

import { useRouter } from "next/navigation";
import BringScene from "@/components/experience/BringScene";
import { MissingStory, useProject } from "@/components/projects/ProjectContext";

export default function AddMaterialPage() {
  const router = useRouter();
  const { status, entry, world, appendFiles, setAppendFiles } = useProject();

  if (status === "loading" || !world) {
    if (status === "missing") return <MissingStory />;
    return <main />;
  }

  const isSample = entry?.sample ?? false;
  return (
    <main>
      <BringScene
        files={appendFiles}
        onFiles={setAppendFiles}
        seed={world}
        sample={false}
        hideSample
        onSample={() => {}}
        onRead={() => router.push(`/projects/${world.id}/reading`)}
        readLabel="Read what's new"
        extraDisabled={isSample || appendFiles.length === 0}
        note={
          isSample
            ? "This is the sample. Start a new story to read your own files."
            : appendFiles.length === 0
              ? "Your earlier files have already been read. Add anything new."
              : ""
        }
      />
    </main>
  );
}
