# Task 036: raea folders work for shorts with no voice lines

This continues Task 035's branch. You must not deploy anything. Touch only `lib/raea-video.ts`, `lib/package.ts`, and `tests/raea-video.test.ts`.

## The bug

Reproduced with a real export of the Anukili sample. For a short where no shot has a voice line, `raea render edit.tsx -o short.mp4` fails, and no file is written:

> the edit has <Audio> but no sound reached the render, so the file would be silent

raea refuses because `edit.tsx` contains `<Audio>` even though it never plays. Rendering a single frame still works, which is why the existing test missed this.

## The fix

The `<Audio>` line must only be in `edit.tsx` when at least one shot in that short has audio.

In `lib/raea-video.ts`:
- Keep the template text byte for byte. Replace the exported constant with `raeaVideoEdit(hasAudio: boolean): string`.
- `raeaVideoEdit(true)` returns the existing text exactly.
- `raeaVideoEdit(false)` returns the same text with this whole line removed, and nothing else changed:

```
      {"audio" in shot && shot.audio ? <Audio src={staticFile(shot.audio)} /> : null}
```

The import line stays as it is. I rendered both versions with raea 0.1.0-canary.2: with no voice lines, without the line, gives a video with no audio track; with a voice line, with the line, gives a video with one.

In `lib/package.ts`, `planRaeaFiles` calls `raeaVideoEdit(shots.some((shot) => shot.audio !== undefined))`, using the shots it actually kept. A voice line that could not be decoded therefore does not count.

## Tests

In `tests/raea-video.test.ts`:
- `raeaVideoEdit(false)` has no `<Audio`, and `raeaVideoEdit(true)` has exactly one.
- The two differ only by that one line.
- A short with no voice lines plans an `edit.tsx` with no `<Audio`. A short with one voice line plans one with `<Audio`. A short whose only voice line can't be decoded plans one with no `<Audio`.

Change the raea render test, still skipped when `raea` is not on the PATH, so it renders a full file for a short with no voice lines: `raea render edit.tsx -o short.mp4 --quality draft`. Expect exit code 0 and a non-empty `short.mp4`. Add the same full render for a short with one voice line only if you can build a valid short audio file in the test without adding a binary fixture; otherwise leave it out and say so. Give these tests a long enough timeout. Say in your final message whether they ran or were skipped.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. Say honestly what you could not check.
