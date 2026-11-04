/**
 * Landing page chapters, copy and card layouts.
 *
 * Ported directly from the approved prototype `docs/design/landing.html`
 * (`<script>`: CH, ART, SHEETS, hidden, ring, seat, L, get, frame). Its copy
 * is final (owner-approved) and is used here word for word.
 *
 * The scroll engine keeps ONE persistent element per card (see
 * components/landing/LandingPage.tsx). Each card travels from its seat in
 * one chapter's layout to its seat in the next, morphing shape on the way.
 * Layouts are keyed by stable card id, never by position, so a layout can
 * never swap a card for a different element: only the seat changes.
 *
 * Units: seat x is % of stage width, y is % of stage height, w/h are vh
 * (or vw via wv, converted with the viewport aspect). The engine renders
 * each card at the largest size it ever needs and reaches every other seat
 * with transform scale only, so no width/height/top/left change per frame.
 */

export type LandingSide = "l" | "r";

export type CardDef = {
  /** Stable id. 0-7 are story art, 8-12 are character sheets. */
  id: number;
  /** Public path, e.g. "/anukili/roots.webp". */
  src: string;
  alt: string;
};

const ART = (name: string) => `/anukili/${name}.webp`;
const SHEET = (name: string) => `/anukili/sheets/${name}.webp`;

export const HERO_HEADING = ["One story.", "Every screen."];
export const HERO_LEDE =
  "Build your story once. Publish it as a series, a game, shorts and more.";

export const CLOSE_HEADING = ["Your story is bigger", "than one screen."];

/** The 13 persistent cards: 8 art, then 5 sheets (SH(i) = 8 + i). */
export const CARDS: CardDef[] = [
  { id: 0, src: ART("roots"), alt: "Oral history" },
  { id: 1, src: ART("anukili"), alt: "Anukili" },
  { id: 2, src: ART("hippo"), alt: "The stream" },
  { id: 3, src: ART("pots"), alt: "Clay pots" },
  { id: 4, src: ART("fire"), alt: "Firelight" },
  { id: 5, src: ART("enyinyi"), alt: "Enyinyi" },
  { id: 6, src: ART("omabala"), alt: "The Omabala river" },
  { id: 7, src: ART("storm"), alt: "The storm" },
  { id: 8, src: SHEET("anukili-ugama/left"), alt: "Anukili, left view" },
  { id: 9, src: SHEET("anukili-ugama/front"), alt: "Anukili, front view" },
  { id: 10, src: SHEET("anukili-ugama/walking"), alt: "Anukili, walking pose" },
  { id: 11, src: SHEET("anukili-ugama/back"), alt: "Anukili, back view" },
  { id: 12, src: SHEET("enyinyi/front"), alt: "Enyinyi, front view" },
];

/**
 * One seat in a chapter layout. x/y are stage percent (of width/height),
 * w/h are vh. wv is an alternate width in vw (the prototype's video and
 * change chapters size thumbs in vw); resolveSeat converts it with aspect.
 * ry is the curved-gallery facing angle, rz the in-plane rotation, tz the
 * translateZ depth, o the opacity. shot/hit are the tag labels ("Shot 1",
 * "Series", "Breaks") shown while their chapter rests.
 */
export type Seat = {
  x: number;
  y: number;
  w?: number;
  h?: number;
  wv?: number;
  ry?: number;
  rz?: number;
  tz?: number;
  o: number;
  shot?: string;
  hit?: string;
};

/** Anything unlisted hides in the pile, as in the prototype. */
export const HIDDEN_SEAT: Seat = { x: 30, y: 52, w: 22, h: 32, o: 0 };

/** Prototype ring seat: four cards a side, curving away from the centre. */
export function ringSeat(side: -1 | 1, k: number, out0 = 0): Seat {
  const h = 30 + k * 6 + k * k;
  return {
    x: 50 + side * (27 + out0 + k * 7 + k * k * 1.2),
    y: 50,
    w: h * (0.62 + k * 0.05),
    h,
    ry: -side * (26 + k * 13),
    rz: 0,
    tz: k * 20,
    o: 1,
  };
}

