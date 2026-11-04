# Task 013 review fixes, round 2

You are on the branch for the video maker. Planning and both export shapes now work. Make only these fixes.

1. **Tall player overflows.** With "Tall 9:16" selected, the player is taller than its area and covers the transport and the timeline. The player must fit the available height in both shapes: size it from the stage's height, keep its aspect ratio, and keep the play button and timeline fully visible. Check at 1440×900 and 1280×720.

2. **Heads get cropped.** Portrait art in a wide shot is centred, so a character's head is cut off, showing only the torso. In `StoryShort`, when a portrait image is shown in 16:9, use `object-position: 50% 12%`. Decide by loading the image's size or by storing a per-shot `focus` from the art's known shape. Keep 9:16 centred. Keep it to CSS the web renderer supports, and apply the same in the player and the export.

3. **Fewer shots than asked.** The real plan returned 3 shots. In the plan prompt, say plainly "Return at least 4 shots" and, when fewer than 4 come back, keep them but show nothing alarming. Do not fail.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
