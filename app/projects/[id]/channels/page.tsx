"use client";

import { useRouter } from "next/navigation";
import ChannelsScene from "@/components/experience/ChannelsScene";
import { MissingStory, useProject } from "@/components/projects/ProjectContext";

export default function ChannelsPage() {
  const router = useRouter();
  const { status, world, updateWorld, confirmChannels } = useProject();

  if (status === "loading" || !world) {
    if (status === "missing") return <MissingStory />;
    return <main />;
  }

  return (
    <main>
      <ChannelsScene
        world={world}
        onWorld={updateWorld}
        onOpen={() => {
          confirmChannels();
          router.push(`/projects/${world.id}/story`);
        }}
      />
    </main>
  );
}
