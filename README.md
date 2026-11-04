# Storyverse

Storyverse holds one master copy of a story world and shows how it plays across every channel: a series, a game, and shorts. Change one thing in the canon and it lists every scene the change breaks, proposes a fix per channel, and redraws the affected art with the same character. Each channel reveals only its own secrets, so the audience has a reason to follow the story everywhere.

## Models

- **Muse Spark** (`muse-spark-1.3`) plans the canon from the creator's files, lays out the channels, checks continuity, and proposes each ripple fix.
- **Muse Image** (`muse-image-1.0`) draws character sheets, scene art, and edits, chained with `previous_response_id` so a character stays on-model.
- **SAM 3.1** (`sam-3.1`) cuts characters out of their sheets for the agent package.
- **ElevenLabs** speaks the saved voice lines, because Meta has no text-to-speech model. Muse Spark chooses each character's voice and writes the line; ElevenLabs only speaks it.
- **Muse Code** wrote the application code, from task specs in `docs/tasks/`.

## Run it

```sh
pnpm install
```

Set `MODEL_API_KEY` (and optionally `ELEVENLABS_API_KEY` for character voices), then:

```sh
pnpm dev
```

Without a key the app runs in sample mode: the seeded story stays fully browsable, and generation endpoints explain they need a key.

## Provenance

**What was built during the hackathon:** all application code in this repo, from the first commit on Nov 3, 2026. **What existed before:** the idea and the story. Anukili Ugama is an Igbo myth; `docs/story/anukili-treatment.md` is an original retelling written for this project. All art in the repo was generated with Muse Image during the event.

**How it was built:** application code was written by Muse Code from task specs in `docs/tasks/`. Specs, design prototypes and pull request reviews were by Claude Code, directed by the project's owner.

## Third-party

This project uses `@meta-sam/parser` under the SAM License. See the license terms at [https://dev.meta.ai/](https://dev.meta.ai/).

Character voices are spoken by the [ElevenLabs](https://elevenlabs.io/) text-to-speech API; the app sends it only the chosen voice and the line to speak.

The scrolling landing page uses [GSAP](https://gsap.com/) (`gsap` and `@gsap/react`) under the GSAP Standard License (free of charge; see [https://gsap.com/standard-license](https://gsap.com/standard-license)) and [Lenis](https://lenis.darkroom.engineering/) (`lenis`) under the MIT License.

Short videos are rendered in the browser with [Remotion](https://www.remotion.dev/) (`remotion`, `@remotion/player`, `@remotion/media` and `@remotion/web-renderer`), used under its free license for individuals and companies of up to three employees (see [https://www.remotion.dev/docs/license](https://www.remotion.dev/docs/license)).