/** Prototype ring(): the hero gallery, optionally pushed outward. */
export function ringLayout(out0 = 0): Record<number, Seat> {
  const out: Record<number, Seat> = {};
  const left: Array<[number, number]> = [
    [0, 0],
    [7, 1],
    [2, 2],
    [5, 3],
  ];
  const right: Array<[number, number]> = [
    [3, 0],
    [1, 1],
    [4, 2],
    [6, 3],
  ];
  for (const [id, k] of left) out[id] = ringSeat(-1, k, out0);
  for (const [id, k] of right) out[id] = ringSeat(1, k, out0);
  return out;
}

/**
 * Prototype L: one layout per chapter, keyed by stable card id. Cards 8-12
 * are the sheets (SH(i) = 8 + i).
 */
export const LAYOUTS: Array<Record<number, Seat>> = [
  ringLayout(), // 0 Start
  {
    // 1 Your world
    0: { x: 24, y: 52, w: 46, h: 31, rz: -9, o: 1 },
    2: { x: 27, y: 48, w: 46, h: 31, rz: 6, o: 1 },
    3: { x: 30, y: 55, w: 46, h: 31, rz: -3, o: 1 },
    4: { x: 32, y: 47, w: 46, h: 31, rz: 10, o: 1 },
    6: { x: 25, y: 58, w: 46, h: 31, rz: 4, o: 1 },
    7: { x: 33, y: 57, w: 46, h: 31, rz: -7, o: 1 },
    5: { x: 39, y: 50, w: 32, h: 48, rz: 7, o: 1 },
    1: { x: 29, y: 51, w: 38, h: 57, rz: -2, o: 1 },
  },
  {
    // 2 Characters
    8: { x: 9, y: 53, w: 26, h: 39, rz: -7, o: 1 },
    9: { x: 27, y: 50, w: 40, h: 60, rz: -1, o: 1 },
    10: { x: 41, y: 53, w: 26, h: 39, rz: 5, o: 1 },
    11: { x: 13, y: 82, w: 15, h: 22, rz: -3, o: 0 },
    12: { x: 52, y: 56, w: 24, h: 36, rz: 9, o: 1 },
  },
  { 2: { x: 50, y: 27, w: 30, h: 20, rz: 5, o: 1 } }, // 3 Story
  {
    // 4 Storyboard: six 16:9 frames, read left to right, top to bottom
    0: { x: 63, y: 22, w: 30, h: 17, rz: -1.5, o: 1, shot: "Shot 1" },
    2: { x: 87, y: 22, w: 30, h: 17, rz: 1.5, o: 1, shot: "Shot 2" },
    7: { x: 63, y: 50, w: 30, h: 17, rz: 1, o: 1, shot: "Shot 3" },
    3: { x: 87, y: 50, w: 30, h: 17, rz: -1, o: 1, shot: "Shot 4" },
    4: { x: 63, y: 78, w: 30, h: 17, rz: -1, o: 1, shot: "Shot 5" },
    6: { x: 87, y: 78, w: 30, h: 17, rz: 1.5, o: 1, shot: "Shot 6" },
  },
  {
    // 5 Publish: four different shapes, one per form
    2: { x: 64, y: 31, w: 40, h: 22.5, rz: -2, o: 1, shot: "Series" },
    3: { x: 88, y: 33, w: 18, h: 32, rz: 3, o: 1, shot: "Shorts" },
    4: { x: 61, y: 70, w: 26, h: 26, rz: 2, o: 1, shot: "Game" },
    6: { x: 85, y: 72, w: 44, h: 18.4, rz: -2, o: 1, shot: "Film" },
  },
  {
    // 6 Video
    6: { x: 31, y: 42, wv: 52, h: 58, o: 1 },
    3: { x: 11.5, y: 83, wv: 12.5, h: 15, o: 1 },
    7: { x: 24.5, y: 83, wv: 12.5, h: 15, o: 1 },
    2: { x: 37.5, y: 83, wv: 12.5, h: 15, o: 1 },
    4: { x: 50.5, y: 83, wv: 12.5, h: 15, o: 1 },
  },
  {
    // 7 Game
    9: { x: 44, y: 50, w: 26, h: 39, rz: -5, o: 1 },
    12: { x: 50, y: 60, w: 26, h: 39, rz: 6, o: 1 },
    2: { x: 44, y: 24, w: 30, h: 20, rz: 3, o: 1 },
  },
  {}, // 8 Website: no cards; the browser panel carries it
  {
    // 9 Change
    0: { x: 50, y: 34, wv: 16.5, h: 27, o: 1 },
    2: { x: 68, y: 34, wv: 16.5, h: 27, o: 1 },
    7: { x: 86, y: 34, wv: 16.5, h: 27, o: 1 },
    3: { x: 50, y: 66, wv: 16.5, h: 27, o: 1, hit: "Breaks" },
    4: { x: 68, y: 66, wv: 16.5, h: 27, o: 1, hit: "Breaks" },
    6: { x: 86, y: 66, wv: 16.5, h: 27, o: 1, hit: "Breaks" },
  },
  {
    // 10 One base
    1: { x: 30, y: 50, w: 34, h: 46, o: 1 },
    2: { x: 11, y: 24, w: 17, h: 23, rz: -6, o: 1 },
    3: { x: 49, y: 24, w: 17, h: 23, rz: 6, o: 1 },
    4: { x: 11, y: 76, w: 17, h: 23, rz: 5, o: 1 },
    6: { x: 49, y: 76, w: 17, h: 23, rz: -5, o: 1 },
  },
  ringLayout(7), // 11 Begin: the gallery back, pushed out by 7
];

