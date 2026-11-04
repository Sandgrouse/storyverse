# Task 009 review fixes, round 2

You are on the branch for pull request 9. Scrolling and frame timing are good now, so don't change the engine. Make only these fixes.

1. **Invisible pill text.** The small "Start your story" pill in the top bar is black text on black, because the `a` colour rule overrides `.pill`. Pills must keep their own text colour on `/`, in both dark and light styles, and pill text is never underlined. The hero's "Start your story" is underlined at present.

2. **The gallery isn't curved.** The rotateY in the hero and closing seats has no visible effect, because the perspective doesn't reach the cards through the nested wrappers. Set `transformPerspective: 1500` on each card's outer element through GSAP, or use `transform-style: preserve-3d` on each wrapper. It must look like the prototype: cards receding into a curved wall on each side, the outer ones larger and closer. Inner cards must clear the hero lede, which currently touches the card edge. Cards on each side should overlap only slightly. Compare with `ring()` and `seat()` in `docs/design/landing.html`, and check the rotation still clears to 0 on other chapters.

3. **Game chapter:** add back the Anukili and Enyinyi sheet cards from the prototype, overlapping the hippo card, between the file tree and the copy.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
