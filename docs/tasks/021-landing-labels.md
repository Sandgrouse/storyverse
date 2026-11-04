# Task 021: Landing card labels

PR 16's cards are now in the right places. One bug remains, found by running it in a browser. You must not deploy anything.

The tag labels on cards ("Shot 1" to "Shot 6", "Series", "Game", "Shorts", "Film", "Breaks") are `.land-flag` elements rendered inside the card's counter-scaled inner element. The card's outer element has `overflow: hidden`, and the flag's position (about 12px left of and 58px above the card's top-left at the chapter's rest, measured with `getBoundingClientRect`) is outside the visible card, so the label is clipped and never seen. In `docs/design/landing.html` the label sits inside the card, 10px from its visible top-left corner.

Fix it so that at each chapter's rest the label is visible inside the card, 10px from the card's visible top-left corner, at its normal size (about 24px tall), without stretching, on every card that has one, at viewport widths from 1100px up. Do not move the clipping onto another element in a way that changes how the cards reshape. The simplest approach is to render the flags as siblings of `.land-outer`, positioned each frame from the card's computed left and top (transform only), and hidden while the card travels.

Add a test (jsdom is fine) that checks the flag is not a descendant of an element with `overflow: hidden` that would clip it, or whatever invariant your fix relies on.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. Say what you could not check.
