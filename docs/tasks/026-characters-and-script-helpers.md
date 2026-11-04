# Task 026: Characters layout and Script helpers

The owner tested these pages. You have no API keys and must not look for any: test with mocks. You must not deploy anything. Other tasks run at the same time and edit the landing page, the Story and onboarding pages, and the Agent package page, so **do not touch** `components/landing/*`, `components/experience/{WorldScene,ReadingScene,UnderstoodScene,ChannelsScene,CanonBook,PackDrawer}.tsx`, `lib/package.ts`, or `lib/world/schemas.ts`. Put new CSS in `app/characters.css` and `app/script.css`.

## 1. Characters: use the space

In `CastDrawer.tsx` the area to the right of the chosen character's portrait is empty. Rebuild the page layout:
- **Top:** list on the left, portrait in the middle, and to the right of the portrait a **grid of that character's sheet views** (Front, Left, Right, Back, Walking, Crouching and any extras), as many columns as fit, each with its Cut out action, and wrapping onto further rows below if they don't all fit. A view that is not made yet shows a quiet placeholder tile with its name and a "Make this view" pill.
- **Below:** "Character sheet" actions: "Generate full sheet", "Cut out all", and **"More poses"**: a row of pose chips (Sitting, Running, Fighting stance, Looking back, Arms raised, Close-up face) plus a free text box, each generating one extra view through the existing sheet-view route (check its `view` handling and extend it to accept these, keeping the same likeness anchoring, budget route and error handling). Extra views join the grid.
- **Voice and Custom voice** are two columns in one row (stacking on narrow screens).
- Keep every existing action working. Add tests for the pose list and the grid ordering.

## 2. Script helpers that actually choose

In the Script page's insert bar for the script form, "Scene heading" always inserts the same placeholder. Make each helper open a small chooser (a popover anchored to the button, keyboard accessible, closing on Escape) and insert exactly what was chosen:
- **Scene heading:** INT. or EXT.; a location chosen from the project's places or typed; a time (DAY, NIGHT, DAWN, DUSK, LATER, CONTINUOUS). Inserts e.g. `EXT. THE STREAM - NIGHT` on its own line.
- **Character:** pick from the project's characters (a cue in capitals, with an optional "(V.O.)" or "(O.S.)" toggle).
- **Dialogue:** pick the speaker, optionally a parenthetical, then it inserts the cue and a dialogue line ready to type.
- **Action:** inserts a blank action line and puts the caret there; a short list of starters is optional.
- **Mentions:** the @ mention keeps working.

For the **design** form (a game), add a helper bar of the same style, so the owner doesn't start from nothing. Each helper opens a chooser and inserts a clearly headed block under the right heading in the document (creating the heading if it is missing):
- **Game type:** Endless runner, Platformer, Top-down action, Action RPG, Strategy, Puzzle, Roguelike, Survival, Visual novel, Rhythm, Hunt and chase, Other.
- **Camera and view:** 2D side-scroll, Top-down, Isometric, Third-person 3D, First-person 3D.
- **Core mechanics** (multi-select): Movement, Jump, Dash, Melee combat, Ranged combat, Stealth, Crafting, Gathering, Dialogue choices, Puzzles, Timing, Building, Resource management.
- **Goal and ending:** Win condition, Lose condition, Session length (5 minutes, 30 minutes, 2 hours, campaign).
- **Controls:** Keyboard and mouse, Gamepad, Touch.
- **Progression:** Levels, Unlockable abilities, Story chapters, Score only.
- Each inserted block is plain text a coding agent can read, such as `Game type: Hunt and chase. The player tracks a creature through ...` using the chosen items, and the project's real names where the helper mentions the story (for example it can pre-fill "Core idea" from the part).
- Put the options in `lib/script.ts` helpers (pure functions, easy to test). Tests: heading composition, dialogue composition, the design blocks and their heading placement, no duplicate heading.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. Say what you could not check.
