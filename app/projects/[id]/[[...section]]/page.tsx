"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { notFound } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import WorldScene, {
  type StoryView,
  type WorldDrawer,
} from "@/components/experience/WorldScene";
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

function viewKey(id: string): string {
  return `storyverse-story-view-${id}`;
}

/** Remembered Timeline/Book view for one project, or null when none. */
function rememberedView(id: string): StoryView | null {
  try {
    const raw = window.localStorage.getItem(viewKey(id));
    return raw === "book" || raw === "timeline" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * One client page for the Story, Characters, Scene notes and Package
 * paths, so World scene state such as a running ripple survives moving
 * between those sections. Opening or closing a drawer changes the URL.
 * The Story page also holds the Timeline/Book view: `?view=book` shows
 * the canon book, the default is the timeline, and the choice is
 * remembered per project.
 */
export default function WorldSectionPage() {
  const router = useRouter();
  const params = useParams<{ id: string; section?: string[] }>();

  useEffect(() => {
    if (!params.section || params.section.length === 0) {
      router.replace(`/projects/${params.id}/story`);
    }
  }, [params.section, router, params.id]);

  if (!params.section || params.section.length === 0) return <main />;

  if (!DRAWERS.includes(params.section?.[0] as (typeof DRAWERS)[number])) {
    notFound();
  }

  return (
    <main>
      <Suspense>
        <WorldSectionInner id={params.id} section={params.section} />
      </Suspense>
    </main>
  );
}

function WorldSectionInner({
  id,
  section,
}: {
  id: string;
  section: string[] | undefined;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, world, updateWorld } = useProject();
  const [memory, setMemory] = useState<StoryView | null>(null);

  useEffect(() => {
    setMemory(rememberedView(id));
  }, [id]);

  const param = searchParams.get("view");
  const view: StoryView =
    param === "book" ? "book" : param === "timeline" ? "timeline" : (memory ?? "timeline");

  // Adopt the remembered view into the URL once it loads, so a reload
  // keeps the same view even before the owner touches the switch.
  useEffect(() => {
    if (
      section?.[0] === "story" &&
      (param === null || (param !== "book" && param !== "timeline")) &&
      memory === "book"
    ) {
      router.replace(`/projects/${id}/story?view=book`);
    }
  }, [section, param, memory, router, id]);

  if (status === "loading" || !world) {
    if (status === "missing") return <MissingStory />;
    return <main />;
  }

  const { section: current, drawer } = drawerFor(section);

  const changeView = (next: StoryView) => {
    try {
      window.localStorage.setItem(viewKey(id), next);
    } catch {
      // Memory is best effort; the URL still carries the view.
    }
    setMemory(next);
    router.replace(
      next === "book"
        ? `/projects/${id}/story?view=book`
        : `/projects/${id}/story`,
    );
  };

  return (
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
        if (target !== current) {
          router.push(pathForSection(world.id, target));
        }
      }}
      view={current === "story" ? view : "timeline"}
      onViewChange={changeView}
    />
  );
}
