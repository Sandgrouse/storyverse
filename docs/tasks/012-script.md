# Task 012: The script page

The owner approved this design. Follow the Script view of `docs/design/studio.html`: layout, copy and hover. You have no API keys and must not look for any: test with mocks. You must not deploy anything. Another task is changing voices at the same time, so **put all new CSS in a new file `app/script.css`**, imported by the page, and do not edit `components/experience/CastDrawer.tsx` or `lib/voice.ts`.

## 1. Page and navigation

- New page `app/projects/[id]/script/page.tsx`, with `/projects/[id]/script?channel=&part=` selecting a scene. Default to the first scene. `MissingStory` handles an unknown project.
- Add "Script" to the top bar sections, between Characters and Agent package, shown and highlighted here, and Back goes to `[id]/story`. Update `lib/nav.ts` and its test. The section links must appear on this page too.

## 2. Data

Add to `WorldSchema`, with a `.default([])`, so old worlds load: `scripts: [{ channelId, partId, text, updatedAt }]`. `updateWorld` persists it. Typing saves after a short debounce. `mergeWorldAssets` keeps it.

If a scene has no script yet but `world.packs` has one for that channel and part, start from the pack's script. The page must not call a model on load.

## 3. Left list

Every scene from `world.beats`, grouped by channel with the channel's colour dot, in beat order, labelled `{unitLabel} · {title}`. Hover and selected states as in the design.

## 4. The page

A paper page in the design's screenplay style, using a `textarea` with a mirrored backdrop behind it for highlights: identical font, size, padding and wrapping, with transparent textarea text colour handled so that the caret and selection work. Highlight every character and location name from the world, longest first and case-insensitive. Empty scene: placeholder "Write this scene, or ask Muse to draft it."

## 5. Muse tools (right column)

Routes with `maxDuration = 60`, the 4.5MB limit, zod validation, images stripped, budget charged, and logs without content:

**`POST /api/script/draft`** `{ world, channelId, partId, mode: "draft" | "rewrite", text?, selection?, instruction? }` returning `{ text }`.
- Draft writes the full scene in the channel's form, using `scriptFormForKind`.
- Rewrite returns only a replacement for the selection, and the page swaps it in.
- Both use the world's real names and details and never rename anyone.
- **Channel knowledge is a hard rule:** the prompt gets only the secrets this channel may know. Others' secret text must not be in the prompt at all. Add a test. Budget route `script-draft`, 1 cent.

**`POST /api/script/check`** `{ world, channelId, partId, text }` returning `{ issues: [{ kind: "contradiction" | "leak", quote, problem, fix }] }`.
- Here the model does see all secrets and who may know them, in order to spot leaks. It must never repeat a secret from another channel in `problem` or `fix`, and the route drops any issue that does.
- `quote` must be an exact substring of `text`. Drop any that isn't.
- Empty `issues` shows "Nothing to fix. This matches your story."
- Budget route `script-check`, 1 cent.

UI:
- "Draft this scene". If the scene already has text, confirm first: "Replace this draft?" with "Replace it" and "Keep my draft". "Rewrite selection" is disabled with no selection.
- "Check this script" shows each issue as a card with its problem and "Show fix" and "Keep it". "Show fix" reveals the fix with an "Apply" pill, which replaces the quote in the text. An issue's quote gets a stronger highlight on the page.
- "In this scene": the beat's characters with round art, and a play button when the character has a saved line, playing the most recent. Disabled otherwise.
- Do not add "Turn this into a short" yet. The video task adds it.
- With no model key or over budget, show the route's message where the action was.

## 6. Agent package

Add scripts to the package, only for that channel, as `scripts/<part-id>.txt`, and show them in the file tree. Add a test that another channel's script isn't included.

## Tests

Cover the knowledge rule, dropped quotes, dropped leaks, the merge, and the package rule.

You can't run a server in your sandbox, so say what you could not check.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
