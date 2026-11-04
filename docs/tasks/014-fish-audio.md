# Task 014: Fish Audio as the live voice provider

The owner has Fish Audio API credits and won't pay for ElevenLabs yet. Make Fish Audio the live provider, and keep ElevenLabs in the code, unchanged in behaviour, for when a key is added. The voice screens stay as designed, with the additions below. You have no API keys and must not look for any: test with mocks. You must not deploy anything.

Schema: https://api.fish.audio/openapi.json. Auth is `Authorization: Bearer $FISH_API_KEY`.

## 1. Provider layer

Add `lib/voice-provider.ts`, with one small interface: `listVoices()`, `speak(voiceId, text, pronunciations)` and `createCustomVoice({ name, description, files })`. Move the ElevenLabs calls behind it, plus a new Fish Audio implementation. No route or component may call a voice service directly.

Choose the provider on the server: `VOICE_PROVIDER` if set (`fish` or `elevenlabs`), otherwise Fish when `FISH_API_KEY` is set, otherwise ElevenLabs when its key is set, otherwise none. None gives the existing "Voices aren't set up here yet." Add `FISH_API_KEY` and `VOICE_PROVIDER` to `.env.example` and the key-grep test.

`GET /api/voice/list` also returns `provider`, and the drawer's credit line reads "Voices by Fish Audio." or "Voices by ElevenLabs." accordingly.

## 2. Fish Audio calls

- **List:** `GET https://api.fish.audio/model?page_size=100&language=en&sort_by=score`, keeping `state === "trained"` and excluding `dmca_taken_down`. Map `_id`, `title`, `tags` to labels, and the first sample's `audio` to `previewUrl`. Cache for an hour as now. Check `sort_by` against the schema and drop it if it's not valid. With a valid owner code, also merge `self=true` models at the top.
- **Speak:** `POST https://api.fish.audio/v1/tts` with header `model: s2.1-pro` and JSON `{ text, reference_id, format: "mp3", mp3_bitrate: 128, normalize: true, latency: "normal" }`. Return the same `audioDataUrl`. The speak route's rules stay: listed voices without a code, anything else with the owner code. A 402 maps to "Your voice credits have run out."
- **Custom voice:** `POST https://api.fish.audio/model` as multipart: `type=tts`, `title`, `description`, `visibility=private`, `train_mode=fast`, and repeated `voices` file parts. Return `_id`. Fish requires audio samples of at least 10 seconds each, so join short takes on the client before sending, or show which are too short. Check the current Create Model schema, and map errors to calm messages.

Keep all owner code, consent, secret-free and limit rules from task 011.

## 3. Describe a voice (Fish Audio only)

Add a fourth option under "Make a custom voice", beside Record, Upload and Ask a voice artist: **Describe**, "Let Muse imagine it". Owner code required.

- `POST /api/voice/design` `{ world, characterId }`: Muse Spark writes a voice description of at most 300 characters from the character's canon, and a test line of at most 150 characters, avoiding secrets. Then call `POST https://api.fish.audio/v1/voice-design` with header `model: voice-design-1` and `{ instruction, reference_text, language: "en", n: 3 }`. Return the candidates' ids and audio as data URLs, with the description. Budget route `voice-design`, 3 cents. Check the audio format against the schema and label the data URL correctly.
- The drawer shows the editable description, and three candidates with play controls. "Use this voice" creates a private custom voice from the candidate's audio through `createCustomVoice`, and sets `character.voice` with `source: "designed"`. Consent isn't needed here, as no real speaker is involved.
- Hide this option for ElevenLabs.

## 4. Saying names properly

Igbo names may be mispronounced. Add to `WorldSchema`, with a `.default([])`: `pronunciations: [{ name, sayAs }]`. In the Voice section add a small "How names are said" list: name and "say it as", add and remove. Only spoken audio uses it. The story keeps real names everywhere. For Fish, send it as `pronunciation_dictionary: [{ items: [{ key: name, value: sayAs }] }]` after checking `PronunciationItem` in the schema. For ElevenLabs, replace the names in the sent text. Test both. `mergeWorldAssets` keeps it.

## 5. Document what's untested

Create `docs/KNOWN-LIMITATIONS.md`, linked from the README:
- ElevenLabs is built but has never been tested against the live service, because no paid key was available. Custom voices through ElevenLabs need a paid plan.
- The voice artist link needs a deployed app, with `BLOB_READ_WRITE_TOKEN` set.

Update the README's model section: Fish Audio is the live voice provider, ElevenLabs is optional and untested.

## Tests

Mock `fetch`. Cover provider selection, Fish mapping, tts headers and body, custom voice multipart fields, 402 mapping, designed voice flow, the pronunciation payloads, and secrets being absent from the design prompt.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
