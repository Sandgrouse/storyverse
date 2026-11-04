# Task 022: Landing label layering

Task 021 moved the tag labels out of the clipped card, and they are now the right size and in the right place, but they are drawn underneath the cards, so they still can't be seen. The reviewer confirmed in a browser: the `.land-flag` elements have `z-index: 3`, while `.land-outer` cards get z-index values up to 8 or more at chapter boundaries (the reviewer read `2,0,4,5,6,0,8,2,...`). Setting the flags' z-index to 50 made every label ("Series", "Shorts", "Game", "Film", "Shot 1" to "Shot 6", "Breaks") appear correctly inside its card.

Fix it: the flags must always sit above every card. Give them a z-index above the highest card z-index the engine can set (derive it from the card count, or use a constant with a comment), still below the top bar and the right-hand rail. Add a test that asserts the flag z-index is greater than the maximum card z-index the engine can produce. Change nothing else. You must not deploy anything.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. Say what you could not check.
