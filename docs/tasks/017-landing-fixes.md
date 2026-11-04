# Task 017: Landing page fixes

The owner will test PR 16's landing page next, and the reviewer already ran it in a browser. Fix exactly these, and nothing else. You must not deploy anything.

## 1. Cards sit half a screen too far right and down (blocking)

`.land-outer` in `app/globals.css` has `left: 50%; top: 50%`. The scroll engine sets `x: cx` and `y: cy` where `cx` and `cy` are the card's centre measured from the stage's top-left (see `lib/landing.ts` around `cx: (safe.x / 100) * viewportW`), with `xPercent: -50` and `yPercent: -50`. So every card is offset by (width/2, height/2). At 1358x646 the hero cards sit below the buttons and half off the right edge, and in later chapters most cards are off screen. Anchor the outer element at the stage's top-left (`left: 0; top: 0`), keeping `xPercent`/`yPercent`. The reviewer confirmed in the browser that setting `left: 0; top: 0` on every `.land-outer` puts the cards where `docs/design/landing.html` puts them.

Then check the rest of the transform maths against the prototype's `frame()` for any other offset that this was hiding, such as the Video `cap` and `head` positions and the secret banners, which are positioned from the same coordinates.

## 2. Tag labels don't show

In the prototype, cards carry a label in the Storyboard chapter ("Shot 1" to "Shot 6"), the Publish chapter ("Series", "Game", "Shorts", "Film") and the Change chapter ("Breaks"). The reviewer saw none in the browser at the resting point of those chapters. Make them show near the rest of each chapter, as the prototype does with its `near` check, and hide while cards travel.

## 3. Add a test that would have caught #1

A test (jsdom is fine) asserting `.land-outer` is anchored at the top-left, that is, `left: 0` and `top: 0` in the CSS or inline style, so this does not regress.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. In your final message, say honestly what you could not check, including motion.
