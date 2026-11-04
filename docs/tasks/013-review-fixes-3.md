# Task 013 review fixes, round 3

Make only this fix. In the browser at 1440×900 with "Tall 9:16" selected, the player has the right size (322×574) but sits 243px too low inside `.video-framewrap`, which is 574px tall and clips it, so the bottom half and the caption are cut off. The wide shape is right.

Stop relying on flex centring here. Make `.video-framewrap` `position: relative`, and position `.video-player` absolutely with `left: 50%; top: 50%; transform: translate(-50%, -50%)`, keeping the measured width and height. Remove the `height: 100%` and `aspect-ratio` rules that fight the measured size when it's present, and keep a sensible size before the first measurement. Do not change anything else.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
