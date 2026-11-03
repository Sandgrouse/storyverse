# Task 002 review fixes

You are on the branch for pull request 2. Make only these fixes.

1. **All type renders in the fallback font.** `app/layout.tsx` registers the fonts through `next/font/local`, so the browser knows them under generated names, but `app/globals.css` asks for `"Newsreader"` and `"Instrument Sans"` by name. Newsreader never applies, and headlines render in heavy Georgia. Point `--serif` and `--sans` at the `--font-serif` and `--font-sans` variables, with the current fallbacks. Make sure those variables are set on an element above every scene.

2. **Weights.** The font files are variable fonts, but the layout declares them once per weight. Declare each as one source with a weight range, so weight 300 really renders light. Check the range against the file.

3. **Character art changed.** `public/anukili/anukili.webp` and `hippo.webp` now show a human man with a different crop. Check that the world's character art, covers and shelf still frame his face, using `background-position` where needed. Do not change the art.

Add a test that `globals.css` does not name either font family directly.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
