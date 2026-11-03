# Task 007: Make it safe to put online

The app will be public, and judges will try it. It holds a real API key on the server. Make it safe and reliable. Do not change the visual design or add features. You have no API key and must not look for one, and you must not deploy anything.

## 1. Spending cap

Add `lib/budget.ts`, used by every route that calls a model: read, plan, ripple, apply, check, pack, sheet-view, scene, cutout.

- A cost in cents per call: read 3, plan 3, ripple 2, apply 1, check 1, pack 1, sheet-view 1, scene 2 (it may rewrite), cutout 1.
- A shared daily total, stopped at `DAILY_BUDGET_CENTS` (default 300), resetting at midnight UTC.
- A per-visitor limit, by hashed `x-forwarded-for`, of `VISITOR_BUDGET_CENTS` per day (default 60). Never store the raw IP address.
- Storage: a small JSON file in Vercel Blob, using `@vercel/blob` when `BLOB_READ_WRITE_TOKEN` is set. Serverless instances may race, and that is acceptable for this purpose, so read before each charge and write after it. Keep an in-memory count too, and use whichever total is higher. With no token, use memory alone. A storage failure must never block a request by itself.
- Over the limit, return 429 with `{ error: { code: "BUDGET", message } }`. The message is one of: "Today's demo limit is used up. You can still explore the sample story." or "You've reached the demo limit for today. You can still explore the sample story."
- The client shows that message where the action was. Nothing gets stuck, and the sample project stays fully browsable with no calls.

Add tests for both limits, the reset, and a storage failure.

## 2. Sample project ready to explore

Character sheets now exist in `public/anukili/sheets/<character-id>/<view>.webp` for `anukili-ugama` and `enyinyi`. Add them to those characters' `sheet` in `data/seed/anukili.json`, so judges see real sheets at once with no spending. A test must confirm that every path in the seed exists under `public/`.

Make "Use the sample project" impossible to miss on the Bring screen, without changing its style.

## 3. Production correctness

- Run `pnpm build` and `pnpm start` in your checks, and confirm the page and `/api/ripple` respond without a key in sample mode. Clean up afterwards.
- Add `vercel.json` only if needed. Every model route must have `maxDuration = 60`.
- Set security headers in `next.config.js`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`.
- All model routes reject requests over 4.5MB with a clear 413, and reject a body that fails validation with a 400. Never echo image data or the key in a response or a log.
- Make sure no client bundle references `MODEL_API_KEY`. Add a test that greps for it under `components/` and for any `NEXT_PUBLIC_` key.
- `.env.example` lists `MODEL_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `DAILY_BUDGET_CENTS`, `VISITOR_BUDGET_CENTS`.
- Add page metadata: title "Storyverse", description "Change the story once, and every channel follows.", and an Open Graph image from existing art.
- A global error boundary shows a calm message with a "Start over" button in the existing style. A missing or broken image never breaks a scene.

## 4. README for judges

Rewrite `README.md`:

- What Storyverse does, in three sentences.
- How each Meta model is used: Muse Spark, Muse Image, SAM 3.1, and Muse Code.
- How to run it: `pnpm install`, set `MODEL_API_KEY`, `pnpm dev`.
- **What was built during the hackathon:** all application code in this repo, from the first commit on Nov 3, 2026. **What existed before:** the idea and the story. Anukili Ugama is an Igbo myth; `docs/story/anukili-treatment.md` is an original retelling written for this project. All art in the repo was generated with Muse Image during the event.
- **How it was built:** application code was written by Muse Code from task specs in `docs/tasks/`. Specs, design prototypes and pull request reviews were by Claude Code, directed by the project's owner.
- Keep the third-party section.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
