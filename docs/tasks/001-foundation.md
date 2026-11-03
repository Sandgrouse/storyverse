# Task 001: App foundation and the story map

Build the app shell, the world data model, and every screen from the design prototype, driven by a seeded world. This task makes no model calls.

Read `docs/PRD.md`, then open `docs/design/prototype.html`. The prototype is the visual source of truth: match its colour tokens, fonts, spacing, layout and motion. Do not embed the HTML file; rebuild it as React components.

## Build

1. **Scaffold** a Next.js App Router project in the repo root with TypeScript, Tailwind and pnpm. Add the scripts `dev`, `build`, `lint`, `typecheck` and `test` (Vitest). Load the prototype's fonts with `next/font`. Move its colour values into CSS variables or the Tailwind theme.

2. **Data model** in `lib/world/`: zod schemas with inferred types for
   - `World`: id, title, premise, characters, locations, channels, beats, secrets
   - `Character`: id, name, canon (appearance and role), secret (optional), sheet (a list of `{ view, imagePath }`, empty for now)
   - `Channel`: id, name, kind (`game`, `series` or `press`), title
   - `Beat`: id, order, timeLabel, title, channelId, unitLabel (such as "Episode 2"), content (the scene text or level description), imagePath (optional), characterIds
   - `Secret`: id, text, knownThrough (channel ids), note
   - `RippleResult`: change, summary, and a list of `RippleFix` (id, beatId, problem, proposal, regeneratesImage, status of `pending`, `applied` or `rejected`)

3. **Seed world** at `data/seed/saltlight.json`, valid against the schema. Use the beats, channels, characters and secrets shown in the prototype. Write 2 to 4 sentences of real `content` for every beat, because later tasks will send this text to a model. Write `canon` for all four characters. The story must make sense before and after the change "Mara cut the lamp herself." No war, political or medical content.

4. **Storage** in `lib/storage/`: an interface with `getWorld`, `saveWorld`, `putFile` and `getFileUrl`. Implement only the local adapter, under the git-ignored `data/local/`. It falls back to the seed world when no saved world exists.

5. **Screens**, with the prototype's rail navigation:
   - `/` Story map: channels as rows, beats by order as columns, and the secrets row. The change bar sits at the bottom.
   - `/characters`: character picker, six sheet slots with empty placeholders, and the canon, secret and "used in" facts. "Used in" is computed from the beats.
   - `/package`: the package file tree and brief preview, computed from the world. The Export button can be disabled for now.
   - `/new`: premise form and the four steps. The button can be disabled for now.

6. **Ripple panel on the story map.** Submitting the change bar calls `POST /api/ripple`, which for now returns a fixture `RippleResult` from `data/seed/saltlight-ripple.json` matching the prototype's three fixes. Reproduce the prototype's behaviour:
   - The panel slides in, hit beats highlight one after another and scroll into view, and other beats dim.
   - Applying or rejecting a fix updates its card and the beat's flag, and the count updates.
   - Fix state lives in the client for now. Name the fixture clearly so it is easy to remove in a later task.

## Acceptance

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` all pass.
- Tests cover: the seed world and ripple fixture parse against the schemas, every beat's `channelId` and `characterIds` resolve, and the local storage adapter round-trips a world.
- At 1440x860 the story map looks like the prototype, and every screen renders without console errors.
- No model calls, no API keys, and no new environment variables are required.

## Do not

Add accounts, a database, or any model client. Add features not listed here.
