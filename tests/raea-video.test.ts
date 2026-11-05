import { execFile, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { planAgentFiles } from "@/lib/package";
import {
  imageIsPortrait,
  mediaExtension,
  raeaShotsTs,
  raeaVideoEdit,
  raeaVideoReadme,
} from "@/lib/raea-video";
import { audioForShot } from "@/lib/video";
import { WorldSchema, type World } from "@/lib/world/schemas";

const execFileAsync = promisify(execFile);

function dataUrl(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function pngBytes(width: number, height: number): Uint8Array {
  const out = new Uint8Array(33);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  out.set([0, 0, 0, 13], 8);
  out.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(out.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  out.set([8, 2, 0, 0, 0], 24);
  return out;
}

function jpegBytes(width: number, height: number): Uint8Array {
  const out = new Uint8Array(17);
  out.set([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8]);
  const view = new DataView(out.buffer);
  view.setUint16(7, height);
  view.setUint16(9, width);
  out.set([1, 1, 0x11, 0, 0xff, 0xd9], 11);
  return out;
}

function webpLossyBytes(width: number, height: number): Uint8Array {
  const out = new Uint8Array(30);
  const view = new DataView(out.buffer);
  out.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, 22, true);
  out.set([0x57, 0x45, 0x42, 0x50], 8);
  out.set([0x56, 0x50, 0x38, 0x20], 12);
  view.setUint32(16, 10, true);
  out.set([0, 0, 0, 0x9d, 0x01, 0x2a], 20);
  view.setUint16(26, width, true);
  view.setUint16(28, height, true);
  return out;
}

function webpLosslessBytes(width: number, height: number): Uint8Array {
  const out = new Uint8Array(25);
  const view = new DataView(out.buffer);
  out.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, 17, true);
  out.set([0x57, 0x45, 0x42, 0x50], 8);
  out.set([0x56, 0x50, 0x38, 0x4c], 12);
  view.setUint32(16, 5, true);
  const minusWidth = width - 1;
  const minusHeight = height - 1;
  out[20] = 0x2f;
  out[21] = minusWidth & 0xff;
  out[22] = ((minusWidth >> 8) & 0x3f) | ((minusHeight & 0x03) << 6);
  out[23] = (minusHeight >> 2) & 0xff;
  out[24] = ((minusHeight >> 10) & 0x0f) | (2 << 4);
  return out;
}

function webpExtendedBytes(width: number, height: number): Uint8Array {
  const out = new Uint8Array(30);
  const view = new DataView(out.buffer);
  out.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, 22, true);
  out.set([0x57, 0x45, 0x42, 0x50], 8);
  out.set([0x56, 0x50, 0x38, 0x58], 12);
  view.setUint32(16, 10, true);
  view.setUint32(24, width - 1, true);
  out[27] = (height - 1) & 0xff;
  out[28] = ((height - 1) >> 8) & 0xff;
  out[29] = ((height - 1) >> 16) & 0xff;
  return out;
}

function makeWorld(overrides: {
  shorts?: World["shorts"];
  channels?: World["channels"];
}): World {
  return WorldSchema.parse({
    id: "test-story",
    title: "Test Story",
    premise: "A premise.",
    logline: "A logline.",
    characters: [
      {
        id: "ada",
        name: "Ada",
        canon: "Brave and tall.",
        sheet: [],
        voice: { id: "v-ada", name: "Ada's voice" },
        lines: [
          {
            id: "line-1",
            text: "I am here.",
            audioPath: dataUrl(
              "audio/mpeg",
              Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0]),
            ),
          },
          { id: "line-idb", text: "Later.", audioPath: "idb:voice-line" },
          { id: "line-bad", text: "Broken.", audioPath: "data:audio/mpeg;base64" },
        ],
      },
    ],
    locations: [],
    channels: overrides.channels ?? [
      { id: "shorts", name: "Shorts", kind: "shorts", title: "The Shorts" },
      { id: "series", name: "Series", kind: "series", title: "The Series" },
      { id: "game", name: "Game", kind: "game", title: "The Game" },
    ],
    parts: [
      {
        id: "part-1",
        order: 1,
        title: "Beginnings",
        summary: "Ada arrives.",
        excerpt: "She came at dawn.",
        imagePath: "",
        characterIds: ["ada"],
      },
    ],
    beats: [],
    secrets: [],
    gaps: [],
    shorts: overrides.shorts ?? [],
  });
}

