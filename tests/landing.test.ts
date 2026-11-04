import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BROWSER_SUB,
  BROWSER_TITLE,
  CARDS,
  CHAPTERS,
  CHANGE_LINE,
  clampSeatBelowBar,
  LANDING_IMAGES,
  LAYOUTS,
  layoutRects,
  resolveSeat,
  SCRIPT_LINES,
  SCRIPT_NOTE,
  SECRETS,
  segmentEase,
  stagger,
  TOP_BAR_H,
  TREE_LINES,
  TREE_SECRET,
  VIDEO_CAPTION,
} from "@/lib/landing";

const CONTENT_IDS = [
  "world",
  "characters",
  "story",
  "storyboard",
  "publish",
  "video",
  "game",
  "website",
  "change",
  "onebase",
];

describe("landing chapters", () => {
  it("holds the approved chapter order", () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual([
      "start",
      "world",
      "characters",
      "story",
      "storyboard",
      "publish",
      "video",
      "game",
      "website",
      "change",
      "onebase",
      "begin",
    ]);
  });

  it("gives every content chapter its final copy word for word", () => {
    expect(
      Object.fromEntries(
        CHAPTERS.filter((c) => CONTENT_IDS.includes(c.id)).map((c) => [
          c.id,
          [c.kicker ?? null, c.heading, c.body],
        ]),
      ),
    ).toEqual({
      world: [
        "Your world",
        "Everything starts with your world",
        "Your world, characters, plot and goal live in one master story. Everything else draws from it.",
      ],
      characters: [
        "Characters",
        "Assemble your cast once",
        "Create full character sheets and game-ready cutouts, and keep each character the same everywhere.",
      ],
      story: [
        "Story",
        "Write the story inside it",
        "Your script knows your characters and your canon, so it stays true to both.",
      ],
      storyboard: [
        "Storyboard",
        "See it before you make it",
        "Turn any scene of your script into a storyboard, shot by shot, with sketches you can change.",
      ],
      publish: [
        "Publish",
        "Publish it wherever it belongs",
        "A series, a game, shorts or a full-length film. Each can hold a secret the others don't, so fans follow them all.",
      ],
      video: [
        "Video",
        "Turn scenes into shorts",
        "Muse turns your scenes into short videos you can edit and publish.",
      ],
      game: [
        "Game",
        "Hand your game to an agent",
        "Give a coding agent the package for your game, holding only what the game may know.",
      ],
      website: [
        null,
        "Your story's website",
        "Publish a home for your story from the same base.",
      ],
      change: [
        "Change",
        "Change it once. See what follows.",
        "Change one fact and find every scene it breaks. Approve each fix, and the story updates.",
      ],
      onebase: [
        "One base",
        "One base for every agent",
        "Every agent, image and video draws from the same characters and canon, so nothing drifts.",
      ],
    });
  });

  it("keeps Coming next on the website chapter only", () => {
    const soon = CHAPTERS.filter((c) => c.soon).map((c) => c.id);
    expect(soon).toEqual(["website"]);
    expect(CHAPTERS.find((c) => c.id === "storyboard")?.soon).toBeFalsy();
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
    expect(SCRIPT_NOTE).toBe(
      "Highlighted names come from your story's characters.",
    );
    expect(
      SCRIPT_LINES.some(
        (l) => l.type === "say" && l.text === "Are you sure it's a hippopotamus?",
      ),
    ).toBe(true);
    expect(TREE_LINES.length).toBeGreaterThan(0);
    expect(TREE_SECRET).toBeTruthy();
    expect(SECRETS).toEqual([
      {
        channel: "Only the series knows",
        text: "Why the baby lived",
        tint: "#a9771f",
      },
      {
        channel: "Only the game knows",
        text: "What the stream hides",
        tint: "#2c7f93",
      },
      {
        channel: "Only the shorts know",
        text: "Who first spoke the vow",
        tint: "#a8476a",
      },
    ]);
    expect(CHANGE_LINE).toBe("Enyinyi told them how to kill him.");
    expect(VIDEO_CAPTION).toBe(
      "One night they run across the Omabala to escape him.",
    );
    expect(BROWSER_TITLE).toBe("Anukili Ugama");
    expect(BROWSER_SUB).toBe(
      "The series, the game and the shorts, all in one place.",
    );
  });
});

describe("landing images", () => {
  it("resolves every card and chapter path under public/", () => {
    expect(LANDING_IMAGES.length).toBeGreaterThan(0);
    for (const src of LANDING_IMAGES) {
      expect(src.startsWith("/"), src).toBe(true);
      const file = join(process.cwd(), "public", src.slice(1));
      expect(existsSync(file), src).toBe(true);
    }
  });

  it("covers every card src and every chapter img", () => {
    const covered = new Set(LANDING_IMAGES);
    for (const card of CARDS) {
      expect(covered.has(card.src), card.src).toBe(true);
    }
    for (const chapter of CHAPTERS) {
      if (chapter.img) {
        expect(covered.has(`/anukili/${chapter.img}.webp`), chapter.id).toBe(
          true,
        );
      }
    }
  });
});

