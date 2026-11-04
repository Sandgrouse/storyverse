import { describe, expect, it } from "vitest";
import {
  backFor,
  pathForSection,
  sectionFor,
  shouldRedirectFromReading,
} from "@/lib/nav";

describe("backFor", () => {
  it("maps every page to its parent", () => {
    expect(backFor("/projects")).toBeNull();
    expect(backFor("/projects/new")).toBe("/projects");
    expect(backFor("/projects/new/idea")).toBe("/projects/new");
    expect(backFor("/projects/new/material")).toBe("/projects/new");
    expect(backFor("/projects/new/reading")).toBe("/projects/new/material");
    expect(backFor("/projects/abc")).toBe("/projects");
    expect(backFor("/projects/abc/understood")).toBe("/projects");
    expect(backFor("/projects/abc/channels")).toBe("/projects/abc/understood");
    expect(backFor("/projects/abc/story")).toBe("/projects/abc/channels");
    expect(backFor("/projects/abc/characters")).toBe("/projects/abc/channels");
    expect(backFor("/projects/abc/package")).toBe("/projects/abc/channels");
    expect(backFor("/projects/abc/story-pack")).toBe("/projects/abc/channels");
    expect(backFor("/projects/abc/script")).toBe("/projects/abc/story");
    expect(backFor("/projects/abc/storyboard")).toBe("/projects/abc/script");
    expect(backFor("/projects/abc/material")).toBe("/projects/abc/understood");
    expect(backFor("/projects/abc/reading")).toBe("/projects/abc/material");
    expect(backFor("/projects/abc/canon")).toBe(
      "/projects/abc/story?view=book",
    );
  });

  it("has no back outside the projects pages", () => {
    expect(backFor("/")).toBeNull();
  });
});

describe("shouldRedirectFromReading", () => {
  it("bounces to material only when ready and empty", () => {
    expect(
      shouldRedirectFromReading({ ready: true, empty: true, leaving: false }),
    ).toBe(true);
    expect(
      shouldRedirectFromReading({ ready: false, empty: true, leaving: false }),
    ).toBe(false);
    expect(
      shouldRedirectFromReading({ ready: true, empty: false, leaving: false }),
    ).toBe(false);
  });

  it("never fires after the user presses See what I found", () => {
    expect(
      shouldRedirectFromReading({ ready: true, empty: true, leaving: true }),
    ).toBe(false);
  });
});

describe("world sections", () => {
  it("defaults to the story and round-trips paths", () => {
    expect(sectionFor(undefined)).toBe("story");
    expect(sectionFor(["characters"])).toBe("characters");
    expect(sectionFor(["script"])).toBe("script");
    expect(sectionFor(["storyboard"])).toBe("storyboard");
    expect(sectionFor(["story-pack"])).toBe("story-pack");
    expect(sectionFor(["package"])).toBe("package");
    expect(pathForSection("abc", "characters")).toBe("/projects/abc/characters");
    expect(pathForSection("abc", "script")).toBe("/projects/abc/script");
    expect(pathForSection("abc", "storyboard")).toBe(
      "/projects/abc/storyboard",
    );
  });
});
