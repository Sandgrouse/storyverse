# Task 008 review fixes, round 2

You are on the branch for pull request 8. Make only this fix.

**You can't add files on `/projects/[id]/material`.** In `BringScene`, `!ready && !hideSample` hides the whole drop area, so the page has no drop zone or file input. `hideSample` must hide only the "Use the sample project" button. Keep the drop area visible when there are no files, unless the project is the sample, where it stays hidden with its note. Add a render test that the file input exists on this page's scene when `hideSample` is set.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