describe("persistent cards", () => {
  it("has 13 stable cards: 8 art, then 5 sheets", () => {
    expect(CARDS.map((c) => c.id)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(CARDS.slice(0, 8).every((c) => !c.src.includes("/sheets/"))).toBe(
      true,
    );
    expect(CARDS.slice(8).every((c) => c.src.includes("/sheets/"))).toBe(true);
  });

  it("references only real card ids in every chapter layout", () => {
    const ids = new Set(CARDS.map((c) => c.id));
    expect(LAYOUTS).toHaveLength(CHAPTERS.length);
    for (let ch = 0; ch < LAYOUTS.length; ch++) {
      for (const key of Object.keys(LAYOUTS[ch])) {
        expect(ids.has(Number(key)), `chapter ${ch} card ${key}`).toBe(true);
      }
    }
  });

  it("travels shared cards between consecutive chapters instead of swapping", () => {
    // Every layout is keyed by stable card id, so the same element moves.
    // Check the sharing directly: neighbours must overlap, except that the
    // website chapter carries no cards and its neighbours fade in/out.
    for (let ch = 0; ch < LAYOUTS.length - 1; ch++) {
      const a = new Set(Object.keys(LAYOUTS[ch]).map(Number));
      const b = new Set(Object.keys(LAYOUTS[ch + 1]).map(Number));
      if (ch === 7 || ch === 8) {
        expect(b.size === 0 || a.size === 0).toBe(true);
        continue;
      }
      const shared = [...a].filter((id) => b.has(id));
      expect(shared.length, `chapters ${ch} -> ${ch + 1}`).toBeGreaterThan(0);
    }
    // Card 2 (the stream) is the through-line across most chapters.
    const appearances = LAYOUTS.filter((l) => l[2]).length;
    expect(appearances).toBeGreaterThanOrEqual(6);
  });

  it("carries every tag label the prototype shows", () => {
    const shots = new Set<string>();
    const hits = new Set<string>();
    const publishTags: string[] = [];
    for (const layout of LAYOUTS) {
      for (const seat of Object.values(layout)) {
        if (seat.shot) shots.add(seat.shot);
        if (seat.hit) hits.add(seat.hit);
      }
    }
    for (const seat of Object.values(LAYOUTS[5])) {
      if (seat.shot) publishTags.push(seat.shot);
    }
    expect([...shots].sort()).toEqual([
      "Film",
      "Game",
      "Series",
      "Shot 1",
      "Shot 2",
      "Shot 3",
      "Shot 4",
      "Shot 5",
      "Shot 6",
      "Shorts",
    ]);
    expect([...hits]).toEqual(["Breaks"]);
    expect(publishTags.sort()).toEqual(["Film", "Game", "Series", "Shorts"]);
    expect(
      Object.values(LAYOUTS[9]).filter((s) => s.hit === "Breaks"),
    ).toHaveLength(3);
  });
});

describe("prototype scroll math", () => {
  it("eases each segment with holds at both ends", () => {
    expect(segmentEase(0)).toBe(0);
    expect(segmentEase(1)).toBe(1);
    expect(segmentEase(0.2)).toBe(0);
    expect(segmentEase(0.95)).toBe(1);
    const mid = segmentEase(0.61);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("staggers cards so the gallery deals in one by one", () => {
    for (let n = 0; n < 13; n++) {
      expect(stagger(0, n)).toBe(0);
      expect(stagger(1, n)).toBe(1);
    }
    // Later cards start later: at e=0.1 only the first cards have moved.
    expect(stagger(0.1, 0)).toBeGreaterThan(0);
    expect(stagger(0.1, 7)).toBe(0);
  });

  it("resolves vw widths with the viewport aspect", () => {
    const wide = resolveSeat(6, 6, 16 / 9);
    expect(wide.w).toBeCloseTo(52 * (16 / 9), 5);
    expect(wide.h).toBe(58);
  });
});

describe("hero top bar", () => {
  it("never overlaps the top bar from 1100px wide up", () => {
    for (const W of [1100, 1280, 1440, 1920, 2560]) {
      for (const H of [500, 600, 700, 800, 900, 1080]) {
        for (const ch of [0, CHAPTERS.length - 1]) {
          for (const rect of layoutRects(ch, W, H)) {
            const left = rect.cx - rect.wpx / 2;
            const right = rect.cx + rect.wpx / 2;
            const top = rect.cy - rect.hpx / 2;
            const overlaps =
              left < W && right > 0 && top < TOP_BAR_H && rect.hpx > 0;
            expect(overlaps, `${W}x${H} ch${ch} card${rect.id}`).toBe(false);
          }
        }
      }
    }
  });

  it("clamps a ring seat that would reach into the bar", () => {
    const low = { x: 50, y: 10, w: 30, h: 40, ry: 0, rz: 0, tz: 0, o: 1 };
    const clamped = clampSeatBelowBar(low, 800);
    expect(clamped.y - clamped.h / 2).toBeGreaterThanOrEqual(
      ((TOP_BAR_H + 20) / 800) * 100,
    );
    // Seats already clear pass through untouched.
    const clear = { x: 50, y: 50, w: 30, h: 40, ry: 0, rz: 0, tz: 0, o: 1 };
    expect(clampSeatBelowBar(clear, 800)).toEqual(clear);
  });
});