function shotImage(partId = "part-1") {
  return dataUrl("image/png", pngBytes(4, 8));
}

function shortEntry(
  channelId: string,
  partId: string,
  caption: string,
  extraShots: World["shorts"][number]["shots"] = [],
): World["shorts"][number] {
  return {
    id: `${channelId}::${partId}`,
    channelId,
    partId,
    title: `Short ${partId}`,
    aspect: "16:9",
    shots: [
      {
        id: "shot-1",
        imagePath: shotImage(partId),
        caption,
        durationSec: 4,
        motion: "push",
      },
      ...extraShots,
    ],
  };
}

describe("imageIsPortrait", () => {
  it("reads PNG headers, tall and wide", () => {
    expect(imageIsPortrait(pngBytes(4, 8))).toBe(true);
    expect(imageIsPortrait(pngBytes(8, 4))).toBe(false);
    expect(imageIsPortrait(pngBytes(6, 6))).toBe(false);
  });

  it("reads JPEG headers, tall and wide", () => {
    expect(imageIsPortrait(jpegBytes(4, 8))).toBe(true);
    expect(imageIsPortrait(jpegBytes(8, 4))).toBe(false);
  });

  it("reads lossy WebP (VP8) headers, tall and wide", () => {
    expect(imageIsPortrait(webpLossyBytes(4, 8))).toBe(true);
    expect(imageIsPortrait(webpLossyBytes(8, 4))).toBe(false);
  });

  it("reads lossless WebP (VP8L) headers, tall and wide", () => {
    expect(imageIsPortrait(webpLosslessBytes(4, 8))).toBe(true);
    expect(imageIsPortrait(webpLosslessBytes(8, 4))).toBe(false);
  });

  it("reads extended WebP (VP8X) headers, tall and wide", () => {
    expect(imageIsPortrait(webpExtendedBytes(4, 8))).toBe(true);
    expect(imageIsPortrait(webpExtendedBytes(8, 4))).toBe(false);
  });

  it("returns false when the bytes cannot be read", () => {
    expect(imageIsPortrait(new Uint8Array([]))).toBe(false);
    expect(imageIsPortrait(Uint8Array.from([1, 2, 3, 4]))).toBe(false);
    expect(imageIsPortrait(pngBytes(4, 8).slice(0, 10))).toBe(false);
    expect(imageIsPortrait(webpLossyBytes(4, 8).slice(0, 20))).toBe(false);
  });
});

describe("mediaExtension", () => {
  it("maps the known mimes", () => {
    expect(mediaExtension("image/webp")).toBe("webp");
    expect(mediaExtension("image/png")).toBe("png");
    expect(mediaExtension("image/jpeg")).toBe("jpg");
    expect(mediaExtension("audio/mpeg")).toBe("mp3");
    expect(mediaExtension("audio/wav")).toBe("wav");
  });

  it("gives null for anything else", () => {
    expect(mediaExtension("image/gif")).toBeNull();
    expect(mediaExtension("text/plain")).toBeNull();
    expect(mediaExtension("")).toBeNull();
  });
});

