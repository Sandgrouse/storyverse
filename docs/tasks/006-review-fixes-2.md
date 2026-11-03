# Task 006 review fixes, round 2

You are on the branch for pull request 6. I ran the Characters drawer in a real browser. Make only these fixes.

1. **Cutouts come out garbled.** The mask raster is smaller than the box: the real result was width 365, height 1024, for a box 666 wide by 1870 tall. `compositeCutout` indexes the raster using the box width as its stride, so every row is skewed. Scale instead: for a pixel in the box, `mx = floor((x - left) * maskWidth / boxWidth)` and `my = floor((y - top) * maskHeight / boxHeight)`, then read `raster[my * maskWidth + mx]`, which is row-major. Use the `width` and `height` in the response. Move the sampling into a pure function and test it with a mask smaller than its box.

2. **Most "Cut out all" requests fail.** Three of five views showed "The cutout failed", and the server logged nothing. Run cutouts one at a time, not at once. Log every non-OK outcome in the route, including `CUTOUT_REJECTED` and `NO_CUTOUT`, with status and API error message but no image data. Use the concept "person" for sheets instead of "figure". If that finds nothing, try "figure" once before reporting. Show the route's actual message on the slot, so "No figure was found" is not reported as a generic failure.

3. **Sheets vanish on reload.** `CastDrawer` holds sheet images only in local `slots`, which start empty. After a reload the world has the images back from IndexedDB, but the drawer shows "No image yet". Derive what each slot shows from `selected.sheet`, using local state only for in-progress and error states. The same applies to cutouts: load them from the store for the selected character. Add a test.

4. **Generation interrupted.** Clicking "Cut out all" while a sheet was still drawing left the last view empty. Disable "Cut out all" and single cutouts while a sheet is being generated, and vice versa, and only offer them for views that have images.

5. **Hydration error on every load with saved data.** The package tree shows "(22 expected files are missing...)" on the server and "(10 ...)" on the client, because the client's initial state comes from `sessionStorage`. Render the initial client state from the seed, then load the persisted world in an effect after mount. Fix the cause, not the symptom. The console must show no hydration errors after a reload at any scene.

6. **Crash on old saved data.** `planAgentFiles` threw `Cannot read properties of undefined (reading 'filter')`. Validate persisted worlds with `WorldSchema.safeParse` on load, and discard them if invalid. Make the drawers safe on a valid world with empty lists.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
