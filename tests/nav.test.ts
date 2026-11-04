import { describe, expect, it } from "vitest";
import { backFor, pathForSection, sectionFor } from "@/lib/nav";

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
    expect(backFor("/projects/abc/material")).toBe("/projects/abc/understood");
    expect(backFor("/projects/abc/reading")).toBe("/projects/abc/material");
  });

  it("has no back outside the projects pages", () => {
    expect(backFor("/")).toBeNull();
  });
});

describe("world sections", () => {
  it("defaults to the story and round-trips paths", () => {
    expect(sectionFor(undefined)).toBe("story");
    expect(sectionFor(["characters"])).toBe("characters");
    expect(sectionFor(["story-pack"])).toBe("story-pack");
    expect(sectionFor(["package"])).toBe("package");
    expect(pathForSection("abc", "characters")).toBe("/projects/abc/characters");
  });
});
