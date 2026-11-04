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

  it("covers every card src, every thumb, and the browser art", () => {
    const covered = new Set(LANDING_IMAGES);
    for (const chapter of CHAPTERS) {
      for (const card of chapter.cards) {
        expect(covered.has(card.src), card.src).toBe(true);
      }
    }
    for (const thumb of VIDEO_THUMBS) {
      expect(covered.has(thumb.src), thumb.src).toBe(true);
    }
  });
});

/**
 * Seat geometry at the 1440x900 review viewport. Card CSS widths are
 * capped (art 300px, sheet 270px, player 620px, thumb 170px), so spans
 * below are in vw at 1440px wide.
 */
const VIEWPORT_W = 1440;

function cardWidthVw(
  kind: "art" | "sheet" | "player" | "thumb",
  s: number,
): number {
  const px =
    kind === "art"
      ? Math.min(0.22 * VIEWPORT_W, 300)
      : kind === "sheet"
        ? Math.min(0.19 * VIEWPORT_W, 270)
        : kind === "player"
          ? Math.min(0.4 * VIEWPORT_W, 620)
          : Math.min(0.11 * VIEWPORT_W, 170);
  return ((px * s) / VIEWPORT_W) * 100;
}

function spanVw(card: {
  kind: "art" | "sheet" | "player" | "thumb";
  x: number;
  s: number;
}): [number, number] {
  const centre = 50 + card.x;
  const half = cardWidthVw(card.kind, card.s) / 2;
  return [centre - half, centre + half];
}

describe("hero gallery", () => {
  it("curves four cards a side with rotateY and depth, inner pair at ±26.5vw", () => {
    const start = CHAPTERS.find((c) => c.id === "start");
    expect(start?.cards).toHaveLength(8);
    const left = start!.cards.filter((c) => c.x < 0);
    const right = start!.cards.filter((c) => c.x > 0);
    expect(left).toHaveLength(4);
    expect(right).toHaveLength(4);
    for (const card of start!.cards) {
      expect(typeof card.ry, card.src).toBe("number");
      expect(typeof card.z, card.src).toBe("number");
    }
    const innerLeft = left.reduce((a, b) => (Math.abs(a.x) < Math.abs(b.x) ? a : b));
    const innerRight = right.reduce((a, b) => (Math.abs(a.x) < Math.abs(b.x) ? a : b));
    expect(Math.abs(innerLeft.x)).toBeCloseTo(26.5, 5);
    expect(Math.abs(innerRight.x)).toBeCloseTo(26.5, 5);
    expect(innerLeft.ry).toBeGreaterThan(0);
    expect(innerRight.ry).toBeLessThan(0);
    // Facing angle and depth grow outward on each side.
    for (const side of [left, right]) {
      const ordered = [...side].sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
      for (let i = 1; i < ordered.length; i++) {
        expect(Math.abs(ordered[i]!.ry)).toBeGreaterThan(
          Math.abs(ordered[i - 1]!.ry),
        );
        expect(ordered[i]!.z).toBeGreaterThan(ordered[i - 1]!.z);
      }
    }
    // Outer cards are larger and closer, like the prototype wall.
    for (const side of [left, right]) {
      const ordered = [...side].sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
      for (let i = 1; i < ordered.length; i++) {
        expect(ordered[i]!.s).toBeGreaterThan(ordered[i - 1]!.s);
      }
    }
    // The headline column (roughly 36-64vw) stays clear.
    for (const card of start!.cards) {
      const [l, r] = spanVw(card);
      expect(l > 64 || r < 36, card.src).toBe(true);
    }
  });

  it("brings the same gallery back for the closing chapter, pushed out by 7vw", () => {
    const start = CHAPTERS.find((c) => c.id === "start");
    const begin = CHAPTERS.find((c) => c.id === "begin");
    expect(begin?.cards).toHaveLength(start?.cards.length ?? 0);
    expect((begin?.cards.length ?? 0)).toBeGreaterThan(0);
    for (let i = 0; i < start!.cards.length; i++) {
      const a = start!.cards[i]!;
      const b = begin!.cards[i]!;
      expect(b.src).toBe(a.src);
      expect(Math.abs(b.x) - Math.abs(a.x)).toBeCloseTo(7, 5);
      expect(b.ry).toBe(a.ry);
      expect(b.z).toBe(a.z);
    }
  });
});

