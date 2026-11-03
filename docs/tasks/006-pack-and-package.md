# Task 006: Story Pack, agent package and SAM cutouts

Make the last two outputs real, using Muse Spark and SAM 3.1. Keep the visual design. You have no API key and must not look for one, so mock `fetch` and streams in tests.

## 1. Retry brief outages

The image service sometimes returns 503 "temporarily unavailable". In `lib/meta/client.ts`, retry once after 2 seconds on a 502, 503 or network error, for both text and image calls. Do not retry 4xx. Keep total time under the route's `maxDuration` of 60 seconds, skipping the retry if more than 35 seconds have passed.

## 2. Story Pack

`POST /api/pack` takes `{ world, partId, channelId }`, with images stripped. It uses Muse Spark structured output and returns, for that channel's take on that part:

- `script`: a scene script if the channel kind is series, a level brief if game, a first-person monologue if shorts
- `shots`: three to five visual beats, each one sentence
- `posts`: three short social posts that tease without revealing any secret
- `reveals`: which secrets this piece reveals

Instructions, exactly:

> You write production material for one piece of a story told across channels. Use only the canon. Reveal only what this channel may know: a secret whose knownThrough excludes this channel must not appear or be hinted at beyond what the canon's scenes already show. Never rename anyone or change an established detail. Any new detail you add is labelled in additions.

Also return `additions`, a list of anything invented.

The desk's "Story Pack" button opens a drawer with a channel picker, limited to the channels that cover this part, and a generate button. It shows the script, shots, posts and additions, using the part's art. Add "Copy" and "Download .md". Keep generated packs in the world state so that the agent package can include them. Remove the desk's "Send to video" button.

## 3. SAM 3.1 cutouts

`POST /api/art/cutout` takes `{ imageDataUrl, concept }`, with `concept` a short noun phrase such as "person". Add the dependency `@meta-sam/parser`. The call is a streaming Responses request. This is the shape from Meta's cookbook, written there with the `openai` SDK. Use `fetch` with `stream: true`, or add the `openai` package if that is simpler:

```ts
const input = [{ type: "message", role: "user", content: [
  { type: "input_text", text: concept },
  { type: "input_image", image_url: dataUrl },
] }];
// model: "sam-3.1", stream: true, input
// The API streams response.content_part.done but not response.output_text.done,
// which the parser needs, so synthesize it per lane from the content part:
// { type: "response.output_text.done", item_id, output_index, content_index, text: part.text }
const result = await parseImageStream(normalizedEvents(stream)).finalResult;
// Then recordsOfKind(...) and decodeMaskToRaster(...) from @meta-sam/parser.
```

Read the package's types in `node_modules` to get the record kinds and raster shape right. Return the largest mask in a form the client can use, and have the client composite it as alpha on the source image in a canvas, producing a transparent PNG. Keep the original image's size in the result. The route must work within 60 seconds and 4.5MB.

In the Characters drawer, each generated sheet view gets a "Cut out" action, plus "Cut out all". Store cutouts in IndexedDB beside the sheet, and show them on a checkerboard background. A failed cutout shows a retry on that view and blocks nothing else. SAM 3.1 uses the world's own art, so this works on any character.

## 4. Agent package

The Agent package drawer's "Export package" builds a real ZIP in the browser with `jszip`. It has a channel picker, because each package is for one channel:

```
<story>-<channel>/
  AGENT_BRIEF.md
  manifest.json
  canon/world.md
  canon/timeline.json
  canon/secrets.json
  characters/<id>/canon.md
  characters/<id>/sheet/<view>.webp
  characters/<id>/cutouts/<view>.png
  scenes/<part>/art.webp
  scenes/<part>/brief.md
  packs/<part>.md
```

- **The secret rule is the feature.** `canon/secrets.json` and every file in the package may hold only secrets whose `knownThrough` includes this channel. Beats from other channels are excluded from `scenes` and `timeline`. `AGENT_BRIEF.md` states plainly what the agent's players or viewers may learn and that everything else is deliberately absent, without saying what it is. Add a test that a secret belonging to another channel appears in no generated file.
- `manifest.json` lists every file with its type, its character or part, and whether it is a suggested addition.
- Mark anything `suggested` as such in the files.
- Files that do not exist yet are simply left out, and the manifest says so. The drawer's tree preview reflects what will really be in the ZIP.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Tests cover: retry rules, the pack's request, stream normalization, mask selection, and the secret rule in the package. No component holds story text.
