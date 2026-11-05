/**
 * raea render folders for the agent package. Pure: no fetch, DOM or
 * key. Storyverse never includes, downloads or runs raea; the files
 * built here only import from it, for a creator who has it installed.
 * The Remotion player and browser export do not change.
 */

/** One shot's row in the generated `shots.ts`. */
export type RaeaShot = {
  image: string;
  caption: string;
  durationSec: number;
  motion: "push" | "pan" | "still";
  portrait: boolean;
  audio?: string;
};

/**
 * The exact text of every folder's `edit.tsx`. This file has been
 * rendered with raea 0.1.0-canary.2, at 16:9 and 9:16, with WebP and
 * PNG art, crossfades and voice audio. Do not restyle it.
 */
export const RAEA_VIDEO_EDIT = `import { AbsoluteFill, Audio, Composition, Img, Sequence, interpolate, registerRoot, staticFile, useCurrentFrame } from "raea";
import { HEIGHT, SHOTS, WIDTH } from "./shots";

const FPS = 30;
const FADE = 12;
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
type Shot = (typeof SHOTS)[number];

const framesOf = (seconds: number) => Math.max(1, Math.round(seconds * FPS));
const starts = SHOTS.map((_, index) =>
  SHOTS.slice(0, index).reduce((at, shot) => at + Math.max(0, framesOf(shot.durationSec) - FADE), 0),
);
const last = SHOTS.length - 1;
const total = (starts[last] ?? 0) + framesOf(SHOTS[last]?.durationSec ?? 1);

function motion(shot: Shot, progress: number): string | undefined {
  if (shot.motion === "push") return "scale(" + interpolate(progress, [0, 1], [1, 1.09], CLAMP) + ")";
  if (shot.motion === "pan") return "scale(1.09) translateX(" + interpolate(progress, [0, 1], [1.2, -1.2], CLAMP) + "%)";
  return undefined;
}

function ShotView({ shot, fadeIn }: { shot: Shot; fadeIn: boolean }) {
  const frame = useCurrentFrame();
  const length = framesOf(shot.durationSec);
  const progress = length <= 1 ? 1 : frame / (length - 1);
  const position = WIDTH > HEIGHT && shot.portrait ? "50% 12%" : "50% 50%";
  return (
    <AbsoluteFill style={{ opacity: fadeIn ? interpolate(frame, [0, FADE], [0, 1], CLAMP) : 1 }}>
      <AbsoluteFill style={{ transform: motion(shot, progress) }}>
        <Img src={staticFile(shot.image)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: position }} />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "44px 26px 20px", textAlign: "center", color: "#fff", fontFamily: "Georgia, serif", fontSize: 23, lineHeight: 1.25, background: "linear-gradient(transparent, rgba(0,0,0,0.76))" }}>
        {shot.caption}
      </div>
      {"audio" in shot && shot.audio ? <Audio src={staticFile(shot.audio)} /> : null}
    </AbsoluteFill>
  );
}

function Short() {
  return (
    <AbsoluteFill style={{ backgroundColor: "#111" }}>
      {SHOTS.map((shot, index) => (
        <Sequence key={index} from={starts[index] ?? 0} durationInFrames={framesOf(shot.durationSec)}>
          <ShotView shot={shot} fadeIn={index > 0} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

registerRoot(() => <Composition id="short" component={Short} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={total} />);
`;

/**
 * The text of the folder's `shots.ts`. Values go through
 * JSON.stringify, so quotes in a caption can't break the file. WIDTH
 * and HEIGHT match the browser export. `audio` stays out when a shot
 * has no voice line.
 */
export function raeaShotsTs(shots: RaeaShot[], aspect: "16:9" | "9:16"): string {
  const width = aspect === "9:16" ? 720 : 1280;
  const height = aspect === "9:16" ? 1280 : 720;
  const rows = shots.map((shot) => {
    const fields = [
      `image: ${JSON.stringify(shot.image)}`,
      `caption: ${JSON.stringify(shot.caption)}`,
      `durationSec: ${JSON.stringify(shot.durationSec)}`,
      `motion: ${JSON.stringify(shot.motion)}`,
      `portrait: ${JSON.stringify(shot.portrait)}`,
    ];
    if (shot.audio !== undefined) fields.push(`audio: ${JSON.stringify(shot.audio)}`);
    return `  { ${fields.join(", ")} },`;
  });
  return `export const WIDTH = ${width};\nexport const HEIGHT = ${height};\nexport const SHOTS = [\n${rows.join("\n")}\n] as const;\n`;
}

/**
 * The text of the folder's `README.md`, with the title filled in.
 * Left-out shot numbers add one line each, in shot order.
 */