describe("chapter layouts", () => {
  it("keeps every parts card clear of the copy column with its own secret", () => {
    const parts = CHAPTERS.find((c) => c.id === "parts");
    const centres = parts!.cards.map((c) => 50 + c.x).sort((a, b) => a - b);
    expect(centres.map(Math.round)).toEqual([47, 66, 85]);
    for (const card of parts!.cards) {
      // Fits within 17.5vw at the review viewport.
      expect(cardWidthVw(card.kind, card.s)).toBeLessThanOrEqual(17.5);
      const [l] = spanVw(card);
      expect(l, card.src).toBeGreaterThanOrEqual(34);
      expect(card.secret?.channel).toBeTruthy();
      expect(card.secret?.text).toBeTruthy();
      expect(card.secret?.tint).toBeTruthy();
    }
  });

  it("keeps the change rows and lines clear of the copy column", () => {
    const change = CHAPTERS.find((c) => c.id === "change");
    expect(change!.cards).toHaveLength(6);
    for (const card of change!.cards) {
      const [l] = spanVw(card);
      expect(l, card.src).toBeGreaterThanOrEqual(34);
    }
    expect(change!.cards.filter((c) => c.flag === "Breaks")).toHaveLength(3);
  });

  it("keeps the game cards between the file tree and the copy", () => {
    const game = CHAPTERS.find((c) => c.id === "game");
    // Hippo art plus the Anukili and Enyinyi sheets, overlapping it.
    expect(game!.cards).toHaveLength(3);
    const kinds = game!.cards.map((c) => c.kind).sort();
    expect(kinds).toEqual(["art", "sheet", "sheet"]);
    const srcs = game!.cards.map((c) => c.src);
    expect(srcs).toContain("/anukili/hippo.webp");
    expect(srcs).toContain("/anukili/sheets/anukili-ugama/front.webp");
    expect(srcs).toContain("/anukili/sheets/enyinyi/front.webp");
    for (const card of game!.cards) {
      const [l, r] = spanVw(card);
      expect(l, card.src).toBeGreaterThanOrEqual(32);
      expect(r, card.src).toBeLessThanOrEqual(62);
    }
  });

  it("clears gallery rotation to 0 outside the hero and closing chapters", () => {
    for (const chapter of CHAPTERS) {
      if (chapter.id === "start" || chapter.id === "begin") continue;
      for (const card of chapter.cards) {
        expect(card.ry, `${chapter.id} ${card.src}`).toBe(0);
        expect(card.z, `${chapter.id} ${card.src}`).toBe(0);
      }
    }
  });

  it("shows every characters card on stage with its image path", () => {
    const characters = CHAPTERS.find((c) => c.id === "characters");
    expect(characters!.cards.length).toBeGreaterThan(0);
    for (const card of characters!.cards) {
      const [l, r] = spanVw(card);
      expect(l, card.src).toBeGreaterThanOrEqual(0);
      expect(r, card.src).toBeLessThanOrEqual(62);
      const file = join(process.cwd(), "public", card.src.slice(1));
      expect(existsSync(file), card.src).toBe(true);
    }
  });

  it("cross-fades one story art card into the player with four thumbs", () => {
    const video = CHAPTERS.find((c) => c.id === "video");
    expect(VIDEO_THUMBS).toHaveLength(4);
    const thumbs = video!.cards.filter((c) => c.kind === "thumb");
    expect(thumbs).toHaveLength(4);
    const out = video!.cards.find((c) => c.fade === "out");
    const inn = video!.cards.find((c) => c.fade === "in");
    expect(out?.kind).toBe("art");
    expect(inn?.kind).toBe("player");
    // Same seat, so one dissolves into the other.
    expect(out?.x).toBe(inn?.x);
    expect(out?.y).toBe(inn?.y);
    // Thumbnails span the player's width.
    const [pl, pr] = spanVw(inn!);
    const edges = thumbs.flatMap((t) => spanVw(t));
    expect(Math.min(...edges)).toBeGreaterThanOrEqual(pl - 1.5);
    expect(Math.max(...edges)).toBeLessThanOrEqual(pr + 1.5);
  });
});
