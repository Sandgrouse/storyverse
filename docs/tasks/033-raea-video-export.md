# Task 033: A raea render folder in the agent package

You must not deploy anything. Touch only `lib/raea-video.ts` (new), `lib/package.ts`, `lib/video.ts`, `app/projects/[id]/video/page.tsx` (only to reuse the moved helper in part 3), `README.md` and their tests. Add no dependency to `package.json`, and add no UI.

[raea](https://raea.io) is a third-party command-line video engine with an API close to Remotion's. It renders on the creator's own GPU much faster than the browser export. **Remotion stays exactly as it is.** The player and browser export do not change, because raea has no browser encoder and runs only on some machines. This task only adds files to the download, for a creator who has raea installed.

Storyverse must not include, download or run raea, in the app or on the server. Generated files only import from it.

## 1. What goes in the package

For a non-game channel, for each short in `world.shorts` where `short.channelId === channelId` and at least one shot's image can be decoded, add this folder inside the package root:

```
raea/<partId>/README.md
raea/<partId>/edit.tsx
raea/<partId>/shots.ts
raea/<partId>/media/shot-01.webp
raea/<partId>/media/line-01.mp3
```

`channelWorld` does not filter `shorts`, so filter by channel yourself. Another channel's captions must never appear, because they can hold its secret. Game channels use `planGameFiles`, which this task does not change.

These new files go through the existing `planAgentFiles` list, so the manifest and the dashboard's file tree pick them up. Add `raea-readme`, `raea-edit`, `raea-data` and `raea-media` to `PackageFileType`, and set `part` on each file.

## 2. `lib/raea-video.ts`

A pure module with no fetch, DOM or key. It exports:

- `RAEA_VIDEO_EDIT`: the exact text of `edit.tsx` below, byte for byte. It has no backticks or backslashes, so a plain template literal holds it unchanged.
- `raeaShotsTs(shots, aspect)`: the text of `shots.ts`.
- `raeaVideoReadme(title)`: the text of `README.md`.
- `imageIsPortrait(bytes)`: true when a PNG, JPEG or WebP (VP8, VP8L and VP8X) is taller than it is wide, read from the header bytes, and false when the format or header can't be read.
- `mediaExtension(mime)`: `image/webp` gives `webp`, `image/png` gives `png`, `image/jpeg` gives `jpg`, `audio/mpeg` gives `mp3`, `audio/wav` gives `wav`, and anything else gives null.

### The `edit.tsx` every folder gets

This exact file has been rendered with raea 0.1.0-canary.2, at 16:9 and 9:16, with WebP and PNG art, crossfades and voice audio. Do not restyle or "improve" it.

```tsx
import { AbsoluteFill, Audio, Composition, Img, Sequence, interpolate, registerRoot, staticFile, useCurrentFrame } from "raea";
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
```

### The `shots.ts` shape

Write values with `JSON.stringify`, so quotes in a caption can't break the file. Set `WIDTH` and `HEIGHT` to 1280 and 720 for `16:9`, and 720 and 1280 for `9:16`. These match the browser export. Keep `as const`. Leave out `audio` when a shot has no voice line.

```ts
export const WIDTH = 1280;
export const HEIGHT = 720;
export const SHOTS = [
  { image: "shot-01.webp", caption: "Anukili \"waits\" at the river", durationSec: 4, motion: "push", portrait: false, audio: "line-01.mp3" },
  { image: "shot-02.png", caption: "Enyinyi watches", durationSec: 4, motion: "pan", portrait: true },
  { image: "shot-01.webp", caption: "They meet at dusk", durationSec: 3, motion: "still", portrait: false },
] as const;
```

### The rules for each shot

- Decode `shot.imagePath` with `dataUrlToBytes`. Leave out a shot that doesn't decode or has an unknown image type, and leave out the folder if no shots remain. List any left-out shots in the README as "Left out: shot N, the image could not be read."
- `durationSec`, `caption` and `motion` come from the shot as saved. Set `portrait` with `imageIsPortrait`.
- Reuse one media file for shots with the same `imagePath`, numbered by first use.
- Find the voice line the way the Video page does (part 3). When it decodes, write it to `media/line-NN.<ext>` and set `audio`. An `idb:` reference or an unreadable line means no `audio`, and the shot stays.

## 3. Share the voice lookup

Move `audioForShot` from `app/projects/[id]/video/page.tsx` to `lib/video.ts` as an exported function, without changing what it does, and use it from the page and from this task.

## 4. The folder's `README.md`

Use this text, with the title filled in and the "Left out" lines added when there are any:

```md
# <title>: render with raea

An optional, faster way to render this short on your own machine. The Video page in Storyverse still exports it from the browser, and you don't need this folder for that.

raea is a separate tool, and Storyverse doesn't include it. Check its site for the machines it runs on, and its licence if you plan to offer rendering to other people: https://raea.io

    curl -fsSL https://raea.io/install | sh
    raea render edit.tsx -o short.mp4 --quality high

Change the cut in `shots.ts`. Art and voice lines are in `media/`.
```

## 5. Repo `README.md`

- Add one sentence about this folder to the agent package section.
- In **Third-party software**, add: raea is optional, is installed separately by the creator, is not bundled, and is source-available under its own licence (FSL-1.1-ALv2).

## Tests

In a new `tests/raea-video.test.ts`:
- `imageIsPortrait` for each format, tall and wide, plus unreadable bytes.
- A caption holding quotes, backslashes and a line break still gives valid `shots.ts` values, by parsing the JSON back.
- The folder appears for the right channel only. Another channel's short and its caption marker are absent from every file.
- A short with no decodable image gives no folder. A short with one bad shot keeps the others and notes the left-out one.
- Shots sharing art share one media file.
- `RAEA_VIDEO_EDIT` imports from `raea` and never from `remotion`.

Add a render test, skipped when `raea` is not on the PATH: write a folder to a temp directory with a small generated PNG, run `raea render edit.tsx -o frame.png --frame 0` with `execFile`, and expect an exit code of 0 and a non-empty file. Say in your final message whether it ran or was skipped.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. `pnpm typecheck` must not pick up generated text as source, because the templates are strings. Commit on the current branch. Say honestly what you could not check.
