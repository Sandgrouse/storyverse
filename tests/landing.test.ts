import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BROWSER_SUB,
  BROWSER_TITLE,
  CHANGE_LINE,
  CHAPTERS,
  LANDING_IMAGES,
  SCRIPT_LINES,
  SCRIPT_NOTE,
  SECRETS,
  TREE_LINES,
  TREE_SECRET,
  VIDEO_CAPTION,
  VIDEO_THUMBS,
} from "@/lib/landing";

const CONTENT_CHAPTERS = [
  "world",
  "characters",
  "story",
  "parts",
  "change",
  "onebase",
  "video",
  "game",
  "next",
];

describe("landing chapters", () => {
  it("holds the approved chapter order", () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual([
      "start",
      "world",
      "characters",
      "story",
      "parts",
      "change",
      "onebase",
      "video",
      "game",
      "next",
      "begin",
    ]);
  });

  it("gives every content chapter a kicker, heading and body", () => {
    for (const chapter of CHAPTERS) {
      if (!CONTENT_CHAPTERS.includes(chapter.id)) continue;
      // The website chapter shows its "Coming next" badge, not a kicker.
      if (!chapter.soon) {
        expect(chapter.kicker, `${chapter.id} kicker`).toBeTruthy();
      }
      expect(chapter.heading, `${chapter.id} heading`).toBeTruthy();
      expect(chapter.body, `${chapter.id} body`).toBeTruthy();
    }
  });

  it("keeps the website chapter's Coming next label", () => {
    const next = CHAPTERS.find((c) => c.id === "next");
    expect(next?.soon).toBe(true);
    expect(next?.heading).toBeTruthy();
    expect(next?.body).toBeTruthy();
  });

  it("leaves the hero and close chapters to their own headlines", () => {
    for (const id of ["start", "begin"]) {
      const chapter = CHAPTERS.find((c) => c.id === id);
      expect(chapter?.heading).toBeUndefined();
      expect(chapter?.body).toBeUndefined();
    }
  });

  it("keeps every feature panel's copy", () => {
    expect(SCRIPT_LINES.length).toBeGreaterThan(0);
    expect(SCRIPT_NOTE).toBeTruthy();
    expect(TREE_LINES.length).toBeGreaterThan(0);
    expect(TREE_SECRET).toBeTruthy();
    expect(SECRETS).toHaveLength(3);
    expect(CHANGE_LINE).toBeTruthy();
    expect(VIDEO_CAPTION).toBeTruthy();
    expect(VIDEO_THUMBS.length).toBeGreaterThan(0);
    expect(BROWSER_TITLE).toBeTruthy();
    expect(BROWSER_SUB).toBeTruthy();
  });
});

describe("landing images", () => {
  it("resolves every card and thumb path under public/", () => {
    expect(LANDING_IMAGES.length).toBeGreaterThan(0);
    for (const src of LANDING_IMAGES) {
      expect(src.startsWith("/"), src).toBe(true);
      const file = join(process.cwd(), "public", src.slice(1));
      expect(existsSync(file), src).toBe(true);
    }
  });
});
