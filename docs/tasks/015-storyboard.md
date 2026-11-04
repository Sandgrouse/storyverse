# Task 015: Storyboard

The owner approved this feature. A storyboard turns one scene of the script into a row of shots, each with a pencil sketch, so the owner can see a scene before making it. You have no API keys and must not look for any: test with mocks. You must not deploy anything. Put all new CSS in a new file `app/storyboard.css`, imported by the page. Another task is changing the landing page at the same time, so do not touch `components/landing/*`, `lib/landing.ts` or `app/page.tsx`.

Follow the Script page (`app/projects/[id]/script/page.tsx`, `app/script.css`) for layout, spacing, type, buttons and error handling. Add no new visual language.

## 1. Page and navigation

New page `app/projects/[id]/storyboard/page.tsx`, with optional `?channel=&part=` like the Script page. Add "Storyboard" to the top bar between Script and Video. Back goes to `[id]/script` (update `lib/nav.ts` and its test). On the Script page, add a pill "Make a storyboard" beside "Turn this into a short", going to this page for the selected scene.

## 2. Data

Add to `WorldSchema`, with `.default([])`:

`storyboards: [{ id, channelId, partId, title, frames: [{ id, imagePath?, framing: "wide" | "medium" | "close" | "over-shoulder" | "overhead", action, dialogue?, camera?, characterIds: string[] }] }]`

One storyboard per channel and part. Persist through `updateWorld`. Sketch images go through the same image store as scene art: extend `extractImageEntries`, `restoreImageRefs`, `dropStoredRefs` and `stripImageData`, with tests. `mergeWorldAssets` keeps storyboards.

## 3. Planning

`POST /api/storyboard/plan` `{ world, channelId, partId }`, with `maxDuration = 60`, the 4.5MB limit, zod validation, and images stripped. Add budget route `storyboard-plan`, 2 cents, to `lib/budget.ts`. Muse Spark uses the scene's script if there is one, otherwise the beats. Structured output (every property in `required`, optional ones nullable) returns 4 to 8 frames: `framing`, `action` of at most 160 characters, `dialogue` of at most 120 characters or null, `camera` of at most 80 characters or null, and `characterIds` chosen only from the characters in the scene.
- Reject any characterId not in the world, and drop it.
- Channel knowledge rule as in the script task: only this channel's secrets are in the prompt, and a secret belonging to another channel must not appear in any frame. Add a test.
- Real names and details only, never renamed.

## 4. Sketches

Extend `POST /api/art/scene` with an optional `style: "sketch"`. With it, the prompt uses a sketch suffix instead of the scene suffix: loose pencil storyboard drawing, black and grey, no colour, simple shading, clear composition, the named framing, no text. Character references (sheet views) still travel, up to three, so likeness holds. The cost stays 2 cents. Add a test for the prompt.

## 5. The page

- **Header row:** scene picker as on the Script page, then the pill "Plan the storyboard with Muse". With no storyboard yet, the page shows an empty state with that pill as its main action: "No storyboard for this scene yet."
- **Frames:** a grid of 16:9 frames, three across on wide screens, two on tablets, one on phones. Each frame shows its number, the sketch (or a quiet placeholder "Not sketched yet" with a pill "Sketch this frame"), a framing select, and editable text boxes for action, dialogue and camera note. Edits save as you type, as elsewhere.
- **Frame controls:** "Redraw sketch", "Remove", and HTML5 drag to reorder, with the same hover lift as the Video timeline. A final dashed tile "+ Add a frame".
- **Sketch all:** a pill that sketches the unsketched frames one at a time, with "Sketching 3 of 6…" and Cancel. Stop on a budget or failure message and show it where the action was.
- **Replan:** replanning a storyboard that has edits confirms first: "Replace this storyboard?" with "Replace it" and "Keep mine".
- **Print:** "Print or save as PDF" calls `window.print()`. Add a print stylesheet that hides the top bar and controls and shows two frames per row, each with number, sketch, action and dialogue, on white.
- Budget and failure messages appear where the action was. Nothing gets stuck.

## 6. Agent package

For each included scene with a storyboard, add `scenes/<part-id>/storyboard.json` (frames in order, text only) and the sketches as `scenes/<part-id>/storyboard/<frame-id>.webp`. Respect the channel rule: include only storyboards for scenes of included channels. Show them in the package's file tree. Update the package tests.

## 7. README

Add one line under "How each model is used": Muse Spark plans the storyboard and Muse Image draws the sketches.

## Tests

Cover plan validation, a characterId not in the world, the knowledge rule, the sketch prompt, ordering on reorder, image refs for sketches, and the package files.

You can't run a server in your sandbox, so say what you could not check.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