describe("raeaShotsTs", () => {
  function jsonValue(text: string, key: string): unknown {
    const match = new RegExp(
      `${key}: (null|true|false|-?[0-9]+(?:\\.[0-9]+)?|"(?:[^"\\\\]|\\\\.)*")`,
    ).exec(text);
    expect(match).not.toBeNull();
    return JSON.parse(match![1] as string);
  }

  it("keeps a caption with quotes, backslashes and a line break valid", () => {
    const caption = 'Anukili "waits" \\ at the river\nat dusk';
    const text = raeaShotsTs(
      [
        {
          image: "shot-01.webp",
          caption,
          durationSec: 4,
          motion: "push",
          portrait: false,
        },
      ],
      "16:9",
    );
    expect(jsonValue(text, "caption")).toBe(caption);
    expect(jsonValue(text, "image")).toBe("shot-01.webp");
    expect(jsonValue(text, "durationSec")).toBe(4);
    expect(jsonValue(text, "motion")).toBe("push");
    expect(jsonValue(text, "portrait")).toBe(false);
  });

  it("sets 1280x720 for 16:9 and 720x1280 for 9:16", () => {
    const wide = raeaShotsTs([], "16:9");
    expect(wide).toContain("export const WIDTH = 1280;");
    expect(wide).toContain("export const HEIGHT = 720;");
    const tall = raeaShotsTs([], "9:16");
    expect(tall).toContain("export const WIDTH = 720;");
    expect(tall).toContain("export const HEIGHT = 1280;");
    expect(tall).toContain("] as const;");
  });

  it("leaves audio out when a shot has no voice line", () => {
    const text = raeaShotsTs(
      [
        {
          image: "shot-01.webp",
          caption: "Silent",
          durationSec: 3,
          motion: "still",
          portrait: true,
        },
        {
          image: "shot-02.png",
          caption: "Spoken",
          durationSec: 3,
          motion: "pan",
          portrait: false,
          audio: "line-02.mp3",
        },
      ],
      "16:9",
    );
    const rows = text.split("\n").filter((line) => line.startsWith("  {"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).not.toContain("audio");
    expect(rows[1]).toContain('audio: "line-02.mp3"');
  });
});

describe("raeaVideoReadme", () => {
  it("fills in the title with no left-out lines", () => {
    const text = raeaVideoReadme("Arrival");
    expect(text).toContain("# Arrival: render with raea");
    expect(text).toContain("https://raea.io");
    expect(text).toContain("raea render edit.tsx -o short.mp4 --quality high");
    expect(text).not.toContain("Left out");
  });

  it("adds one left-out line per bad shot", () => {
    const text = raeaVideoReadme("Arrival", [2, 4]);
    expect(text).toContain("Left out: shot 2, the image could not be read.");
    expect(text).toContain("Left out: shot 4, the image could not be read.");
  });
});

describe("raeaVideoEdit", () => {
  it("imports from raea and never from remotion", () => {
    for (const hasAudio of [true, false]) {
      expect(raeaVideoEdit(hasAudio)).toContain('from "raea"');
      expect(raeaVideoEdit(hasAudio)).not.toContain("remotion");
    }
  });

  it("holds no backticks or backslashes", () => {
    for (const hasAudio of [true, false]) {
      expect(raeaVideoEdit(hasAudio)).not.toContain("`");
      expect(raeaVideoEdit(hasAudio)).not.toContain("\\");
    }
  });

  it("has one <Audio> with voice lines and none without", () => {
    expect(raeaVideoEdit(false)).not.toContain("<Audio");
    expect((raeaVideoEdit(true).match(/<Audio/g) ?? [])).toHaveLength(1);
  });

  it("differs only by the <Audio> line", () => {
    const line =
      '      {"audio" in shot && shot.audio ? <Audio src={staticFile(shot.audio)} /> : null}';
    expect(raeaVideoEdit(true)).toContain(line);
    expect(raeaVideoEdit(false)).toBe(
      raeaVideoEdit(true).replace(`${line}\n`, ""),
    );
  });
});

describe("audioForShot", () => {
  it("returns the saved line, and nothing for missing or idb lines", () => {
    const world = makeWorld({});
    expect(
      audioForShot(world, {
        id: "shot-1",
        imagePath: "",
        caption: "Hi",
        durationSec: 4,
        motion: "push",
        voice: { characterId: "ada", lineId: "line-1", text: "I am here." },
      }),
    ).toContain("data:audio/mpeg;base64");
    expect(
      audioForShot(world, {
        id: "shot-2",
        imagePath: "",
        caption: "Quiet",
        durationSec: 4,
        motion: "push",
      }),
    ).toBeUndefined();
    expect(
      audioForShot(world, {
        id: "shot-3",
        imagePath: "",
        caption: "Later",
        durationSec: 4,
        motion: "push",
        voice: { characterId: "ada", lineId: "line-idb", text: "Later." },
      }),
    ).toBeUndefined();
    expect(
      audioForShot(world, {
        id: "shot-4",
        imagePath: "",
        caption: "Missing",
        durationSec: 4,
        motion: "push",
        voice: { characterId: "ada", lineId: "nope", text: "Missing." },
      }),
    ).toBeUndefined();
  });
});

function raeaPaths(files: ReturnType<typeof planAgentFiles>): string[] {
  return files.map((file) => file.path).filter((path) => path.includes("/raea/"));
}

function allText(files: ReturnType<typeof planAgentFiles>): string {
  return files
    .map((file) =>
      typeof file.content === "string"
        ? file.content
        : Buffer.from(file.content ?? []).toString("latin1"),
    )
    .join("\n");
}

describe("raea package folders", () => {
  it("appears for the right channel only", () => {
    const world = makeWorld({
      shorts: [
        shortEntry("shorts", "part-1", "Ada waits SHORTS_MARKER"),
        shortEntry("series", "part-1", "Ada watches SERIES_MARKER"),
      ],
    });
    const files = planAgentFiles(world, "shorts");
    const paths = raeaPaths(files);
    expect(paths).toContain("test-story-shorts/raea/part-1/README.md");
    expect(paths).toContain("test-story-shorts/raea/part-1/edit.tsx");
    expect(paths).toContain("test-story-shorts/raea/part-1/shots.ts");
    expect(paths).toContain("test-story-shorts/raea/part-1/media/shot-01.png");
    expect(allText(files)).toContain("SHORTS_MARKER");
    expect(allText(files)).not.toContain("SERIES_MARKER");
    for (const file of files) {
      expect(file.path).not.toContain("series::part-1");
      if (file.path.includes("/raea/")) expect(file.part).toBe("part-1");
    }
    const types = files
      .filter((file) => file.path.includes("/raea/"))
      .map((file) => file.type);
    expect(types).toContain("raea-readme");
    expect(types).toContain("raea-edit");
    expect(types).toContain("raea-data");
    expect(types).toContain("raea-media");
  });

  it("skips game channels", () => {
    const world = makeWorld({
      shorts: [shortEntry("game", "part-1", "Ada plays GAME_MARKER")],
    });
    const files = planAgentFiles(world, "game");
    expect(raeaPaths(files)).toEqual([]);
    expect(allText(files)).not.toContain("GAME_MARKER");
  });

  it("gives no folder when no image decodes", () => {
    const world = makeWorld({
      shorts: [
        {
          id: "shorts::part-1",
          channelId: "shorts",
          partId: "part-1",
          title: "Short part-1",
          aspect: "16:9",
          shots: [
            {
              id: "shot-1",
              imagePath: "",
              caption: "Nothing to see",
              durationSec: 4,
              motion: "push",
            },
            {
              id: "shot-2",
              imagePath: "not-a-data-url",
              caption: "Still nothing",
              durationSec: 4,
              motion: "push",
            },
          ],
        },
      ],
    });
    expect(raeaPaths(planAgentFiles(world, "shorts"))).toEqual([]);
  });

  it("keeps the good shots and notes the left-out one", () => {
    const good = shotImage();
    const world = makeWorld({
      shorts: [
        {
          id: "shorts::part-1",
          channelId: "shorts",
          partId: "part-1",
          title: "Arrival",
          aspect: "9:16",
          shots: [
            {
              id: "shot-1",
              imagePath: "",
              caption: "Bad first",
              durationSec: 4,
              motion: "push",
            },
            {
              id: "shot-2",
              imagePath: good,
              caption: "Good second",
              durationSec: 3,
              motion: "pan",
            },
            {
              id: "shot-3",
              imagePath: dataUrl("image/gif", Uint8Array.from([1, 2, 3])),
              caption: "Unknown type",
              durationSec: 3,
              motion: "still",
            },
          ],
        },
      ],
    });
    const files = planAgentFiles(world, "shorts");
    const shotsFile = files.find((file) => file.path.endsWith("shots.ts"));
    expect(typeof shotsFile?.content).toBe("string");
    const rows = (shotsFile?.content as string)
      .split("\n")
      .filter((line) => line.startsWith("  {"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("Good second");
    const readme = files.find((file) => file.path.endsWith("README.md"));
    expect(readme?.content).toContain(
      "Left out: shot 1, the image could not be read.",
    );
    expect(readme?.content).toContain(
      "Left out: shot 3, the image could not be read.",
    );
  });

  it("shares one media file between shots with the same art", () => {
    const shared = shotImage();
    const world = makeWorld({
      shorts: [
        {
          id: "shorts::part-1",
          channelId: "shorts",
          partId: "part-1",
          title: "Arrival",
          aspect: "16:9",
          shots: [
            {
              id: "shot-1",
              imagePath: shared,
              caption: "First",
              durationSec: 4,
              motion: "push",
            },
            {
              id: "shot-2",
              imagePath: dataUrl("image/webp", webpLossyBytes(8, 4)),
              caption: "Second",
              durationSec: 4,
              motion: "pan",
            },
            {
              id: "shot-3",
              imagePath: shared,
              caption: "Third",
              durationSec: 4,
              motion: "still",
            },
          ],
        },
      ],
    });
    const files = planAgentFiles(world, "shorts");
    const media = files.filter((file) => file.type === "raea-media");
    expect(media.map((file) => file.path).sort()).toEqual([
      "test-story-shorts/raea/part-1/media/shot-01.png",
      "test-story-shorts/raea/part-1/media/shot-02.webp",
    ]);
    const shotsFile = files.find((file) => file.path.endsWith("shots.ts"));
    const text = shotsFile?.content as string;
    expect(text).toContain('image: "shot-01.png"');
    expect(text).not.toContain("shot-03");
  });

  it("writes a voice line to media and keeps a shot with an unreadable line", () => {
    const good = shotImage();
    const world = makeWorld({
      shorts: [
        {
          id: "shorts::part-1",
          channelId: "shorts",
          partId: "part-1",
          title: "Arrival",
          aspect: "16:9",
          shots: [
            {
              id: "shot-1",
              imagePath: good,
              caption: "Spoken",
              durationSec: 4,
              motion: "push",
              voice: { characterId: "ada", lineId: "line-1", text: "I am here." },
            },
            {
              id: "shot-2",
              imagePath: good,
              caption: "Stored away",
              durationSec: 4,
              motion: "push",
              voice: { characterId: "ada", lineId: "line-idb", text: "Later." },
            },
            {
              id: "shot-3",
              imagePath: dataUrl("image/webp", webpLossyBytes(4, 8)),
              caption: "Broken line",
              durationSec: 4,
              motion: "push",
              voice: { characterId: "ada", lineId: "line-bad", text: "Broken." },
            },
          ],
        },
      ],
    });
    const files = planAgentFiles(world, "shorts");
    const media = files
      .filter((file) => file.type === "raea-media")
      .map((file) => file.path)
      .sort();
    expect(media).toContain(
      "test-story-shorts/raea/part-1/media/line-01.mp3",
    );
    expect(media.filter((path) => path.includes("line-"))).toHaveLength(1);
    const text = files.find((file) =>
      file.path.endsWith("shots.ts"),
    )?.content as string;
    const rows = text.split("\n").filter((line) => line.startsWith("  {"));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('audio: "line-01.mp3"');
    expect(rows[1]).not.toContain("audio");
    expect(rows[2]).not.toContain("audio");
  });

  it("leaves <Audio> out of edit.tsx when no shot has a voice line", () => {
    const world = makeWorld({
      shorts: [shortEntry("shorts", "part-1", "Ada waits")],
    });
    const files = planAgentFiles(world, "shorts");
    const edit = files.find((file) => file.type === "raea-edit");
    expect(typeof edit?.content).toBe("string");
    expect(edit?.content as string).toBe(raeaVideoEdit(false));
    expect(edit?.content as string).not.toContain("<Audio");
  });

  it("keeps <Audio> in edit.tsx when one shot has a voice line", () => {
    const world = makeWorld({
      shorts: [
        {
          id: "shorts::part-1",
          channelId: "shorts",
          partId: "part-1",
          title: "Arrival",
          aspect: "16:9",
          shots: [
            {
              id: "shot-1",
              imagePath: shotImage(),
              caption: "Spoken",
              durationSec: 4,
              motion: "push",
              voice: {
                characterId: "ada",
                lineId: "line-1",
                text: "I am here.",
              },
            },
          ],
        },
      ],
    });
    const files = planAgentFiles(world, "shorts");
    const edit = files.find((file) => file.type === "raea-edit");
    expect(typeof edit?.content).toBe("string");
    expect(edit?.content as string).toBe(raeaVideoEdit(true));
    expect(edit?.content as string).toContain("<Audio");
  });

  it("leaves <Audio> out when the only voice line cannot be decoded", () => {
    const world = makeWorld({
      shorts: [
        {
          id: "shorts::part-1",
          channelId: "shorts",
          partId: "part-1",
          title: "Arrival",
          aspect: "16:9",
          shots: [
            {
              id: "shot-1",
              imagePath: shotImage(),
              caption: "Broken line",
              durationSec: 4,
              motion: "push",
              voice: { characterId: "ada", lineId: "line-bad", text: "Broken." },
            },
          ],
        },
      ],
    });
    const files = planAgentFiles(world, "shorts");
    const edit = files.find((file) => file.type === "raea-edit");
    expect(typeof edit?.content).toBe("string");
    expect(edit?.content as string).toBe(raeaVideoEdit(false));
    expect(edit?.content as string).not.toContain("<Audio");
  });
});

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A small real PNG (zlib-compressed) that a renderer can decode. */
function realPng(width: number, height: number): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      raw[row + 1 + x * 3] = 180;
      raw[row + 1 + x * 3 + 1] = 120;
      raw[row + 1 + x * 3 + 2] = 60;
    }
  }
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A short valid WAV (one sine tone) built in code: real audio, no fixture. */
function wavBytes(): Uint8Array {
  const sampleRate = 8000;
  const count = sampleRate;
  const data = new Uint8Array(count * 2);
  const samples = new DataView(data.buffer);
  for (let i = 0; i < count; i += 1) {
    samples.setInt16(
      i * 2,
      Math.round(12000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate)),
      true,
    );
  }
  const out = new Uint8Array(44 + data.length);
  const header = new DataView(out.buffer);
  out.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  header.setUint32(4, 36 + data.length, true);
  out.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  out.set([0x66, 0x6d, 0x74, 0x20], 12); // fmt
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  out.set([0x64, 0x61, 0x74, 0x61], 36); // data
  header.setUint32(40, data.length, true);
  out.set(data, 44);
  return out;
}

