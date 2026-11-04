# Task 010: Character voices with ElevenLabs

Give each character a voice. Muse Spark chooses and writes; ElevenLabs speaks, because Meta has no text-to-speech model. Work inside the existing Characters drawer, in its existing style. Add no new visual language. You have no API keys and must not look for any: test with mocks. You must not deploy anything.

## 1. Server

`ELEVENLABS_API_KEY` comes from the environment and is used only on the server. Add it to `.env.example`, and extend the test that greps client code for keys to cover it.

Add `lib/voice.ts`, and these routes, each with `maxDuration = 60`, the 4.5MB body limit and zod validation:

**`GET /api/voice/list`**
Calls `GET https://api.elevenlabs.io/v2/voices?category=premade&page_size=100` with header `xi-api-key`. Returns `{ voices: [{ id, name, labels, previewUrl }] }`. Cache it in memory for an hour. This task offers premade voices only. Custom voices come in task 011.

**`POST /api/voice/suggest`** `{ world, characterId, voices }`
Muse Spark (`muse-spark-1.3`, structured output) reads the character's canon and the voice list. It returns the best `voiceId`, a one-line reason, and one short line that this character would say, in character, true to the canon, of at most 160 characters. Reject a `voiceId` that isn't in the list. Strip images before sending. Budget route `voice-suggest`, 1 cent.

**`POST /api/voice/speak`** `{ voiceId, text }`
Calls `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}?output_format=mp3_44100_128` with `{ text, model_id: "eleven_multilingual_v2" }`. Returns `{ audioDataUrl }`, as a base64 `data:audio/mpeg` URL. Text is required and at most 300 characters. Budget route `voice-speak`, 2 cents.

Add a separate daily cap on ElevenLabs usage, `VOICE_DAILY_CHARS` (default 5000), using the same storage approach as `lib/budget.ts`. Over the cap, return 429 with `{ error: { code: "BUDGET", message: "Today's voice limit is used up." } }`.

Errors:
- No `ELEVENLABS_API_KEY`: return 503 with `{ error: { code: "NO_VOICE_KEY", message: "Voices aren't set up here yet." } }`.
- Other ElevenLabs failures: log status and message, never the key or audio, and return a calm message. Map 401 and quota errors to "The voice service isn't available right now."

## 2. Data

Add to `CharacterSchema`, as optional fields so old worlds still load:

- `voice`: `{ id, name, reason? }`
- `lines`: an array of `{ id, text, audioPath }`

Audio is stored like images: IndexedDB through the same store, with a stored ref in the world. It must be stripped from requests and from the persisted world, then restored, exactly as sheet images are. Extend `extractImageEntries`, `restoreImageRefs`, `dropStoredRefs` and `stripImageData` to cover it, with tests. `mergeWorldAssets` keeps `voice` and `lines` for matching characters.

## 3. Characters drawer

Add a "Voice" section for the selected character, below the character sheet.

- **Before a voice is chosen:** a pill "Find a voice", which loads the list and calls suggest. While working: "Listening for {name}'s voice…". The result shows the voice name, the reason, and the suggested line in the text box.
- **Choosing:** a select holding all premade voices, with the suggested one chosen. A quiet "Hear this voice" button plays `previewUrl`, without spending anything.
- **Lines:** a text box with the current line and a character count out of 300, and a pill "Speak this line". Saved lines appear as a list, each with play and remove controls, and the text. Only one plays at a time.
- **Credit:** small quiet text, "Voices by ElevenLabs."
- If the key is missing, the section shows only "Voices aren't set up here yet." and nothing else. Nothing breaks.
- Show budget and failure messages where the action was, as other drawer actions do. Don't block generating sheets or cutouts while audio is being made.

## 4. Agent package

In the Agent package ZIP, add each included character's saved lines as `characters/<id>/voice/<line-id>.mp3`, plus `characters/<id>/voice.json` listing voice name, voice id and each line's text. Show these in the package's file tree.

## 5. README

Add to "How each model is used": ElevenLabs speaks the lines, because Meta has no text-to-speech model, and Muse Spark chooses the voice and writes the line. Add it to the third-party section. Also add it to the secrets list in the run instructions as optional.

## 6. Small fix

On `/projects`, links show as blue and underlined, such as the "+ New story" tile. Add a global `a { color: inherit; text-decoration: none; }` and check that pills keep their own colours on every page.

## Tests

Mock `fetch`. Cover the list mapping, a suggested voice not in the list, text over 300 characters, the character cap, the missing key, and audio refs being stripped and restored.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
