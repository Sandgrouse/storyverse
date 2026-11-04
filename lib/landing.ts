/**
 * Landing page chapters, copy and card layouts.
 *
 * Copy is final (owner-approved) and must be used word for word.
 * Layouts use viewport-relative seats: x/y are offsets in vw/vh from the
 * stage centre, r is in-plane rotation in degrees, ry is the curved
 * gallery facing angle, z is translateZ depth, s is uniform scale (never
 * stretched), and depth scales the pointer parallax. The scroll engine
 * only ever animates transform and opacity; card elements keep one fixed
 * size and shape in CSS.
 */

export type LandingSide = "l" | "r";

export type CardKind = "art" | "sheet" | "player" | "thumb";

export type LandingCard = {
  /** Public path, e.g. "/anukili/roots.webp". */
  src: string;
  kind: CardKind;
  alt: string;
  /** Seat in the pinned layout, in vw/vh from the stage centre. */
  x: number;
  y: number;
  /** Rotate in the screen plane, in degrees. */
  r: number;
  /** Facing angle of the curved gallery, in degrees. */
  ry: number;
  /** Gallery depth under the 1500px stage perspective, in px. */
  z: number;
  s: number;
  /** Pointer parallax factor. 0 opts out (wide panels stay put). */
  depth: number;
  /** Small badge shown on the card, e.g. "Breaks". */
  flag?: string;
  /** Outline-pulse once when the chapter arrives. */
  pulse?: boolean;
  /** Cross-fade direction inside its chapter ("out" fades as "in" arrives). */
  fade?: "out" | "in";
  /** Strip attached to the card's lower edge, moving with it. */
  secret?: { channel: string; text: string; tint: string };
};

export type ChapterFeature =
  | "none"
  | "script"
  | "line"
  | "tree"
  | "browser"
  | "video";

export type Chapter = {
  id: string;
  label: string;
  side: LandingSide | null;
  tint: string;
  kicker?: string;
  heading?: string;
  body?: string;
  soon?: boolean;
  /** Lower the copy block so it clears a top visual. */
  low?: boolean;
  feature: ChapterFeature;
  cards: LandingCard[];
};

const ART = (name: string) => `/anukili/${name}.webp`;
const SHEET = (name: string) => `/anukili/sheets/${name}.webp`;

export const HERO_HEADING = ["One story.", "Every screen."];
export const HERO_LEDE =
  "Build your story once. Publish it as a series, a game, shorts and more.";

export const CLOSE_HEADING = ["Your story is bigger", "than one screen."];

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
  { type: "say", text: "Are you sure it is a hippopotamus?" },
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

export const SECRETS: Array<{ channel: string; text: string; tint: string }> = [
  { channel: "Only the series knows", text: "Why the baby lived", tint: "#a9771f" },
  { channel: "Only the game knows", text: "What the stream hides", tint: "#2c7f93" },
  { channel: "Only the shorts know", text: "Who first spoke the vow", tint: "#a8476a" },
];

export const CHANGE_LINE = "Enyinyi told them how to kill him.";

export const VIDEO_CAPTION =
  "One night they run across the Omabala to escape him.";

/**
 * Prototype ring seat: four cards a side, curving away from the centre
 * under the 1500px stage perspective. `out0` pushes every seat outward.
 */
export function ringSeat(side: -1 | 1, k: number, out0 = 0) {
  return {
    x: side * (26.5 + out0 + k * 7 + k * k * 1.2),
    y: 0,
    r: 0,
    ry: -side * (26 + k * 13),
    z: k * 34,
  };
}

/** The eight hero cards as a curved gallery. Inner cards sit at ±26.5vw. */
function heroCards(out0 = 0): LandingCard[] {
  const left: Array<[string, string]> = [
    ["roots", "Oral history"],
    ["storm", "The storm"],
    ["hippo", "The stream"],
    ["enyinyi", "Enyinyi"],
  ];
  const right: Array<[string, string]> = [
    ["pots", "Clay pots"],
    ["anukili", "Anukili"],
    ["fire", "Firelight"],
    ["omabala", "The Omabala river"],
  ];
  // Outer cards are larger and closer, matching the prototype's seat sizes
  // (inner 30vh tall, growing outward) against the fixed card CSS width.
  const scales = [0.56, 0.86, 1.38, 2.15];
  const depths = [0.5, 0.8, 1, 1.2];
  const build = (
    side: -1 | 1,
    [name, alt]: [string, string],
    k: number,
  ): LandingCard => ({
    src: ART(name),
    kind: "art",
    alt,
    ...ringSeat(side, k, out0),
    s: scales[k] ?? 0.6,
    depth: depths[k] ?? 1,
  });
  return [
    ...left.map((entry, k) => build(-1, entry, k)),
    ...right.map((entry, k) => build(1, entry, k)),
  ];
}

