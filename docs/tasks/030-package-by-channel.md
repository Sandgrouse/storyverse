# Task 030: The agent package changes with the channel

You must not deploy anything. Touch the Agent package page (`app/projects/[id]/package`, `components/package/*`, `lib/package.ts`, `lib/readiness.ts`) and their tests.

The owner clicked between Series, Game and Shorts. The numbers at the top ("4 Characters, 5 Scenes, 0 Scripts, 0 Storyboards, 0 Videos, Secrets") never change, and the Game tab shows a story map but nothing about the game. A game does not need storyboards or video. Make the page contextual to the selected channel's kind.

## 1. Stats follow the channel kind

Compute the stat tiles for the selected channel only:
- **series / shorts / film**: Characters, Scenes told in this channel, Scripts written (this channel), Storyboards, Videos, Scene art, Secrets kept apart.
- **game**: Characters, Places, Game design (how many of the six design sections are filled: Game type, Camera and view, Core mechanics, Goal and ending, Controls, Progression), Character art ready, Secrets kept apart. No storyboards or videos tiles.
- **website / press / ad / other**: Characters, Scenes told, Copy written, Scene art, Secrets kept apart.
Put the tile list for each kind in `lib/package.ts` as a pure function with tests per kind.

## 2. The Game tab says what the game is

Above the map, for a game channel, show a "The game" card built from the project:
- The channel's title and pitch.
- The six design sections from the saved design entries (`ScriptEntry.form === "design"`), each shown as a short text or "Not decided yet" with a link to the Script page for that channel.
- Visual style (from the project's visual style) and the characters that play.
- A short line: "Your coding agent builds this game with the studio files in the download." and the existing download button.
For series, shorts and others show the equivalent card: channel title, pitch, number of scenes, the secret this channel holds.

## 3. Readiness follows the kind

`lib/readiness.ts` must not list storyboards or video as missing for a game channel. Check the Readiness view and the exported README/AGENTS files in the ZIP agree with that (a game package has no "storyboards" or "videos" folders unless the owner made some).

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. Say honestly what you could not check.
