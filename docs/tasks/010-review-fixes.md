# Task 010 review fixes

You are on the branch for pull request 10. Make only these fixes.

1. **Any visitor can pass any voice id.** `/api/voice/speak` puts `voiceId` straight into the upstream URL path, and accepts voices other than premade ones. Validate `voiceId` against `^[A-Za-z0-9_-]{1,64}$` and also pass it through `encodeURIComponent`. Then require it to be in the premade list, using the cached list, fetching the list if the cache is empty. Reject others with 400 "Choose one of the listed voices." Add tests, including `../../voices/add` as a voice id and an id that isn't listed.

2. **The Characters drawer squashes its top row.** Since the Voice section was added, the row of character art is squeezed into a thin strip about 25px tall, and the Canon text is cut off. The drawer must scroll as one column, with the art row and Canon at their full heights. Set `flex-shrink: 0` on its sections, or make it a normal block flow with `overflow-y: auto`. Check the Voice section is reachable by scrolling.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
