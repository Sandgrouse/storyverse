/**
 * raea starter for the game package. Pure: no fetch, DOM or key.
 * Storyverse never includes, downloads or runs raea; the files built
 * here only import from it, for a creator who has it installed.
 * Godot 4 stays the default: this folder is an optional extra.
 */

/**
 * The exact text of the starter's `edit.tsx`. This file has been
 * rendered and played headless with raea 0.1.0-canary.2, with
 * scripted key input, WebP and PNG art, and a scene with no art.
 * Do not restyle it.
 */
export const RAEA_GAME_EDIT = `import { Composition, Img, registerRoot, staticFile, useGameState } from "raea";
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
`;

/** One scene's row in the generated `story.ts`. */
export type RaeaGameScene = {
  title: string;
  art: string | null;
};

/**
 * The text of the starter's `story.ts`. Values go through
 * JSON.stringify, so quotes in a title can't break the file. The
 * casts let `null` and a string share a field.
 */
export function raeaStoryTs(
  title: string,
  hero: string | null,
  scenes: RaeaGameScene[],
): string {
  const rows = scenes.map(
    (scene) =>
      `  { title: ${JSON.stringify(scene.title)}, art: ${JSON.stringify(scene.art)} as string | null },`,
  );
  return `export const TITLE = ${JSON.stringify(title)};\nexport const HERO = ${JSON.stringify(hero)} as string | null;\nexport const SCENES = [\n${rows.join("\n")}\n];\n`;
}

/**
 * The text of the starter's `README.md`, with the title filled in.
 */
export function raeaGameReadme(title: string): string {
  return [
    `# ${title}: raea starter`,
    ``,
    `An optional starter for building this game in raea instead of Godot. Your character walks through your scenes with the left and right arrow keys. With no key down, the character walks alone.`,
    ``,
    `raea is a separate tool, and Storyverse doesn't include it. Check its site for the machines it runs on, and its licence if you plan to offer it to other people as a service: https://raea.io`,
    ``,
    `    curl -fsSL https://raea.io/install | sh`,
    `    raea play edit.tsx`,
    ``,
    `To build the real game, start from this file and the rest of the package's \`design/\` folder. \`raea guide games\` explains how raea games are structured.`,
    ``,
  ].join("\n");
}
