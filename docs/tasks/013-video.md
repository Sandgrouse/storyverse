# Task 013: Short video maker

The owner approved this design. Follow the Video view of `docs/design/studio.html`: layout, copy, hover and timeline. You have no API keys and must not look for any: test with mocks. You must not deploy anything. Put new CSS in `app/video.css`, imported by the page.

## 1. Libraries

Add `remotion`, `@remotion/player`, `@remotion/media` and `@remotion/web-renderer`, all at exactly the same version, `4.0.540`. In the README's third-party section, say Remotion is used under its free license for individuals and companies of up to three employees, and link https://www.remotion.dev/docs/license.

## 2. Page and navigation

New page `app/projects/[id]/video/page.tsx`, with optional `?channel=&part=`. Add "Video" to the top bar, between Script and Agent package. Back goes to `[id]/script`. On the Script page, add the design's "Turn this into a short" pill, going to this page for the selected scene.

## 3. Data

Add to `WorldSchema`, with `.default([])`: `shorts: [{ id, channelId, partId, title, aspect: "16:9" | "9:16", shots: [{ id, imagePath, caption, durationSec, motion: "push" | "pan" | "still", voice?: { characterId, lineId, text } }] }]`. There is one short per channel and part. Persist through `updateWorld`. Generated shot images go through the same image store as scene art: extend `extractImageEntries`, `restoreImageRefs`, `dropStoredRefs` and `stripImageData`, with tests. `mergeWorldAssets` keeps shorts.

## 4. Planning

`POST /api/video/plan` `{ world, channelId, partId }`, with `maxDuration = 60`, limits, validation, and images stripped. Budget route `video-plan`, 1 cent. Muse Spark uses the scene's script if there is one, otherwise the beats. It returns 4 to 6 shots: an image chosen from the list of available art, a caption under 90 characters, a duration of 3 to 7 seconds, a motion, and optionally `{ characterId, text }` for a spoken line.
- Reject any image not in the list, and fall back to the part's own art.
- Channel knowledge rule as in the script task: only this channel's secrets are in the prompt. Add a test.
- Real names only.

With no short yet, the page shows the empty timeline and "Plan shots with Muse" as its main action. Replanning an edited short confirms first: "Replace this cut?" with "Replace it" and "Keep my cut".

## 5. The composition

`components/video/StoryShort.tsx`, a Remotion component at 30 fps, 1280×720 or 720×1280:
- One `Sequence` per shot, using `Img` from `remotion`.
- Motion through `interpolate` on `transform`: push scales from 1 to 1.09, pan translates slightly at a fixed 1.09 scale, still does neither.
- 12-frame crossfade between shots.
- Caption at the bottom on a dark gradient, in the serif font, as in the design. Keep to the CSS the web renderer supports. Use plain positioned elements.
- `Audio` from `@remotion/media` for a shot's voice line, if it has audio.

## 6. The editor

- **Player:** `@remotion/player` with controls hidden, and the design's play button and time. Seek by clicking a shot. Changing aspect resizes the player.
- **Timeline:** shots sized by duration, voice line strip under each, the hover lift from the design, HTML5 drag to reorder, and a "+" that opens a picker of the project's art for adding a shot.
- **Right panel for the selected shot:** caption, voice line select, length slider of 2 to 12 seconds, motion buttons, "Redraw this shot" through `/api/art/scene`, and "Remove". Below that: shape buttons and "Export video". Everything updates the player live and saves.
- **Voice line select:** lists the character's saved lines plus "No voice". If the plan suggested a line with no audio, show its text with a pill "Speak this line", which uses `/api/voice/speak` with the character's voice and saves it to `character.lines`. If the character has no voice: "Choose a voice in Characters first," linking there. Respect the voice routes' error messages.

## 7. Export

"Export video" calls `renderMediaOnWeb` from `@remotion/web-renderer`, with the same component and `inputProps`, in `mp4`/`h264`. If the browser can't encode that, try `webm`/`vp8`. Show progress: "Making your video… 40%", with a Cancel button using an `AbortSignal`. On success, download `<project-slug>-<short-title>.<ext>`. On failure: "This browser couldn't make the file. Try Chrome on a computer." Stay on the page with nothing lost. Export happens only in the browser, with no server call.

## Tests

Cover plan validation and art fallback, the knowledge rule, duration totals to frames, ordering on reorder, and image refs for shots.

You can't run a server in your sandbox, so say what you could not check, including export.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
