"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { World } from "@/lib/world/schemas";
import {
  SAMPLE_ID,
  getEntry,
  loadProject,
  saveProject,
  type ProjectEntry,
} from "@/lib/projects";
import { WorldSchema } from "@/lib/world/schemas";
import seedJson from "@/data/seed/anukili.json";
import type { ClientFile } from "./DraftContext";

type Status = "loading" | "missing" | "ready";

type Project = {
  status: Status;
  entry: ProjectEntry | null;
  world: World | null;
  updateWorld: (world: World) => void;
  confirmChannels: () => void;
  appendFiles: ClientFile[];
  setAppendFiles: (files: ClientFile[]) => void;
};

const ProjectContext = createContext<Project | null>(null);

function seedWorld(): World {
  return WorldSchema.parse(seedJson);
}

/**
 * The opened project, loaded in an effect so the first paint never
 * skews hydration. Files added for a re-read live here too, so they
 * survive moving between the material and reading pages.
 */
export function ProjectProvider({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [entry, setEntry] = useState<ProjectEntry | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [appendFiles, setAppendFiles] = useState<ClientFile[]>([]);
  const channelsConfirmed = useRef(false);

  useEffect(() => {
    let live = true;
    // A sample that was never opened has no stored world yet: seed it.
    if (id === SAMPLE_ID && !getEntry(SAMPLE_ID)) {
      saveProject(seedWorld(), { sample: true, title: undefined });
    }
    void loadProject(id, seedWorld()).then((loaded) => {
      if (!live) return;
      if (!loaded) {
        setStatus("missing");
        return;
      }
      channelsConfirmed.current = loaded.entry.channelsConfirmed;
      setEntry(loaded.entry);
      setWorld(loaded.world);
      setStatus("ready");
    });
    return () => {
      live = false;
    };
  }, [id]);

  const updateWorld = useCallback(
    (next: World) => {
      setWorld(next);
      setEntry((prev) => {
        const confirmed = channelsConfirmed.current;
        saveProject(next, { channelsConfirmed: confirmed });
        return prev
          ? { ...prev, title: prev.sample ? prev.title : next.title }
          : prev;
      });
    },
    [],
  );

  const confirmChannels = useCallback(() => {
    channelsConfirmed.current = true;
    setWorld((current) => {
      if (current) saveProject(current, { channelsConfirmed: true });
      return current;
    });
    setEntry((prev) => (prev ? { ...prev, channelsConfirmed: true } : prev));
  }, []);

  const value = useMemo(
    () => ({
      status,
      entry,
      world,
      updateWorld,
      confirmChannels,
      appendFiles,
      setAppendFiles,
    }),
    [status, entry, world, updateWorld, confirmChannels, appendFiles],
  );
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): Project {
  const project = useContext(ProjectContext);
  if (!project) throw new Error("useProject must be used under ProjectProvider");
  return project;
}

/** Calm message for an unknown project id, with a link to Your projects. */
export function MissingStory() {
  return (
    <section className="scene on" id="missing">
      <div className="hello">
        <h1 className="big" style={{ fontSize: "clamp(30px, 3.6vw, 52px)" }}>
          We couldn&rsquo;t find that story
        </h1>
        <p className="lede" style={{ marginTop: 14 }}>
          It may have been deleted in this browser.
        </p>
        <div className="doors">
          <Link className="pill" href="/projects">
            Your projects
          </Link>
        </div>
      </div>
    </section>
  );
}
