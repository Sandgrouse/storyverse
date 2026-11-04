# Task 024: Landing polish

The owner approved the landing page's movement. Two things remain. You must not deploy anything. Touch only `components/landing/*`, `lib/landing.ts`, `app/page.tsx`, the landing CSS in `app/globals.css`, and their tests.

## 1. No jumbled first paint

On first load the headline, copy and cards appear unstyled and jumbled before the page arranges itself (the owner sees it as the CSS arriving late). Fix it properly:
- Server-render the landing page in its **final first-frame state** (hero text visible and centred, cards at their hero positions or hidden, rail hidden), so nothing is rearranged after hydration. Do not rely on JavaScript to place elements that the CSS can place.
- Hold a quiet full-screen cover (paper colour, the Storyverse logo) until fonts (`document.fonts.ready`), the hero images and the GSAP setup are ready, then fade it out in 400ms, with a 3-second cap so it never sticks. With reduced motion, no fade.
- No layout shift: reserve sizes for cards and text before images load. Add a test for the cover's logic (ready conditions and the timeout).

## 2. The Video chapter must actually play

In the "Turn scenes into shorts" chapter the playhead scrubs but the picture never changes and there are no captions. In `docs/design/landing.html` the chapter shows a player with a caption and a moving playhead. Make it a real looping mini-cut while the chapter is on screen:
- The big card cross-fades through the four thumbnails' pictures in order, 3 seconds each, with a slow push-in on each (transform scale 1 to 1.08, transform only), and the matching thumbnail is outlined as the current shot.
- The caption changes with each shot. Use these captions, in order: "One night they run across the Omabala to escape him." then "He finds them." then "And they run back across the river to endure him again." then "Owl's droppings blind him."
- The red playhead runs across the whole timeline in sync with the shots and loops.
- It starts when the chapter's rest is reached and pauses when it leaves. Animate only `transform` and `opacity`. With reduced motion, show the first shot with its caption and no movement.
- Add a test that the caption list and shot order are present in `lib/landing.ts`.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. Say honestly what you could not check, including motion.
