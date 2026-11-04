# Task 016: Landing page revision

The owner tested the landing page and approved a revised prototype. Rebuild the landing page to match it **exactly**. You have no API keys and must not look for any. You must not deploy anything. Another task is building a storyboard feature at the same time, so touch only `components/landing/*`, `lib/landing.ts`, `app/page.tsx`, their tests and CSS, and the README's third-party section if needed.

`docs/design/landing.html` is the revised prototype. Open it and read its `<script>`. It is the specification: chapter order, copy, tints, art choices and every layout (`CH`, `L`, `ring`, `seat`, `hidden`, `get`, `frame`). Its copy is final, so use it word for word. Port its logic directly: the layouts (positions, sizes, rotations), the per-card stagger (`clamp(e*1.35 - (n%8)*.05)`), the arc each card follows between layouts, the push-out from the hero, the Z order at chapter boundaries, the chapter fades, and the tag labels on cards ("Shot 1", "Series", "Breaks").

## What changed from the first landing task

1. **New chapter order:** Start, Your world, Characters, Story, Storyboard, Publish, Video, Game, Website, Change, One base, Begin. The rail on the right lists them all.
2. **Storyboard chapter:** six 16:9 frames on the right, labelled Shot 1 to Shot 6, copy on the left.
3. **Publish chapter** replaces "Parts": four cards in four different shapes, each with its label: Series (wide), Shorts (tall), Game (square), Film (ultrawide). The series, game and shorts cards each carry their secret banner, as in the prototype.
4. **Hero cards are smaller** and must never overlap the top bar: the logo, "Your projects" and "Start your story" stay fully visible and clickable at every viewport size from 1100px wide up. Add a test or a runtime check that the hero cards' bounding boxes don't intersect the top bar's, and fix it by clamping if they would.
5. The Website chapter keeps "Coming next". The Storyboard chapter does not.

## Cards must travel and morph, exactly like the prototype

This is the most important rule. In the prototype, each card is one persistent element that moves from its position in one chapter to its position in the next, changing shape on the way, so the same cards seem to rearrange themselves as you scroll. The first landing build did not do this: it crossfaded different cards, and the owner saw the difference immediately. Do not crossfade between chapters. Every card that appears in two chapters must be the same element, travelling between its two layouts. Only a card that has no place in the next layout fades out, and only as it leaves.

The prototype changes `width` and `height` each frame, which is choppy, so you cannot copy that part. Keep the same look with transforms only:
- Render each card element at the largest size it ever needs. Animate its **outer** wrapper with `x`, `y`, `scaleX`, `scaleY`, `rotation` and `rotationY`, and put the image in an **inner** element that counter-scales (`scaleX: 1/outerScaleX`, `scaleY: 1/outerScaleY`) so the picture never stretches. The wrapper clips with `overflow: hidden` and `border-radius`, so a card that goes from portrait to wide visibly reshapes while its picture stays undistorted. Give the corner radius a fixed size by also counter-scaling a radius-bearing element, or by using a `clip-path: inset(... round ...)` that is set once per layout, not per frame.
- Use one scrubbed GSAP timeline pinned with ScrollTrigger, as in task 009. Animate only `transform` and `opacity` per frame. No `width`, `height`, `top`, `left`, `filter` or `box-shadow` per frame.
- Keep the earlier rules from `docs/tasks/009-landing.md` for small images (`next/image`, width at most 800), `will-change`, GSAP and Lenis wiring, hover, pointer parallax, magnetic pills, mobile and reduced-motion fallbacks, the right-hand rail, and cleanup. Where this file and 009 differ, this file wins.
- Prove it in a test where you can: a unit test that every card id used in a chapter's layout exists in the card list, and that no layout swaps a card for a different element. Say honestly what you could not check, including motion.

## Tests

Update the landing tests: every chapter has its copy where expected, every image path in `lib/landing.ts` exists under `public/`, the chapter order is as above, and the tag labels are present.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
