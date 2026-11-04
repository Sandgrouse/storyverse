"use client";

import { useRouter } from "next/navigation";
import UnderstoodScene from "@/components/experience/UnderstoodScene";
import { MissingStory, useProject } from "@/components/projects/ProjectContext";

export default function UnderstoodPage() {
  const router = useRouter();
  const { status, world, updateWorld } = useProject();

  if (status === "loading" || !world) {
    if (status === "missing") return <MissingStory />;
    return <main />;
  }

  return (
    <main>
      <UnderstoodScene
        world={world}
        onWorld={updateWorld}
        onAddMaterial={() => router.push(`/projects/${world.id}/material`)}
        onOpen={() => router.push(`/projects/${world.id}/channels`)}
      />
    </main>
  );
}
