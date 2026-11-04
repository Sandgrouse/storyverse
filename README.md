# Storyverse

Storyverse holds one master copy of a story world and shows how it plays across every channel: a series, a game, and shorts. Change one thing in the canon and it lists every scene the change breaks, proposes a fix per channel, and redraws the affected art with the same character. Each channel reveals only its own secrets, so the audience has a reason to follow the story everywhere.

## Models

- **Muse Spark** (`muse-spark-1.3`) plans the canon from the creator's files, lays out the channels, checks continuity, and proposes each ripple fix.
- **Muse Image** (`muse-image-1.0`) draws character sheets, scene art, and edits, chained with `previous_response_id` so a character stays on-model.
- **SAM 3.1** (`sam-3.1`) cuts characters out of their sheets for the agent package.
- **Fish Audio** is the live voice provider and speaks the saved voice lines, because Meta has no text-to-speech model. Muse Spark chooses each character's voice and writes the line; Fish Audio only speaks it.
- **ElevenLabs** is an optional, untested fallback provider: kept in the code for when a key is added. See [Known limitations](docs/KNOWN-LIMITATIONS.md).
- **Muse Code** wrote the application code, from task specs in `docs/tasks/`.

## Run it

```sh
pnpm install
```

Set `MODEL_API_KEY` (and optionally `FISH_API_KEY` for character voices — or `ELEVENLABS_API_KEY` with `VOICE_PROVIDER=elevenlabs` — and `VOICE_OWNER_CODE` for custom voices), then:

```sh
pnpm dev
```

Without a key the app runs in sample mode: the seeded story stays fully browsable, and generation endpoints explain they need a key.

## Provenance

**What was built during the hackathon:** all application code in this repo, from the first commit on Nov 3, 2026. **What existed before:** the idea and the story. Anukili Ugama is an Igbo myth; `docs/story/anukili-treatment.md` is an original retelling written for this project. All art in the repo was generated with Muse Image during the event.

**How it was built:** application code was written by Muse Code from task specs in `docs/tasks/`. Specs, design prototypes and pull request reviews were by Claude Code, directed by the project's owner.

## Third-party

This project uses `@meta-sam/parser` under the SAM License. See the license terms at [https://dev.meta.ai/](https://dev.meta.ai/).

Character voices are spoken by the [Fish Audio](https://fish.audio/) text-to-speech API; the app sends it only the chosen voice and the line to speak. [ElevenLabs](https://elevenlabs.io/) is kept as an optional provider. Some things are built but untested: see [Known limitations](docs/KNOWN-LIMITATIONS.md).

## Custom voices

A project owner can make a custom voice for a character from their own recording, an uploaded sample, recordings from a voice artist reached by a link (`/voice/[token]`), or — Fish Audio only — by describing the voice and letting Muse imagine it.

- **Owner code.** Custom voices spend the owner's voice slots, so creating invites, listing or deleting submissions, creating a custom voice, and speaking with one all need the header `x-voice-owner-code` (server only, `VOICE_OWNER_CODE`). After 10 wrong codes from one address in an hour the server returns 429. The drawer keeps the entered code in `sessionStorage`, never in the world or the URL.
- **Saying names properly.** Under Voice, "How names are said" lists names and how they should sound ("Enyinyi" → "eh-yin-yi"). Only spoken audio uses it; the story keeps the real names everywhere.
- **Consent.** Recording and uploading stay disabled until the owner ticks "I have the right and the speaker's consent to create an AI voice from this audio." Artists give their name and tick their own consent on the artist page; the owner sees that record beside each take, and it is stored on the character's voice.
- **Reading lines.** `POST /api/voice/lines` has Muse Spark write 8 to 12 lines from the story material (about 90 seconds, varied emotion). Secrets never reach the prompt.
- **Storage.** Audio lives in Vercel Blob in production and under `.data/voice/` locally. Files are at most 4MB of audio, 12 per character per invite, and invites expire after 14 days.

The scrolling landing page uses [GSAP](https://gsap.com/) (`gsap` and `@gsap/react`) under the GSAP Standard License (free of charge; see [https://gsap.com/standard-license](https://gsap.com/standard-license)) and [Lenis](https://lenis.darkroom.engineering/) (`lenis`) under the MIT License.
