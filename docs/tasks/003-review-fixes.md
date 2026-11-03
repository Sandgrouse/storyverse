# Task 003 review fixes

You are on the branch for pull request 3. I ran it against the real API. The ripple works well. Make only these fixes.

## 1. The change itself never enters the canon

The final check returned: "No channel shows Enyinyi telling them how to kill Anukili." That is right about the data, because nothing recorded the change. So the check can fail even when every fix is applied.

- Add `canonChanges: string[]` to `World`, default empty. Serialize it at the top of the canon text as "Established changes to the canon". When the last fix is decided, add the change to `canonChanges` before the check runs. Skip this if a ripple had no fixes.
- Have the ripple model also return `secretUpdates`, a list of `{ secretId, text, note }`, with `secretId` constrained to an enum of the world's secret ids in the schema, and drop any that do not resolve. Update the instructions: a secret the change settles should be updated here, and the update must keep which channels may know it. Apply `secretUpdates` to the world together with `canonChanges`. Update the sample seed.
- Change the check's question. It must ask: given the established changes as true, does any scene in any channel still contradict the canon, and does any scene leak a secret into a channel that may not know it? A channel staying silent on a change is not a contradiction. Fixes the user kept as is count too: report them honestly if they leave a contradiction.

## 2. Show what changed

After a fix is applied, the card shows only "Fixed in Series · Needs a clue". The user never sees the rewritten scene, which is the point of the feature. Have the applied card show the new scene text, with a "Show the old version" toggle. The card may grow, and the panel scrolls.

## 3. Stamps must match the kind

A part is always stamped "Breaks", even when the fix only reads differently. Use the strongest kind on that part: "Breaks" for a contradiction, "Changes" for a shift in meaning, "Needs a clue" for a setup.

## 4. Lost decision

Clicking "Keep as is" on two cards in quick succession recorded only one, which left a card stuck at "1 left to decide". Find the stale state and fix it, so that decisions made while another card is applying are never lost. Add a test.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
