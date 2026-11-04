# Task 008 review fixes

You are on the branch for pull request 8. I ran it in a real browser. Make only these fixes.

1. **The app won't start.** `next dev` exits with: `You cannot define a route with the same specificity as a optional catch-all route ("/projects/[id]" and "/projects/[id][[...section]]").` Delete `app/projects/[id]/page.tsx`. In the catch-all page, when there is no section, call `router.replace` to `/projects/[id]/story`, rendering the empty `<main />` until then.

2. **"See what I found" goes to the wrong page.** On `/projects/new/reading`, `clear()` empties the draft before navigation finishes, so the "no files" effect fires and `router.replace` wins. The user lands on `/projects/new/material` instead of the project. This affects the sample and real reads alike. Keep a ref that is set as soon as `onDone` runs, and skip the redirect when it is set. Check `app/projects/[id]/reading/page.tsx` and every other page for the same race. Move the logic that decides whether to redirect into a pure function, with a test.

3. **Top bar is unreadable over art.** On the Story page, the bar's text sits directly on the artwork. Give the bar a paper background, `rgba(239, 232, 219, .86)` with `backdrop-filter: blur(10px)`, on every page, and make sure nothing important sits under it.

4. **Two sample buttons.** `/projects/new/material` shows "Use the sample project" twice. Keep only the one under the drop area.

5. **Your projects cards.** Leave them as they are. A design for this page comes in a later task.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