export const VIDEO_THUMBS = [
  { src: ART("pots"), alt: "Clay pots by the fire" },
  { src: ART("storm"), alt: "Storm clouds over the river" },
  { src: ART("hippo"), alt: "A hippopotamus at the stream" },
  { src: ART("fire"), alt: "Firelight at night" },
];

export const BROWSER_URL = "your-story.storyverse";
export const BROWSER_TITLE = "Anukili Ugama";
export const BROWSER_SUB =
  "The series, the game and the shorts, all in one place.";

export const CHAPTERS: Chapter[] = [
  {
    id: "start",
    label: "Start",
    side: null,
    tint: "#efe8db",
    feature: "none",
    cards: heroCards(0),
  },
  {
    id: "world",
    label: "Your world",
    side: "r",
    tint: "#e9e0ce",
    kicker: "Your world",
    heading: "Everything starts with your world",
    body: "Your world, characters, plot and goal live in one master story. Everything else draws from it.",
    feature: "none",
    cards: [
      { src: ART("roots"), kind: "art", alt: "Oral history", x: -24, y: 0, r: -2, ry: 0, z: 0, s: 1, depth: 0.4 },
      { src: ART("fire"), kind: "art", alt: "Firelight", x: -38, y: -14, r: -8, ry: 0, z: 0, s: 0.62, depth: 0.9 },
      { src: ART("storm"), kind: "art", alt: "The storm", x: -10, y: 16, r: 6, ry: 0, z: 0, s: 0.62, depth: 0.9 },
      { src: ART("pots"), kind: "art", alt: "Clay pots", x: -38, y: 16, r: 5, ry: 0, z: 0, s: 0.5, depth: 1.1 },
    ],
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
    cards: [
      { src: SHEET("anukili-ugama/front"), kind: "sheet", alt: "Anukili, front view", x: -22, y: 0, r: -1, ry: 0, z: 0, s: 1, depth: 0.4 },
      { src: SHEET("anukili-ugama/left"), kind: "sheet", alt: "Anukili, left view", x: -36, y: 3, r: -7, ry: 0, z: 0, s: 0.78, depth: 0.8 },
      { src: SHEET("anukili-ugama/walking"), kind: "sheet", alt: "Anukili, walking pose", x: -8, y: 3, r: 6, ry: 0, z: 0, s: 0.78, depth: 0.8 },
      { src: SHEET("anukili-ugama/back"), kind: "sheet", alt: "Anukili, back view", x: -42, y: 12, r: -10, ry: 0, z: 0, s: 0.6, depth: 1.1 },
      { src: SHEET("enyinyi/front"), kind: "sheet", alt: "Enyinyi, front view", x: -1, y: 12, r: 9, ry: 0, z: 0, s: 0.6, depth: 1.1 },
    ],
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
    cards: [
      { src: ART("hippo"), kind: "art", alt: "The stream", x: 6, y: -20, r: 5, ry: 0, z: 0, s: 0.55, depth: 0.7 },
    ],
  },
  {
    id: "parts",
    label: "Parts",
    side: "l",
    tint: "#ecd9c9",
    kicker: "Parts",
    heading: "Break it across screens",
    body: "Split your story into a series, a game and shorts. Each holds a secret the others don't, so fans follow them all.",
    feature: "none",
    cards: [
      { src: ART("storm"), kind: "art", alt: "The series", x: -3, y: 0, r: 0, ry: 0, z: 0, s: 0.8, depth: 0.5, secret: SECRETS[0] },
      { src: ART("hippo"), kind: "art", alt: "The game", x: 16, y: 0, r: 0, ry: 0, z: 0, s: 0.8, depth: 0.7, secret: SECRETS[1] },
      { src: ART("pots"), kind: "art", alt: "The shorts", x: 35, y: 0, r: 0, ry: 0, z: 0, s: 0.8, depth: 0.9, secret: SECRETS[2] },
    ],
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
    cards: [
      { src: ART("roots"), kind: "art", alt: "Oral history", x: 0, y: -16, r: 0, ry: 0, z: 0, s: 0.52, depth: 0.5 },
      { src: ART("hippo"), kind: "art", alt: "The stream", x: 18, y: -16, r: 0, ry: 0, z: 0, s: 0.52, depth: 0.6 },
      { src: ART("storm"), kind: "art", alt: "The storm", x: 36, y: -16, r: 0, ry: 0, z: 0, s: 0.52, depth: 0.7 },
      { src: ART("pots"), kind: "art", alt: "Clay pots", x: 0, y: 16, r: 0, ry: 0, z: 0, s: 0.52, depth: 0.8, flag: "Breaks", pulse: true },
      { src: ART("fire"), kind: "art", alt: "Firelight", x: 18, y: 16, r: 0, ry: 0, z: 0, s: 0.52, depth: 0.9, flag: "Breaks", pulse: true },
      { src: ART("omabala"), kind: "art", alt: "The Omabala river", x: 36, y: 16, r: 0, ry: 0, z: 0, s: 0.52, depth: 1, flag: "Breaks", pulse: true },
    ],
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
    cards: [
      { src: ART("enyinyi"), kind: "art", alt: "Enyinyi", x: -24, y: 0, r: 0, ry: 0, z: 0, s: 0.95, depth: 0.4 },
      { src: ART("roots"), kind: "art", alt: "Oral history", x: -40, y: -16, r: -7, ry: 0, z: 0, s: 0.55, depth: 0.9 },
      { src: ART("hippo"), kind: "art", alt: "The stream", x: -8, y: -16, r: 6, ry: 0, z: 0, s: 0.55, depth: 0.9 },
      { src: ART("fire"), kind: "art", alt: "Firelight", x: -40, y: 17, r: 6, ry: 0, z: 0, s: 0.55, depth: 1 },
      { src: ART("storm"), kind: "art", alt: "The storm", x: -8, y: 17, r: -5, ry: 0, z: 0, s: 0.55, depth: 1 },
    ],
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
    cards: [
      { src: ART("omabala"), kind: "art", alt: "The Omabala river", x: -12, y: -10, r: 0, ry: 0, z: 0, s: 0.72, depth: 0, fade: "out" },
      { src: ART("omabala"), kind: "player", alt: "Crossing the Omabala, video preview", x: -12, y: -10, r: 0, ry: 0, z: 0, s: 1, depth: 0, fade: "in" },
      ...VIDEO_THUMBS.map((thumb, i) => ({
        ...thumb,
        kind: "thumb" as const,
        x: [-27, -17, -7, 3][i] ?? 0,
        y: 22,
        r: 0,
        ry: 0,
        z: 0,
        s: 1,
        depth: 0,
      })),
    ],
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
    cards: [
      { src: ART("hippo"), kind: "art", alt: "The stream", x: -3, y: -4, r: 4, ry: 0, z: 0, s: 0.66, depth: 0.6 },
      { src: SHEET("anukili-ugama/front"), kind: "sheet", alt: "Anukili, front view", x: -10, y: 5, r: -6, ry: 0, z: 0, s: 0.62, depth: 0.8 },
      { src: SHEET("enyinyi/front"), kind: "sheet", alt: "Enyinyi, front view", x: 4, y: 7, r: 7, ry: 0, z: 0, s: 0.62, depth: 0.9 },
    ],
  },
  {
    id: "next",
    label: "Next",
    side: "r",
    tint: "#eadfd0",
    kicker: "",
    heading: "Your story's website",
    body: "Publish a home for your story from the same base.",
    soon: true,
    feature: "browser",
    cards: [],
  },
  {
    id: "begin",
    label: "Begin",
    side: null,
    tint: "#efe8db",
    feature: "none",
    cards: heroCards(7),
  },
];

/** Every raster path the landing needs, for preloading and tests. */
export const LANDING_IMAGES: string[] = Array.from(
  new Set([
    ...CHAPTERS.flatMap((c) => c.cards.map((card) => card.src)),
    ...VIDEO_THUMBS.map((t) => t.src),
    ART("storm"),
  ]),
);
