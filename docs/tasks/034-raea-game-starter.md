# Task 034: A raea starter in the game package

This builds on Task 033, so run it on a branch that already has that work. You must not deploy anything. Touch only `lib/raea-game.ts` (new), `lib/package.ts`, `README.md` and their tests. Add no dependency to `package.json`, and add no UI.

The game package targets Godot 4 and stays that way. This adds an optional `raea/` folder holding a small starter the creator can play straight away: their real character walking through their real scenes. It is a starting point, not a finished game. It only imports from raea. Storyverse must not include, download or run raea.

## 1. What goes in the package

In `planGameFiles`, when the channel covers at least one part, add this folder at the package root:

```
raea/README.md
raea/edit.tsx
raea/story.ts
raea/media/hero.<ext>
raea/media/scene-01.<ext>
```

Use the `raea-*` file types from Task 033, and add `raea-game` if you need one more.

## 2. `lib/raea-game.ts`

A pure module with no fetch, DOM or key. It exports:

- `RAEA_GAME_EDIT`: the exact text of `edit.tsx` below, byte for byte.
- `raeaStoryTs(title, hero, scenes)`: the text of `story.ts`.
- `raeaGameReadme(title)`: the text of `README.md`.

### The `edit.tsx`

This exact file has been rendered and played headless with raea 0.1.0-canary.2, with scripted key input, WebP and PNG art, and a scene with no art. Do not restyle or "improve" it.

```tsx
import { Composition, Img, registerRoot, staticFile, useGameState } from "raea";
import type { Playtest } from "raea";
import { Arena, Banner, Hint } from "raea/arena";
import { HERO, SCENES, TITLE } from "./story";

// A starter, not the game. It proves the art loads and the keys answer.
// Build the real game from design/ on top of this file.
const WIDTH = 1600;
const HEIGHT = 900;
const SPEED = 8;
const HERO_WIDTH = 220;
const HERO_HEIGHT = 380;

type State = { scene: number; x: number; done: boolean };
const initial: State = { scene: 0, x: 100, done: false };

function step(state: State, input: { keys?: string[] }): State {
  if (state.done) return state;
  const keys = input.keys ?? [];
  // No key down: walk on alone, so a render shows the whole story.
  const dx = keys.length === 0 ? SPEED : (keys.includes("ArrowRight") ? SPEED : 0) - (keys.includes("ArrowLeft") ? SPEED : 0);
  const x = Math.max(0, state.x + dx);
  if (x < WIDTH - HERO_WIDTH) return { ...state, x };
  if (state.scene + 1 < SCENES.length) return { ...state, scene: state.scene + 1, x: 0 };
  return { ...state, x: WIDTH - HERO_WIDTH, done: true };
}

export const playtest = {
  initial,
  step,
  actions: [[], ["ArrowRight"], ["ArrowLeft"]],
  observe: (state: State) => ({ scene: state.scene, x: state.x }),
  progress: (state: State) => (state.scene + state.x / WIDTH) / SCENES.length,
  outcome: (state: State) => (state.done ? "won" : null),
} as unknown as Playtest<State>;

function Game() {
  const game = useGameState(initial, step);
  const scene = SCENES[game.scene];
  const banner = game.done ? <Banner text={TITLE} sub="End of the starter" /> : game.x < 200 ? <Banner text={scene?.title ?? ""} /> : null;
  return (
    <Arena width={WIDTH} height={HEIGHT} banner={banner} hint={<Hint keys={[{ keys: "← →", does: "walk" }]} />}>
      {scene?.art ? <Img src={staticFile(scene.art)} style={{ position: "absolute", left: 0, top: 0, width: WIDTH, height: HEIGHT, objectFit: "cover" }} /> : null}
      {HERO ? (
        <Img src={staticFile(HERO)} style={{ position: "absolute", left: game.x, top: HEIGHT - HERO_HEIGHT - 40, width: HERO_WIDTH, height: HERO_HEIGHT, objectFit: "contain" }} />
      ) : (
        <div style={{ position: "absolute", left: game.x, top: HEIGHT - HERO_HEIGHT - 40, width: HERO_WIDTH, height: HERO_HEIGHT, background: "#c9502e" }} />
      )}
    </Arena>
  );
}

registerRoot(() => <Composition id="game" component={Game} width={1920} height={1080} fps={60} durationInFrames={1800} />);
```

### The `story.ts` shape

Write values with `JSON.stringify`, so quotes in a title can't break the file. Keep the type casts, because they let `null` and a string share a field.

```ts
export const TITLE = "The hunt";
export const HERO = "hero.png" as string | null;
export const SCENES = [
  { title: "The Stream", art: "scene-01.webp" as string | null },
  { title: "The Pots", art: "scene-02.png" as string | null },
  { title: "The Fire", art: null as string | null },
];
```

### Where the values come from

- `TITLE`: the channel's title, then its name, then its id, the same order the game docs use.
- `SCENES`: the parts this channel covers, in `order`, using `part.title`. `art` is the part's image, decoded and written to `media/scene-NN.<ext>`, or null when it has none.
- `HERO`: from the first character in `filtered.characters` that has any usable image. Prefer a cut-out over a sheet image, and the `front` view over other views. Null when no character has one. The starter then draws a plain block.
- Use `mediaExtension` from `lib/raea-video.ts`. Leave out an image of an unknown type, as if it had not been made.

Only use the `filtered` channel world for text. A part this channel doesn't cover must not appear in any `raea/` file, and no channel secret goes in any `raea/` file. The starter has no secret text at all.

## 3. The folder's `README.md`

Use this text, with the title filled in:

```md
# <title>: raea starter

An optional starter for building this game in raea instead of Godot. Your character walks through your scenes with the left and right arrow keys. With no key down, the character walks alone.

raea is a separate tool, and Storyverse doesn't include it. Check its site for the machines it runs on, and its licence if you plan to offer it to other people as a service: https://raea.io

    curl -fsSL https://raea.io/install | sh
    raea play edit.tsx

To build the real game, start from this file and the rest of the package's `design/` folder. `raea guide games` explains how raea games are structured.
```

## 4. The package's own docs

- `gameAgentsMd`: add one line after the "Work from" line: "`raea/` holds an optional starter for the raea engine. Use it only if the owner asks to build in raea; otherwise build in Godot 4." Add it only when the folder is in the package.
- `gameReadmeMd`: add one sentence pointing to `raea/README.md`, under the same condition.
- Do not change `project.yaml`, the engine lines or `scripts/setup-studio.sh`. Godot stays the default.

## 5. Repo `README.md`

Add one sentence about the starter to the game package paragraph. In **Roadmap**, do not tick anything.

## Tests

In a new `tests/raea-game.test.ts`:
- The folder appears for a game channel that covers a part, and not for one covering none.
- Scene order follows `order`, and an uncovered part's title and image are absent.
- A scene with no art gives `art: null`, and no character art gives `HERO` null.
- A cut-out beats a sheet image, and `front` beats other views.
- A title holding quotes still parses back from the JSON values.
- `RAEA_GAME_EDIT` imports from `raea` and never from `remotion`.
- No `raea/` file holds the channel's secret marker or another channel's.
- `AGENTS.md` and `README.md` mention `raea/` only when the folder is there.

Add a render test, skipped when `raea` is not on the PATH: write the folder to a temp directory, run `raea render edit.tsx -o frame.png --frame 0` with `execFile`, and expect an exit code of 0 and a non-empty file. Say in your final message whether it ran or was skipped.

Do not call `raea export-game`. It needs a player built from raea's source, which the normal install doesn't include.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. Say honestly what you could not check.
