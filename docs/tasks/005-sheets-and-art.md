# Task 005: Character sheets and scene art

Make character sheets and scene art real with Muse Image, and fix a few things from the last review. Keep the visual design. You have no API key and must not look for one, so mock `fetch` in tests.

## Image client

Add `generateImage` to `lib/meta/client.ts`. It calls `POST https://api.meta.ai/v1/responses` with:

```json
{
  "model": "muse-image-1.0",
  "input": [{ "role": "user", "content": [
    { "type": "input_text", "text": "..." },
    { "type": "input_image", "image_url": "data:image/webp;base64,..." }
  ] }],
  "tools": [{ "type": "image_generation", "size": "1024x1536" }],
  "previous_response_id": "optional"
}
```

The image is base64 in `result` on the `output` item with `type: "image_generation_call"`. Return `{ imageBase64, responseId }`. Sizes allowed: `1024x1024`, `1024x1536`, `1536x1024`. Output format is WebP. A blocked prompt returns status 400 with code `content_policy_violation`. Throw a distinct error for that case.

These shapes come from real tests: one reference image plus chained `previous_response_id` calls gave six consistent views at 13 to 20 seconds each.

## Character sheets

`POST /api/art/sheet-view` takes `{ view, character, referenceImage?, previousResponseId?, styleImage? }`, generates one view and returns `{ imageBase64, responseId }`. The client drives the six views in order, so no request outlives a serverless timeout: `front`, `left`, `right`, `back`, `walking`, `crouching`. Attach the reference image only on the first call, then chain with `previousResponseId`.

Every view's prompt ends with exactly this:

> Keep the exact same character from the reference: same face, build, skin, hair, clothing, beads and carried items, in the same art style. Full body, centered, on a plain dark background. Do not draw any text, letters, labels, captions, numbers, logos or watermarks anywhere in the image.

The view lines: "Front view, standing, facing the viewer.", "Left side profile view, standing.", "Right side profile view, standing.", "Back view, standing, facing away.", "In motion, walking quickly with purpose.", "Crouching, examining something on the ground."

If a character has no art, the first call has no reference. It describes the character from `canon` instead, and uses `styleImage` when any art exists in the world, to match the style. Later views chain as normal.

In the Characters drawer, "Generate full sheet" fills the six slots one at a time as images arrive, with the slot's label beneath it, and can be stopped. Once a sheet exists, the first view becomes the character's art wherever they had none. If a view fails, show a retry on that slot and carry on with the rest.

## Scene art

`POST /api/art/scene` takes `{ part, characters, references, styleImage?, change? }` and returns the image. Use `1536x1024`. Attach at most three reference images: sheet fronts or art for the characters in that part. The prompt describes the part's summary, names which reference shows whom, and ends with: "Keep each character exactly as in their reference. Do not draw any text, letters, logos or watermarks." A part with no art shows a "Make the art" button on its desk, which replaces "Send to video" for now. Generated art becomes the part's image everywhere: cover, shelf and art panel.

## Ripple images

When an applied fix has `regeneratesImage: true`, generate the part's art again with the fix's proposal added to the prompt. Show the old and new image side by side on the card. If it fails, the text fix still stands, and the card offers a retry. Remove "Image update next".

## Blocked prompts

The image filter blocks some scenes in this kind of story, including ones with violence. When a prompt is blocked:

1. Ask Muse Spark to rewrite the scene description more gently without changing what happens or who is there, then try once more. Instructions: "Rewrite this image description so it passes a content filter. Keep the same people, place and moment. Describe it through composition, distance, light and aftermath, with no violence, gore or distress shown directly."
2. If it is still blocked, tell the user plainly in that slot: "Muse Image won't draw this. Try describing it differently." Offer an editable description and a retry.

Never fail a sheet, a ripple or the page because of a block. Add tests for both paths.

## Keeping images

Generated images are too large for `sessionStorage`. Keep them in IndexedDB, keyed by world and image name, and load them back on reload. If IndexedDB fails, keep working in memory. Never send image data in `/api/ripple`, `/apply` or `/check`. "Start over" clears them. Send references to the art routes downscaled to 1024px on the long side. Each route still needs to fit Vercel's 4.5MB request limit, and responses must too.

## Fixes from the last review

1. **Sample sentence.** `sampleChange` was changed to "What if Enyinyi betrayed Anukili at the stream?", which is wrong and has no basis in the story. Restore the owner's sentence: "Enyinyi told them how to kill him." To keep the test that the seed world doesn't contain the twist, read it from `data/seed/anukili-ripple.json`, where `change` already holds it, and remove `sampleChange` from the seed world.
2. **Stale ask bar.** After a real upload, the bar still held the sample's sentence, because its state is only set once. Reset it when the world changes.
3. **Label what was invented.** The plan writes new story facts as secrets, such as how the baby survived. The owner must always be able to tell their story from additions. Add `suggested: boolean` to `Secret`, true for anything the planner invents. Show "Suggested" beside it on the Channels card, with "Accept" and "Remove" controls. Add to the plan instructions: "An invented secret is a suggestion for the creator. Never answer a question the material deliberately leaves open if it is listed as a gap: leave it open and make that the secret."
4. **Channel cards overflow.** Long pitches and secrets run off the card. Add to the plan instructions: "A pitch is under 15 words. A secret is under 15 words." Clamp both on the card, showing the full text on hover or focus.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Tests, with `fetch` mocked, cover: request shape with and without a reference, chaining, a blocked prompt being rewritten, a block that persists, and the size handling. No component holds story text. Without `MODEL_API_KEY`, the art routes return a 503 with a plain message and the UI shows it.