export type ChapterFeature =
  | "none"
  | "script"
  | "video"
  | "line"
  | "tree"
  | "browser";

export type Chapter = {
  id: string;
  label: string;
  side: LandingSide | null;
  tint: string;
  kicker?: string;
  heading?: string;
  body?: string;
  /** Shows the "Coming next" badge instead of a kicker. */
  soon?: boolean;
  /** Lower the copy block so it clears a top visual. */
  low?: boolean;
  feature: ChapterFeature;
  /** Art file for the stacked fallback, e.g. "roots". */
  img?: string;
};

/** Prototype CH: chapter order, copy, tints and sides. */
export const CHAPTERS: Chapter[] = [
  { id: "start", label: "Start", side: null, tint: "#efe8db", feature: "none" },
  {
    id: "world",
    label: "Your world",
    side: "r",
    tint: "#e9e0ce",
    kicker: "Your world",
    heading: "Everything starts with your world",
    body: "Your world, characters, plot and goal live in one master story. Everything else draws from it.",
    feature: "none",
    img: "roots",
  },
  {
    id: "characters",
    label: "Characters",
    side: "r",
    tint: "#e5dccf",
    kicker: "Characters",
    heading: "Assemble your cast once",
    body: "Create full character sheets and game-ready cutouts, and keep each character the same everywhere.",
    feature: "none",
    img: "anukili",
  },
  {
    id: "story",
    label: "Story",
    side: "r",
    tint: "#dbe4e0",
    kicker: "Story",
    heading: "Write the story inside it",
    body: "Your script knows your characters and your canon, so it stays true to both.",
    feature: "script",
    img: "hippo",
  },
  {
    id: "storyboard",
    label: "Storyboard",
    side: "l",
    tint: "#e4ded1",
    kicker: "Storyboard",
    heading: "See it before you make it",
    body: "Turn any scene of your script into a storyboard, shot by shot, with sketches you can change.",
    feature: "none",
    img: "fire",
  },
  {
    id: "publish",
    label: "Publish",
    side: "l",
    tint: "#ecd9c9",
    kicker: "Publish",
    heading: "Publish it wherever it belongs",
    body: "A series, a game, shorts or a full-length film. Each can hold a secret the others don't, so fans follow them all.",
    feature: "none",
    img: "storm",
  },
  {
    id: "video",
    label: "Video",
    side: "r",
    tint: "#d9dfe4",
    kicker: "Video",
    heading: "Turn scenes into shorts",
    body: "Muse turns your scenes into short videos you can edit and publish.",
    feature: "video",
    img: "omabala",
  },
  {
    id: "game",
    label: "Game",
    side: "r",
    tint: "#d5e3e4",
    kicker: "Game",
    heading: "Hand your game to an agent",
    body: "Give a coding agent the package for your game, holding only what the game may know.",
    feature: "tree",
    img: "hippo",
  },
  {
    id: "website",
    label: "Website",
    side: "r",
    tint: "#eadfd0",
    heading: "Your story's website",
    body: "Publish a home for your story from the same base.",
    soon: true,
    feature: "browser",
    img: "storm",
  },
  {
    id: "change",
    label: "Change",
    side: "l",
    tint: "#e8d6c6",
    kicker: "Change",
    heading: "Change it once. See what follows.",
    body: "Change one fact and find every scene it breaks. Approve each fix, and the story updates.",
    low: true,
    feature: "line",
    img: "pots",
  },
  {
    id: "onebase",
    label: "One base",
    side: "r",
    tint: "#e2e0d2",
    kicker: "One base",
    heading: "One base for every agent",
    body: "Every agent, image and video draws from the same characters and canon, so nothing drifts.",
    feature: "none",
    img: "enyinyi",
  },
  { id: "begin", label: "Begin", side: null, tint: "#efe8db", feature: "none" },
];

