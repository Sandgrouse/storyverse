# Task 009 review fixes

You are on the branch for pull request 9. I ran it in a real browser at 1440 × 900. The motion engine is on the right track, but the page doesn't scroll and several chapters drifted from the approved design. Open `docs/design/landing.html` and match its arrangement for each chapter. Make these fixes.

1. **The page doesn't scroll.** `html, body { height: 100%; overflow-x: hidden }` makes the body its own scroll container, so `window` never scrolls and ScrollTrigger never moves. The document stays 900px tall while the pin spacer is 10800px. Change the global rule to `min-height: 100%` with `overflow-x: clip`, without `height: 100%`. Check that the fixed scenes on other pages still render the same, and that no page gains a scrollbar it didn't have.

2. **Hero must be the approved curved gallery.** Muse's seats put flat, tilted cards over the headline and buttons. Use the prototype's `ring()` and `seat()`: four cards a side, curving away with `rotateY` and increasing `translateZ` under a stage `perspective` of 1500px, inner cards at about ±26.5vw from centre. Headline, lede and buttons are never covered. Add `ry` and `z` to the seat type. Keep transforms only.

3. **Closing chapter must bring the gallery back**, using the same seats pushed out by 7vw, so the words "Your story is bigger than one screen." stay clear. At present the cards are missing.

4. **Top bar:** the logo shows as a blue underlined link, and the pill sits next to it. Links on `/` inherit colour with no underline. The logo is at the far left. "Your projects" and the small "Start your story" pill are together at the far right. "Your projects" is currently missing.

5. **Parts chapter:** the first card covers the copy. All three cards must clear the copy column, which ends at about 34vw. Centre them at about 47, 66 and 85vw, and fit them within 17.5vw each, with each secret strip attached to its own card's lower edge, moving with it.

6. **Characters chapter:** a blank paper card shows at the left, because an image doesn't appear. Every card must show its image. Add a check that no card in `lib/landing.ts` uses a path that doesn't exist, and look for why this one is blank, such as a preload or `next/image` sizing issue.

7. **Video chapter:** a second Omabala card sits beside the player. The story art card must fade out as the player fades in, leaving only the player and the timeline. Show four thumbnails as in the prototype, aligned to the player's width, with the moving playhead line over them. The caption sits on the player, with a dark gradient behind it.

8. **Story chapter:** the small hippo card should peek out from the top right of the script page, as in the prototype.

9. Make sure the Change chapter's top row, bottom "Breaks" row and "The change" line all sit clear of the copy, and the Game chapter's file tree doesn't overlap its cards.

10. **Your projects:** check it still uses the normal page scroll with item 1 in place.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
