# Task 001 review fixes

You are on the branch for pull request 1. Make only these fixes. Do not rework anything else.

## Must fix

1. **The seed world already contains the twist.** In `data/seed/saltlight.json`, Mara's `secret` is "She cut the lamp herself." That is the canon change the demo makes later, so a model reading this canon would find nothing to change. Change her secret to "She is hiding where she was when the lamp went dark." Check that no other seed text states or implies she cut the lamp. Add a test that no seed text contains "cut the lamp".

2. **Hardcoded ripple text.** The secret that changes to "Mara cut the lamp wire" after a ripple must come from the ripple result, not from code in the component. Add `secretUpdates` to `RippleResultSchema`: a list of `{ secretId, text, note }`. Add the update to `data/seed/saltlight-ripple.json`. Apply it from the result in `StoryMap`. Remove any Saltlight-specific strings from components, and search all components for others.

3. **The package page shows a change that never happened.** `/package` always shows "Changed by the last ripple". Remove that line for now, and read no fixture data on this page. A later task adds it back from real saved state.

4. **Scrolled map is unreadable.** When the ripple panel is open and the board scrolls sideways, beats and the secrets row show through the channel labels. Make every lane label, including "Secrets", an opaque sticky column above the beats. Cover the column gap too, so nothing is visible to the left of the first beat column.

## Small fixes

5. In the seed world, "the girl's light" in `vigil-ledger` is wrong, because Mara is a woman in her forties. Use "her light". Add her age to her `canon`.
6. On `/package`, the brief shows "elias" in lower case because the text is lower-cased. Do not change the case of names.
7. Remove "Prototype. Sample content, no model calls." from the rail.
8. On `/characters`, "Used in" reads ambiguously. Prefix each entry with its channel, such as "Game: Level 1".
9. In the ripple panel, the before and after thumbnails on a regenerating fix use unrelated placeholders. Show only the beat's current thumbnail for now.
10. Add `tsconfig.tsbuildinfo` to `.gitignore`.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
