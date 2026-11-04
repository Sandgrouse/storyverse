# Task 013 review fixes

You are on the branch for the video maker. I tested it in a real browser. The player, the timeline, and MP4 export all work (an 11-second 1280×720 file came out correctly). Make only these fixes.

1. **"Plan shots with Muse" always fails.** The real API returns: `400 'required' is required to be supplied and to be an array including every key in properties. Missing 'voice'.` In `VIDEO_PLAN_JSON_SCHEMA`, every property must be listed in `required`. Make `voice` required and nullable using `anyOf: [{ type: "object", ... }, { type: "null" }]`, and map `null` to no voice. Do not use `minItems` or `maxItems` if the API rejects them. Validate the count in code. Add a test that walks the schema and asserts every object's `required` lists all its properties.

2. **One long caption shouldn't fail the plan.** Truncate captions over 90 characters at a word boundary, clamp durations to 3 to 7 seconds, keep at most 6 shots, and only fail with fewer than 2 usable shots. Show a helpful failure: "Muse couldn't plan this scene. Try again, or add shots with +." The failure currently appears twice on the page, so show it once, near the button used.

3. **The picker can add the same art repeatedly without noticing.** In the "+" picker, mark art already in the short with a small "In use" label. It can still be chosen.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
