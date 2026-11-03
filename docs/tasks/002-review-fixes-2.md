# Task 002 review fixes, round 2

You are on the branch for pull request 2. The last font fix made things worse, and all type now renders in Times at the wrong size.

**Cause:** `globals.css` defines `--serif: var(--font-serif), ...` on `:root`, which is `<html>`. But `app/layout.tsx` puts the font variable classes on `<body>`. So `--font-serif` is undefined on `:root`, `--serif` resolves to nothing, and every `font:` shorthand that uses it is dropped.

**Fix:** move the font variable classes from `<body>` to `<html>` in `app/layout.tsx`. Change nothing else in the layout.

Extend `tests/fonts.test.ts` to assert that `app/layout.tsx` applies `serif.variable` and `sans.variable` on the `<html>` element. The existing test only read the CSS, which is why it passed while the page was broken.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
