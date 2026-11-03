# Task 003: The real ripple

Replace the scripted ripple with Muse Spark. This is the core of the product. Do not change the visual design.

You have no API key in this environment, and you must not look for one. Write the code and mock `fetch` in tests. The reviewer will run it against the real API.

## Model client

`lib/meta/client.ts`, server only. Call `POST https://api.meta.ai/v1/responses` with `fetch`, using `Authorization: Bearer ${process.env.MODEL_API_KEY}`. Use structured output:

```json
{
  "model": "muse-spark-1.3",
  "reasoning": { "effort": "low" },
  "instructions": "...",
  "input": "...",
  "text": { "format": { "type": "json_schema", "name": "...", "strict": true, "schema": {} } }
}
```

The text result is the `text` of the first `output_text` content item across `response.output[].content`. Parse it, then validate it with zod. On a non-OK response, throw an error that keeps the status and the API's `error.code`, and never includes the key. Log token usage from `response.usage` on the server.

## Ripple

`POST /api/ripple` takes `{ change, world }`, validated with zod. The client holds the world and sends it, so the server stays stateless. Set `export const maxDuration = 60`.

Use exactly these instructions:

> You are a continuity editor for a story told across several channels. Given the canon and a proposed change, walk through every part and every channel, and report each place the change touches, in three kinds: a contradiction (the scene is now false), a shift in meaning (the scene still holds but now reads differently), or a missing setup (a channel needs a planted clue so the change feels earned when fans compare channels). Only report what the change really touches. A harmless change touches nothing, so return no fixes for it. Respect what each channel may reveal: a secret that belongs to one channel must not leak into another, and a clue may hint without revealing. Never rename anyone or change established details. Propose the smallest fix per scene, in plain language.

Serialize the canon from the world as readable text: characters, parts, each beat with its id, channel and content, and secrets with the channels that may know them.

The model returns `summary` and `fixes`, each fix having `kind` (`contradiction`, `meaning`, `setup`), `beatId`, `title`, `problem`, `proposal`, `regeneratesImage` and `quote` (the exact sentence it responds to). Constrain `beatId` to an enum of the world's beat ids, in the schema. Drop any fix whose `beatId` does not resolve. Derive `channelId` and `partId` from the beat. Do not ask the model for them.

Update `RippleFix` and `RippleResult` to match. Remove `appliedMessage`. The UI builds that line from the fix's kind and channel.

## Applying a fix

`POST /api/ripple/apply` takes `{ change, fix, world }` and returns the rewritten `content` of that beat, using Muse Spark. Instructions: rewrite this scene as little as possible so it carries out the proposal. Keep every name and established detail, reveal nothing that belongs only to another channel, and return only the scene. The client updates its world from the result. Do not regenerate images in this task. Show `regeneratesImage` fixes as "Image update next" for now.

## The final check

When the last fix is decided, the client calls `POST /api/ripple/check` with `{ change, world }`. It asks Muse Spark whether the canon is now consistent with the change, given which fixes were kept as is, and returns `{ consistent, note }`. Show the note as the verdict. Only say all channels agree when `consistent` is true. If not, show the note as it is.

## Interface

- The wait is about 25 seconds. As soon as the user submits, enter ripple mode. Show the change headline and step through status lines in the panel: "Reading every channel", "Checking each secret", "Looking for what breaks". These are honest waiting text. Do not show fake counts or results.
- When the result arrives, reveal hits one at a time with the existing motion and cracks.
- Mark a part as hit if any of its beats has a fix, and light the matching channel dot. The dots and hit states must handle several fixes on one part.
- Show the fix's `kind` in the card, in plain words: "Now false", "Reads differently", "Needs a clue".
- No fixes: show "Nothing breaks. This fits your story." and a way back.
- Applying shows a progress state on that card, and failure shows a retry on that card.
- A failed ripple shows a plain error with a retry, and returns the screen to a usable state. Never leave it stuck.

## Sample mode

If `MODEL_API_KEY` is not set, `/api/ripple` returns `data/seed/anukili-ripple.json` with `sample: true`, `apply` returns the original content with the proposal noted, and `check` returns consistent. The UI shows a small "Sample result" label whenever `sample` is true. Update that seed file to the new schema using real beat ids.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Tests, with `fetch` mocked, cover: request shape, the schema enum, dropping unknown beats, an API error, sample mode without a key, and a world with no fixes.

Do not run `pnpm build` while a dev server may be running; run it with `NEXT_DIST_DIR` unset in a clean state, and delete `.next` afterwards.
