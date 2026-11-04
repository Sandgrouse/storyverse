/** Parent page for the shared top bar Back button. Null when none. */
export function backFor(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "projects") return null;
  const rest = segments.slice(1);
  if (rest.length === 0) return null;
  if (rest[0] === "new") {
    if (rest.length === 1) return "/projects";
    if (rest[1] === "idea" || rest[1] === "material") return "/projects/new";
    if (rest[1] === "reading") return "/projects/new/material";
    return "/projects/new";
  }
  const id = rest[0];
  if (rest.length === 1) return "/projects";
  const page = rest[1];
  if (page === "understood") return "/projects";
  if (page === "channels") return `/projects/${id}/understood`;
  if (
    page === "story" ||
    page === "characters" ||
    page === "package" ||
    page === "story-pack"
  ) {
    return `/projects/${id}/channels`;
  }
  if (page === "canon") return `/projects/${id}/story`;
  if (page === "script") return `/projects/${id}/story`;
  if (page === "storyboard") return `/projects/${id}/script`;
  if (page === "video") return `/projects/${id}/script`;
  if (page === "material") return `/projects/${id}/understood`;
  if (page === "reading") return `/projects/${id}/material`;
  return `/projects/${id}/story`;
}

/**
 * Reading pages bounce back to material when no files remain. The bounce
 * must not fire once the user has pressed "See what I found": clearing the
 * draft empties the page before navigation finishes, and without the
 * `leaving` guard the bounce wins and lands on material, not the project.
 */
export function shouldRedirectFromReading(options: {
  ready: boolean;
  empty: boolean;
  leaving: boolean;
}): boolean {
  return options.ready && options.empty && !options.leaving;
}

export type WorldSection =
  | "story"
  | "characters"
  | "script"
  | "storyboard"
  | "video"
  | "story-pack"
  | "package";

/** Drawer section from a catch-all param, defaulting to the story. */
export function sectionFor(section: string[] | undefined): WorldSection {
  if (!section || section.length === 0 || section[0] === "story") return "story";
  if (section[0] === "characters") return "characters";
  if (section[0] === "script") return "script";
  if (section[0] === "storyboard") return "storyboard";
  if (section[0] === "story-pack") return "story-pack";
  if (section[0] === "package") return "package";
  return "story";
}

export function pathForSection(id: string, section: WorldSection): string {
  return `/projects/${id}/${section}`;
}
