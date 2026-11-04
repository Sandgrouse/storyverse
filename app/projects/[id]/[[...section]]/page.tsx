"use client";

import { useParams, useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import { useEffect } from "react";
import WorldScene, { type WorldDrawer } from "@/components/experience/WorldScene";
import { MissingStory, useProject } from "@/components/projects/ProjectContext";
import { pathForSection } from "@/lib/nav";

const DRAWERS = ["story", "characters", "story-pack", "package"] as const;

function drawerFor(section: string[] | undefined): {
  section: (typeof DRAWERS)[number];
  drawer: WorldDrawer;
} {
  const name = section?.[0] ?? "story";
  if (name === "story") return { section: "story", drawer: null };
  if (name === "characters") return { section: "characters", drawer: "cast" };
  if (name === "story-pack") return { section: "story-pack", drawer: "story" };
  if (name === "package") return { section: "package", drawer: "pack" };
  return { section: "story", drawer: null };
}

/**
 * One client page for the Story, Characters, Story Pack and Package
 * paths, so World scene state such as a running ripple survives moving
 * between those sections. Opening or closing a drawer changes the URL.
 */
export default function WorldSectionPage() {
  const router = useRouter();
  const params = useParams<{ id: string; section?: string[] }>();
  const { status, world, updateWorld } = useProject();
  const hasSection = !!params.section && params.section.length > 0;

  useEffect(() => {
    if (!hasSection) router.replace(`/projects/${params.id}/story`);
  }, [hasSection, router, params.id]);

  if (!hasSection) return <main />;

  if (!DRAWERS.includes(params.section?.[0] as (typeof DRAWERS)[number])) {
    notFound();
  }

  if (status === "loading" || !world) {
    if (status === "missing") return <MissingStory />;
    return <main />;
  }

  const { section, drawer } = drawerFor(params.section);

  return (
    <main>
      <WorldScene
        key={world.id}
        world={world}
        onWorld={updateWorld}
        drawer={drawer}
        onDrawer={(next) => {
          const target =
            next === null
              ? "story"
              : next === "cast"
                ? "characters"
                : next === "pack"
                  ? "package"
                  : "story-pack";
          if (target !== section) {
            router.push(pathForSection(world.id, target));
          }
        }}
      />
    </main>
  );
}