export const SCRIPT_LINES: Array<
  | { type: "head"; text: string }
  | { type: "text"; text: string; marks?: string[] }
  | { type: "who"; text: string }
  | { type: "say"; text: string }
> = [
  { type: "head", text: "THE STREAM · Episode 3" },
  { type: "head", text: "EXT. THE STREAM, AGULERI. DAY" },
  {
    type: "text",
    text: "Nobody goes down to the water now. A hippopotamus has been attacking people at the stream. They come to Anukili.",
    marks: ["hippopotamus", "Anukili"],
  },
  { type: "who", text: "ANUKILI" },
  { type: "say", text: "Are you sure it's a hippopotamus?" },
  { type: "who", text: "A WOMAN" },
  { type: "say", text: "We have seen it." },
  { type: "who", text: "ANUKILI" },
  { type: "say", text: "That tiny thing. Show me where it waits." },
];

export const SCRIPT_NOTE =
  "Highlighted names come from your story's characters.";

export const TREE_LINES: Array<{ text: string; indent?: boolean }> = [
  { text: "the-hunt-at-the-stream/" },
  { text: "AGENT_BRIEF.md", indent: true },
  { text: "canon.json", indent: true },
  { text: "characters/", indent: true },
  { text: "scenes/", indent: true },
  { text: "secrets.json", indent: true },
];

export const TREE_SECRET =
  "secrets.json holds one secret: what the stream hides. The other channels' secrets aren't in the package at all.";

/** The three secret banners, as in the prototype. */
export const SECRETS: Array<{ channel: string; text: string; tint: string }> = [
  { channel: "Only the series knows", text: "Why the baby lived", tint: "#a9771f" },
  { channel: "Only the game knows", text: "What the stream hides", tint: "#2c7f93" },
  { channel: "Only the shorts know", text: "Who first spoke the vow", tint: "#a8476a" },
];

/** Which publish card carries which secret banner (prototype data-at). */
export const PUBLISH_SECRETS: Record<
  number,
  { channel: string; text: string; tint: string }
> = {
  2: SECRETS[0],
  4: SECRETS[1],
  3: SECRETS[2],
};

export const CHANGE_LINE = "Enyinyi told them how to kill him.";

export const VIDEO_CAPTION =
  "One night they run across the Omabala to escape him.";

export const BROWSER_URL = "your-story.storyverse";
export const BROWSER_TITLE = "Anukili Ugama";
export const BROWSER_SUB =
  "The series, the game and the shorts, all in one place.";

/** Every raster path the landing needs, for preloading and tests. */
export const LANDING_IMAGES: string[] = Array.from(
  new Set([
    ...CARDS.map((card) => card.src),
    ...CHAPTERS.filter((c) => c.img).map((c) => `/anukili/${c.img}.webp`),
  ]),
);

// ---------------------------------------------------------------------------
// Prototype scroll math, kept exact. The engine in LandingPage.tsx evaluates
// these per frame and applies them with transform/opacity only.
// ---------------------------------------------------------------------------

