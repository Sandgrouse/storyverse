# Task 029: Consistent storyboard sketches and video from the storyboard

You must not deploy anything.

## 1. Every storyboard frame is a black-and-white sketch

The owner generated a board; most frames came back as pencil sketches but one came back in colour. The model sometimes ignores the "no colour" line because the character references are in colour. Make the result deterministic:
- Strengthen `SKETCH_SUFFIX` in `lib/art.ts` (name the medium first: "Black and white pencil storyboard frame, graphite on paper, no colour at all") and say the references are for likeness only, to be drawn as pencil.
- After each sketch image comes back, convert it to greyscale in the browser (canvas, luminance, keep a light paper tone is optional) before saving it to the frame. Put the conversion in a small pure helper with a test (a coloured pixel buffer becomes equal R, G and B). Apply it in both "Sketch all" and single-frame sketch in `app/projects/[id]/storyboard/page.tsx`, and when a sketch is redrawn.
- Frames already saved in colour: add a small "Make all frames black and white" action on the storyboard page that converts saved frames in place.
- Likeness: keep the same character references on every frame of a board, in the same order, so the same character looks the same. Say in the prompt to keep each character's face, build and clothing as in the reference.

## 2. "Make a video" must use the storyboard

On the Video page, when the chosen scene has a storyboard, the video was a default cut of random card images, not the board. The plan currently only gets the storyboard as text and the art list is the project's existing art (`lib/video.ts`, `videoPlanInput`, `availableArtPaths`). Change:
- When a storyboard with at least one sketched frame exists for the channel and part, build the shots **directly from the frames, in order**, with no model call needed to choose pictures: one shot per frame using that frame's `imagePath`, duration from the frame's text length (3 to 6 seconds), caption from the frame's `action`, and the frame's `dialogue` as the spoken line when voices are on. Keep the existing slow push-in and Remotion player.
- Frames without a picture are skipped, and the page says how many frames were used ("6 of 6 frames").
- Add a clear choice at the top of the Video page: "Cut from the storyboard" (default when a board exists) or "Cut from my story's art" (the existing behaviour).
- When there is no board, keep the old flow and say in one line that a storyboard gives a better cut, with a link to the Storyboard page.
- Put the frame-to-shot mapping in `lib/video.ts` as a pure function with tests (order, skipped frames, durations, captions, voice line).

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. Say honestly what you could not check, including anything needing the live image model.
