# Task 031: Batch sketching keeps every frame, and the Video page toggles line up

You must not deploy anything. Touch only `app/projects/[id]/storyboard/page.tsx`, `lib/storyboard.ts`, `app/video.css`, `README.md` and their tests.

## 1. "Sketch the missing frames" keeps only the last sketch

Reproduced by the owner: with several frames missing a sketch, **Sketch the missing frames** draws every frame, but only the last sketch stays. Sketching frames one by one works.

Cause: `patchFrame` in `app/projects/[id]/storyboard/page.tsx` (around line 170) builds its update from `board`, the value captured when the page last rendered. `runSketchAll` calls it from inside one long async loop, so each save starts from the old board and overwrites the sketch saved before it. `runGreyAll` uses the same save path, so **Make all frames black and white** has the same bug.

Fix:
- Add a pure `patchStoryboardFrame(board, frameId, patch)` to `lib/storyboard.ts` and use it in `patchFrame`.
- In `patchFrame`, start from the live board: `storyboardForScene(worldRef.current, channelId, partId)`. Use `board ?? ensureBoard()` only when there is no live board.
- In `saveBoard`, set `worldRef.current` to the upserted world straight after calling `updateWorld`, so a second save in the same tick also sees the first.

Tests: `patchStoryboardFrame` changes only the named frame, and applying patches to two frames one after the other keeps both. If the page's save logic can be tested without a browser, also test that two saves in a row keep both patches.

Check the rest of the page: the frame's text fields also call `patchFrame`. A field edit made while a batch runs must not be lost.

## 2. Toggle labels sit below their track

On the Video page, the **Cut source**, **Motion** and **Shape** toggles have labels that sit below the pill behind them.

Cause: `.seg` is also a class in `app/globals.css` (around line 945) for the world view's timeline. It sets `height: 13px` and draws a line with `.seg::before`. `.video-page .seg` in `app/video.css` inherits both.

Fix it in `app/video.css` only, under `.video-page`: set `height: auto` on the toggle and turn off the `::before` line. Do not rename or change the global `.seg`, because `components/experience/WorldScene.tsx` uses it.

## 3. README

In `README.md`, remove the "Sketch the missing frames" and "Toggle labels" lines from **Known issues**. Leave the roadmap's "Fix batch sketching and the other known issues" line in place, because other known issues remain.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. Say honestly what you could not check, including anything you could not see in a browser.