/** Prototype clamp(v, 0, 1). */
export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Prototype smooth(t) = t*t*(3-2t). */
export const smooth = (t: number): number => t * t * (3 - 2 * t);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Prototype segment ease: smooth(clamp((f - .32) / .58)). Holds each end. */
export function segmentEase(f: number): number {
  return smooth(clamp01((f - 0.32) / 0.58));
}

/**
 * Prototype per-card stagger: clamp(e*1.35 - (n%8)*.05). Cards deal in one
 * after another instead of moving as a block.
 */
export function stagger(e: number, n: number): number {
  return clamp01(e * 1.35 - (n % 8) * 0.05);
}

/** A seat with wv resolved to vh and every field defaulted, w/h in vh. */
export type ResolvedSeat = {
  x: number;
  y: number;
  w: number;
  h: number;
  ry: number;
  rz: number;
  tz: number;
  o: number;
  shot?: string;
  hit?: string;
};

/** Prototype get(ch, i): merge the layout over the hidden seat. */
export function resolveSeat(
  ch: number,
  id: number,
  aspect: number,
): ResolvedSeat {
  const raw: Seat = LAYOUTS[ch]?.[id] ?? HIDDEN_SEAT;
  return {
    x: raw.x,
    y: raw.y,
    w: raw.wv != null ? raw.wv * aspect : (raw.w ?? HIDDEN_SEAT.w ?? 22),
    h: raw.h ?? HIDDEN_SEAT.h ?? 32,
    ry: raw.ry ?? 0,
    rz: raw.rz ?? 0,
    tz: raw.tz ?? 0,
    o: raw.o,
    shot: raw.shot,
    hit: raw.hit,
  };
}

export type CardRect = ResolvedSeat & {
  id: number;
  /** Centre in px. */
  cx: number;
  cy: number;
  /** Size in px. */
  wpx: number;
  hpx: number;
};

/** Fixed top bar height; hero cards must stay below it and stay clickable. */
export const TOP_BAR_H = 76;
/** Extra margin so pointer float can never push a card under the bar. */
const TOP_SAFE_MARGIN = 20;

/**
 * Runtime guard: if a hero-ring seat would reach into the top bar, shift it
 * down just enough to clear it. At normal viewports this is a no-op; it only
 * bites on very short stages.
 */
export function clampSeatBelowBar(
  seat: ResolvedSeat,
  viewportH: number,
): ResolvedSeat {
  const minTopVh = ((TOP_BAR_H + TOP_SAFE_MARGIN) / viewportH) * 100;
  if (seat.y - seat.h / 2 < minTopVh) {
    return { ...seat, y: minTopVh + seat.h / 2 };
  }
  return seat;
}

/**
 * Every persistent card's rect for one chapter at a W/H viewport. Cards with
 * no seat hide in the pile (opacity 0), exactly like the prototype. The
 * hero rings (first/last chapter) pass through the top-bar guard.
 */
export function layoutRects(
  ch: number,
  viewportW: number,
  viewportH: number,
): CardRect[] {
  const aspect = viewportW / viewportH;
  const ring = ch === 0 || ch === CHAPTERS.length - 1;
  return CARDS.map((card) => {
    const seat = resolveSeat(ch, card.id, aspect);
    const safe = ring ? clampSeatBelowBar(seat, viewportH) : seat;
    return {
      ...safe,
      id: card.id,
      cx: (safe.x / 100) * viewportW,
      cy: (safe.y / 100) * viewportH,
      wpx: (safe.w / 100) * viewportH,
      hpx: (safe.h / 100) * viewportH,
    };
  });
}

/**
 * Largest size a card ever needs, in px at a W/H viewport. The engine
 * renders each card at this size once and morphs with scale only.
 */
export function cardBasePx(
  id: number,
  viewportW: number,
  viewportH: number,
): { w: number; h: number } {
  let w = 0;
  let h = 0;
  for (let ch = 0; ch < CHAPTERS.length; ch++) {
    const seat = resolveSeat(ch, id, viewportW / viewportH);
    w = Math.max(w, (seat.w / 100) * viewportH);
    h = Math.max(h, (seat.h / 100) * viewportH);
  }
  return { w, h };
}
