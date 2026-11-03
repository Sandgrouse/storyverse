# Task 002: Rebuild the app as the book experience

The owner approved `docs/design/book.html`. It is the visual and interaction source of truth. Open it and read all of it. Rebuild it as a real React app and replace the current screens. Match its colours, fonts, spacing, motion and copy exactly. Do not embed or iframe the HTML. Ignore `docs/design/experience.html`.

This task makes no model calls. Results stay scripted, but they must come from data files, never from strings in components.

## Build

1. **Assets.** Copy `docs/design/anukili/*.webp` to `public/anukili/`. Load the fonts with `next/font`.

2. **Data model.** Extend `lib/world/schemas.ts`:
   - Add `Part`: id, order, title, summary, excerpt, imagePath, tint, characterIds.
   - Add `partId` to `Beat`, and let a part hold beats from several channels.
   - Add `gaps` to `World`: a list of `{ id, question }`.
   - Add `artPath` to `Character`.
   - Add to `RippleFix` a `channelId`, `partId`, `title`, `problem`, `proposal` and `appliedMessage`.

3. **Seed world.** Replace the Saltlight data. Create `data/seed/anukili.json` from `docs/story/anukili-treatment.md`, and `data/seed/anukili-ripple.json` from the three `FIXES` in the prototype. Delete both Saltlight files and the "cut the lamp" test. Use the real names and details from the treatment. Do not invent or change any. The new seed must not state that Enyinyi gave them the plan, because that is the ripple. Add a test for that.

4. **One client experience, not separate pages.** `app/page.tsx` renders an `Experience` client component that holds the current scene: `arrival`, `idea`, `bring`, `reading`, `understood`, `channels`, `world`. Scenes cross-fade as in the prototype. Keep the scene in the URL hash, so reload and back work. Split components by scene under `components/experience/`. Remove the old `/characters`, `/package` and `/new` routes and the old components and CSS.

5. **Scenes**, each as in the prototype:
   - Arrival: curved gallery, rotating teaching lines, both doors.
   - Idea: the one question, then continues to Bring for now.
   - Bring: dropzone, fanned cards with speech-bubble tags, gap note. A real file input and drag and drop must accept files and show them as cards, with a tag from the file type. The prototype's click-to-load Anukili project stays as a clearly labelled "Use the sample project" button.
   - Reading: paper sheet with names highlighting, and character cards landing.
   - Understood: ring-bound open book, with gaps from the world data. "Keep it a secret" and "Answer now" can do nothing yet except mark the gap as handled.
   - Channels: three tall tilted story cards.
   - World: art panel, white desk, the book whose cover swings open, shelf of parts with channel threads, pill nav, ask bar.
   - Characters and Agent package drawers. Both are computed from world data.
   - Ripple: the shelf expands, hit parts tilt with stamps, cracks draw, fix cards arrive, and apply and keep update state. It calls `POST /api/ripple`, which still returns the fixture. Secret updates from the result are applied to the world state.

6. **Robustness.**
   - Respect `prefers-reduced-motion`.
   - Keyboard: all controls reach focus and work with Enter or Space.
   - Remove the prototype's "Design prototype" notice from the app.
   - No horizontal page scroll from 1280x720 up to 1920x1080, and text must not overlap the gallery at those sizes. Below 1100px wide, show a calm "Best on a larger screen" note instead of a broken layout.

## Acceptance

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass.
- Tests cover the new schemas and seed files, including every id reference resolving, and the ripple route.
- Grep confirms no component contains a character name, place name or story sentence, except the sample-project button label. Story text comes from data files. Interface copy such as "Bring me what you have." stays in components.
- Every scene renders without console errors.

## Do not

Add model calls, accounts, a database, or any feature not listed here.
