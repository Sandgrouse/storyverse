# Task 006 review fixes

You are on the branch for pull request 6. I ran it against the real API. The Story Pack works. Make only these fixes.

1. **SAM cutouts always fail.** The real error is `ResponsesStreamLaneError: The response finalized its output text lane more than once.` The API now sends both `response.output_text.done` and `response.content_part.done`, and `normalizedCutoutEvents` synthesizes a second "done" for the same lane. Follow Meta's cookbook logic: keep a `Set` of finished lanes keyed by `item_id:output_index:content_index`. Pass through a real `output_text.done` once and mark its lane. On `content_part.done`, always pass the event through, then synthesize a `done` only if that lane is not yet finished. Add a test with both events present and a test with only `content_part.done`.

2. **Unlogged failures.** The route's final catch swallows the error. Log it on the server, without the key or image data, and do the same in `/api/pack`.

3. **Credit the SAM license.** `@meta-sam/parser` is under Meta's SAM License, which requires passing on its terms when distributing. Add a "Third-party" section to `README.md` stating that the project uses `@meta-sam/parser` under the SAM License, with a link to `https://dev.meta.ai/`. Do not copy the package's code into the repo.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