export function raeaVideoReadme(title: string, leftOut: number[] = []): string {
  const lines = [
    `# ${title}: render with raea`,
    ``,
    `An optional, faster way to render this short on your own machine. The Video page in Storyverse still exports it from the browser, and you don't need this folder for that.`,
    ``,
    `raea is a separate tool, and Storyverse doesn't include it. Check its site for the machines it runs on, and its licence if you plan to offer rendering to other people: https://raea.io`,
    ``,
    `    curl -fsSL https://raea.io/install | sh`,
    `    raea render edit.tsx -o short.mp4 --quality high`,
    ``,
    `Change the cut in \`shots.ts\`. Art and voice lines are in \`media/\`.`,
    ``,
  ];
  for (const shot of leftOut) {
    lines.push(`Left out: shot ${shot}, the image could not be read.`);
  }
  if (leftOut.length > 0) lines.push(``);
  return lines.join("\n");
}

/** File extension for a media data URL's mime, or null. */
export function mediaExtension(mime: string): string | null {
  switch (mime) {
    case "image/webp":
      return "webp";
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
      return "wav";
    default:
      return null;
  }
}

function u16BE(bytes: Uint8Array, at: number): number {
  return bytes[at]! * 256 + bytes[at + 1]!;
}

function u16LE(bytes: Uint8Array, at: number): number {
  return bytes[at]! + bytes[at + 1]! * 256;
}

function u24LE(bytes: Uint8Array, at: number): number {
  return bytes[at]! + bytes[at + 1]! * 256 + bytes[at + 2]! * 65536;
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[at + i]!);
  return out;
}

/** PNG dimensions from the IHDR chunk, or null. */
function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return null;
  }
  if (ascii(bytes, 12, 4) !== "IHDR") return null;
  const fullWidth =
    bytes[16]! * 16777216 + bytes[17]! * 65536 + bytes[18]! * 256 + bytes[19]!;
  const fullHeight =
    bytes[20]! * 16777216 + bytes[21]! * 65536 + bytes[22]! * 256 + bytes[23]!;
  if (fullWidth === 0 || fullHeight === 0) return null;
  return { width: fullWidth, height: fullHeight };
}

/** True for a JPEG start-of-frame marker (not DHT, JPG or DAC). */
function isSof(marker: number): boolean {
  return (
    marker === 0xc0 ||
    marker === 0xc1 ||
    marker === 0xc2 ||
    marker === 0xc3 ||
    marker === 0xc5 ||
    marker === 0xc6 ||
    marker === 0xc7 ||
    marker === 0xc9 ||
    marker === 0xca ||
    marker === 0xcb ||
    marker === 0xcd ||
    marker === 0xce ||
    marker === 0xcf
  );
}

/** JPEG dimensions from the first start-of-frame segment, or null. */
function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    if (marker === 0xd9) return null;
    const length = u16BE(bytes, at + 2);
    if (length < 2 || at + 2 + length > bytes.length) return null;
    if (isSof(marker)) {
      if (length < 7 || at + 9 > bytes.length) return null;
      const height = u16BE(bytes, at + 5);
      const width = u16BE(bytes, at + 7);
      if (width === 0 || height === 0) return null;
      return { width, height };
    }
    at += 2 + length;
  }
  return null;
}

/** WebP dimensions for VP8, VP8L and VP8X payloads, or null. */
function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 20) return null;
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  const fourcc = ascii(bytes, 12, 4);
  if (fourcc === "VP8 ") {
    if (bytes.length < 30) return null;
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    const width = u16LE(bytes, 26) & 0x3fff;
    const height = u16LE(bytes, 28) & 0x3fff;
    if (width === 0 || height === 0) return null;
    return { width, height };
  }
  if (fourcc === "VP8L") {
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null;
    const b1 = bytes[21]!;
    const b2 = bytes[22]!;
    const b3 = bytes[23]!;
    const b4 = bytes[24]!;
    const width = (b1 | ((b2 & 0x3f) << 8)) + 1;
    const height = ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)) + 1;
    return { width, height };
  }
  if (fourcc === "VP8X") {
    if (bytes.length < 30) return null;
    const width = u24LE(bytes, 24) + 1;
    const height = u24LE(bytes, 27) + 1;
    return { width, height };
  }
  return null;
}

/**
 * True when PNG, JPEG or WebP (VP8, VP8L and VP8X) header bytes show
 * an image taller than it is wide. Anything else reads as false.
 */
export function imageIsPortrait(bytes: Uint8Array): boolean {
  const size = pngSize(bytes) ?? jpegSize(bytes) ?? webpSize(bytes);
  if (!size) return false;
  return size.height > size.width;
}
