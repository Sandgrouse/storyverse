# Task 028: Landing cards, Story switch, character sheet

The owner tested the app and found three bugs. You must not deploy anything. Touch only what each part needs, and their tests.

## 1. Landing cards do not show on first load

Reproduced: on a fresh load at scroll 0 every `.land-outer` card is positioned correctly but has inline `visibility: hidden`. They only become visible after the page has scrolled to the Characters chapter and back.

Cause: in `components/landing/LandingPage.tsx` the visibility cache is read with a default of `true` (`(v.card.get(card.id) ?? true) !== shown`, and the same `?? true` pattern for flags, secrets and other elements around lines 524 to 680). The initial server-rendered state is hidden, so when a card is shown on the first frame the cache already says "visible", nothing is written, and the element stays hidden.

Fix: make the first tick always write the real state. Seed each cache entry as unknown (no default `true`), or write `visibility` once for every element in the setup step. Apply it to every element that uses this pattern, not only cards (flags, secrets, captions, head, hero, hint, close). The hero cards must be visible on first paint at scroll 0, after the cover fades. Add a test for the visibility sync helper so a first tick that is "shown" always writes `visible` when the element starts hidden. Verify in the browser on a fresh load: hero cards visible without scrolling.

## 2. The Story page switch is cut off

On the Story page the Timeline | Book pill sits under the top bar and is cut off (`.viewswitch` in `app/canon.css`, `top: 68px`, absolute). Put it in its own reserved row directly under the top bar, with at least 12px clear above and below, fully visible and clickable, in both Timeline and Book views, at viewports 1280x720, 1440x900 and 1920x1080. In Book view the three columns start below that row. Nothing may overlap the top bar or the page card.

## 3. Character sheet: no regenerating what exists

On `/projects/[id]/characters`, when a character already has a full sheet, the "Generate full sheet" button (`components/experience/CastDrawer.tsx`, around line 1199) and the "Character sheet" section still show and clicking it redraws the character. Change:
- When the sheet is complete (all poses have images), hide "Generate full sheet". Do not show a primary button that redraws.
- Show a **lightbox** instead: clicking any pose image (or a "View sheet" button) opens a full-screen overlay with the pose large, left/right arrows and keyboard arrows to move through the poses, the pose name, and Close (Escape or the backdrop).
- Redrawing stays possible only as a small, quiet "Redraw this pose" link on a single pose inside the lightbox, with a confirm line ("This replaces the current picture."). No "redraw all".
- When the sheet is partial, keep "Make the missing poses" which only draws what is missing.
- Keep the extra-pose chips and "Make this pose".

Add tests for the logic that decides complete versus partial and for the lightbox navigation (index wraps, Escape closes).

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. Say honestly what you could not check.
