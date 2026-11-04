"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { backFor, pathForSection, sectionFor } from "@/lib/nav";
import { getEntry } from "@/lib/projects";

const SECTIONS = [
  { id: "story", label: "Story" },
  { id: "characters", label: "Characters" },
  { id: "script", label: "Script" },
  { id: "video", label: "Video" },
  { id: "package", label: "Agent package" },
] as const;

/** One shared bar for every /projects page, in the existing style. */
export default function TopBar() {
  const pathname = usePathname();
  const params = useParams<{ id?: string; section?: string[] }>();
  const back = backFor(pathname);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!params.id) {
      setTitle("");
      return;
    }
    setTitle(getEntry(params.id)?.title ?? "");
  }, [params.id, pathname]);

  const tail = pathname.split("/").filter(Boolean).pop();
  const section = params.section
    ? sectionFor(params.section)
    : tail === "script"
      ? "script"
      : tail === "video"
        ? "video"
        : null;
  const showSections =
    section === "story" ||
    section === "characters" ||
    section === "script" ||
    section === "video" ||
    section === "package";

  return (
    <header className="topbar">
      <nav className="topbar-left" aria-label="Storyverse">
        {back ? (
          <Link className="quiet" href={back}>
            Back
          </Link>
        ) : null}
        <Link className="topbar-logo" href="/">
          Storyverse
        </Link>
        <Link className="quiet" href="/projects">
          Your projects
        </Link>
        {title ? <span className="topbar-title">{title}</span> : null}
      </nav>
      {showSections && params.id ? (
        <nav className="topbar-right" aria-label="Sections">
          {SECTIONS.map((entry) => (
            <Link
              key={entry.id}
              href={pathForSection(params.id as string, entry.id)}
              className={section === entry.id ? "on" : ""}
            >
              {entry.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
