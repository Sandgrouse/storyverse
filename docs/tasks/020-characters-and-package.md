# Task 020: Characters and the Agent package

The owner tested these two sections. You have no API keys and must not look for any: test with mocks. You must not deploy anything. Other tasks run at the same time, so **do not touch** `app/projects/[id]/script`, `app/projects/[id]/video`, `lib/script.ts`, `lib/video.ts`, `components/experience/ReadingScene.tsx`, `UnderstoodScene.tsx`, `ChannelsScene.tsx`, `StoryPackDrawer.tsx`, or `lib/world/schemas.ts` except to extend `ChannelKindSchema` to `["game", "series", "shorts", "press", "film", "website", "ad", "other"]` in exactly that order (another task makes the same edit). Put new CSS in `app/characters.css` and `app/package.css`.

## 1. Characters: one at a time

Today the page shows every character's art in a row at the top whichever character is chosen, and a row of name pills that won't scale. Rebuild `components/experience/CastDrawer.tsx`:
- **Left list:** every character with a small portrait and name, scrollable, with a search box once there are more than 8. The chosen one is highlighted. It works with 30 characters.
- **Right:** only the chosen character: name, one large art image, canon text, "Appears in" as separate chips (one per scene, each a link to the Script page for it), the character sheet and its views, cutouts and the voice section. Nothing from other characters is shown.
- The selection is in the URL as `?c=<character-id>`, defaults to the first, and survives reload. Other pages link to it.
- Keep every existing action (generate sheet, cut out, voices, lines, custom voices) working. Narrow screens: the list becomes a select.

## 2. Agent package: a dashboard, not a list of files

Rebuild `components/experience/PackDrawer.tsx`:
- **Summary tiles** at the top: Characters (how many, how many have a full sheet, how many have a voice), Scenes, Scripts written, Storyboards, Scene art, Videos, and Secrets kept apart. Each shows a number and a small progress bar.
- **Per-channel readiness:** one card per channel with a bar of what is made and what isn't, and a list "Not made yet" where each item links to the page that makes it (Characters, Script, Storyboard, Video, the art on the Story page).
- **The files** sit behind a "See the files" fold, as a collapsible folder tree with file sizes, not raw text.
- **Export package** stays, with the channel chips.
- **"34 expected files are missing":** find why `lib/package.ts` reports this and fix the cause. An item the owner hasn't made yet is not a missing file: report it in the "Not made yet" list, never as a warning line. Add a test for it.
- The channel rule stays: each package holds only that channel's secret.

## 3. Game packages follow the game studio layout

When the chosen channel's kind is `game`, the exported ZIP is laid out like the open-source "Claude Code Game Studios" template (https://github.com/Donchitos/Claude-Code-Game-Studios, MIT license), with Claude replaced by Muse: `CLAUDE.md` becomes `AGENTS.md` and `.claude/` becomes `.agents/`. The ZIP contains, at its root:
- `AGENTS.md`: the project rules for Muse Code: the game's name, "Engine: Godot 4", "Language: GDScript", the secret rule (this game may know only its own secret), real names only, and a pointer to `design/`, `docs/` and `production/`.
- `project.yaml`: `schema_version: 1`, `engine: godot`, the project name, and the channel.
- `README.md`: what this package is and how to open it (step 1 below).
- `design/`: `design/gdd/game-concept.md` (the saved game-design script entry for the channel if there is one, otherwise a concept built from the canon), `design/narrative/story.md` (the story as parts), `design/characters/<id>.md` (canon text, voice, lines), `design/art-bible.md` (the art direction: the palette and style notes from the project's art, with the character sheets and scene art listed), `design/registry/entities.yaml` (characters and places).
- `docs/`: `docs/story/` (scene briefs and scripts as now), `docs/engine-reference/godot/README.md` pointing at the template's reference.
- `production/`: `production/stage.md` saying "Concept" and listing what is made and not made yet.
- `src/.gitkeep`
- `assets/`: sheet views, cutouts, scene art, storyboard sketches and voice lines, as today under their existing paths.
- `.agents/README.md`: explains that the studio's agents and skills install through `scripts/setup-studio.sh`.
- `scripts/setup-studio.sh`: clones the template into a temp folder, copies its `.claude/` into `.agents/`, its other files into the project without overwriting the files above, renames `CLAUDE.md` to `AGENTS.md` wherever they exist, and replaces "Claude Code" with "Muse Code" and "Claude" with "Muse" in the copied text files only (never in `LICENSE`). Mark the file executable in the ZIP. It must `set -euo pipefail`, refuse to run unless git is installed, and print what it did.
- `STUDIO-NOTICE.md`: credits the template, links it, states its MIT license, and includes the template's copyright notice and license text as a placeholder line "See LICENSE in the template, copied by setup-studio.sh". It also says plainly that the renamed agents and skills have not been tested with Muse Code.

Other kinds keep their current package layout. The channel secret rule applies to all of it. Show these files in the dashboard's tree. On the game channel's tab, a quiet note: "A game agent that builds this in Godot is coming next. For now, hand this package to Muse Code."

## Tests

Cover the dashboard counts, "not made yet" items, the missing-files fix, the `?c=` selection, the list search, the game layout's file paths and contents (the secret rule, AGENTS.md instead of CLAUDE.md, no other channel's secret), and the executable bit.

You can't run a server in your sandbox, so say what you could not check.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
