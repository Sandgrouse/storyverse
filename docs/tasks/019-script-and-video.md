# Task 019: Script and Video revisions

The owner tested the Script and Video pages and wants them to work for any story, not just one with a series, a game and shorts. You have no API keys and must not look for any: test with mocks. You must not deploy anything. Other tasks run at the same time, so **do not touch** `components/experience/*`, `lib/package.ts`, `app/projects/[id]/reading`, `app/projects/[id]/canon` or `lib/world/schemas.ts` beyond the two edits named below. Put new CSS in the existing `app/script.css` and `app/video.css`.

Schema edits you may make: extend `ChannelKindSchema` to `["game", "series", "shorts", "press", "film", "website", "ad", "other"]` in exactly that order (another task makes the same edit), and add `form: z.enum(["script", "design", "copy"]).default("script")` to `ScriptEntrySchema`.

## 1. The form of each channel

Add `formForKind(kind)` to `lib/script.ts`: series, shorts, film, ad and other give "script"; game gives "design"; website and press give "copy". The Script page's left list is built from the world's channels and parts, and shows the channel's own name as its heading, never a hard-coded "Series", "Game" or "Shorts". A part's row label uses its beat's `unitLabel`.

- **script:** works as now.
- **design:** a game design document. Drafting writes plain text with these headings in order: "Core idea", "What the player wants", "What the player does", "Levels and places", "Characters in play", "How the story is told", "What this game keeps secret", "Notes for building it in Godot". It uses only the canon and this channel's secret. A game does not get screenplay formatting, character cues or scene headings, and "Check against canon" still works.
- **copy:** page copy for a website or a press piece: headline, intro, sections, call to action.

`POST /api/script/draft` takes the form (derived server-side from the channel kind, not trusted from the client) and swaps the system prompt, keeping the channel knowledge rule and a test for it. The rewrite and check routes work for all forms. Add `form` to the saved entry.

## 2. Actions follow the form

Replace "Turn this into a short" with buttons that depend on the form, keeping the existing pill style:
- **script:** "Make a storyboard" (to `/projects/[id]/storyboard?channel=&part=`) and "Make a video" (to `/projects/[id]/video?channel=&part=`).
- **design:** "Open the agent package" (to `/projects/[id]/package`).
- **copy:** none.

## 3. A richer editor

Keep the textarea and its highlight overlay, and add:
- **@ mentions:** typing "@" opens a small menu at the caret listing the world's characters and places, filtered as you type; arrow keys and Enter, or a click, insert the exact name (uppercase for a character cue in script form), and Escape closes it. The inserted name gets the same highlight as other names.
- **A small insert bar** above the editor, for the script form only: Scene heading, Character, Action, Dialogue. Each inserts a correctly formatted line at the caret.
- Keyboard accessible, no new libraries.

## 4. Video: choose the scene

On the Video page add the same left list as the Script and Storyboard pages (channels and parts), so the owner chooses which scene to cut. The URL keeps `?channel=&part=`. The empty state is "No shots yet" with one "Plan shots with Muse" pill (remove the duplicate) and a quiet placeholder where the player will be, never a black box. If a storyboard exists for that scene, `POST /api/video/plan` receives its frames' text (framing, action, dialogue) and Muse uses them as guidance; add a test that the knowledge rule still holds.

## Tests

Cover `formForKind`, the design-form draft prompt (headings, no other channel's secret), the mention filter and insertion, the insert bar formatting, the Video list and the storyboard guidance.

You can't run a server in your sandbox, so say what you could not check.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