const hasRaea = (() => {
  try {
    execFileSync("raea", ["help"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** Plan, write and fully render one short folder; GPU-less machines skip. */
async function renderShortMp4(
  world: World,
  ctx: { skip: () => void },
  expectedEdit: string,
): Promise<void> {
  const files = planAgentFiles(world, "shorts");
  const edit = files.find((file) => file.type === "raea-edit");
  expect(edit?.content).toBe(expectedEdit);
  const dir = await mkdtemp(join(tmpdir(), "raea-test-"));
  for (const file of files) {
    if (!file.path.includes("/raea/") || file.content === undefined) continue;
    const target = join(dir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(
      target,
      typeof file.content === "string" ? file.content : Buffer.from(file.content),
    );
  }
  const cwd = join(dir, "test-story-shorts", "raea", "part-1");
  try {
    await execFileAsync(
      "raea",
      ["render", "edit.tsx", "-o", "short.mp4", "--quality", "draft"],
      { cwd, timeout: 240000 },
    );
  } catch (error) {
    // raea renders on the GPU; a machine with the CLI but no graphics
    // adapter cannot render, so the test skips instead of failing.
    const output = `${String((error as { stderr?: unknown }).stderr ?? "")} ${String(error)}`;
    if (/no suitable graphics adapter|unable to find a gpu/i.test(output)) {
      ctx.skip();
      return;
    }
    throw error;
  }
  const rendered = await stat(join(cwd, "short.mp4"));
  expect(rendered.size).toBeGreaterThan(0);
}

function silentShortWorld(): World {
  const art = dataUrl("image/png", realPng(64, 36));
  return makeWorld({
    shorts: [
      {
        id: "shorts::part-1",
        channelId: "shorts",
        partId: "part-1",
        title: "Arrival",
        aspect: "16:9",
        shots: [
          {
            id: "shot-1",
            imagePath: art,
            caption: "Ada arrives",
            durationSec: 4,
            motion: "push",
          },
        ],
      },
    ],
  });
}

function voicedShortWorld(): World {
  const world = silentShortWorld();
  const ada = world.characters.find((character) => character.id === "ada");
  if (ada?.lines) {
    ada.lines = [
      {
        id: "line-1",
        text: "I am here.",
        audioPath: dataUrl("audio/wav", wavBytes()),
      },
    ];
  }
  const short = world.shorts[0];
  if (short?.shots[0]) {
    short.shots[0].voice = {
      characterId: "ada",
      lineId: "line-1",
      text: "I am here.",
    };
  }
  return WorldSchema.parse(JSON.parse(JSON.stringify(world)));
}

it.skipIf(!hasRaea)(
  "renders a full file for a short with no voice lines",
  async (ctx) => {
    await renderShortMp4(silentShortWorld(), ctx, raeaVideoEdit(false));
  },
  300000,
);

it.skipIf(!hasRaea)(
  "renders a full file for a short with one voice line",
  async (ctx) => {
    const world = voicedShortWorld();
    const media = planAgentFiles(world, "shorts")
      .filter((file) => file.type === "raea-media")
      .map((file) => file.path);
    expect(media).toContain(
      "test-story-shorts/raea/part-1/media/line-01.wav",
    );
    await renderShortMp4(world, ctx, raeaVideoEdit(true));
  },
  300000,
);
