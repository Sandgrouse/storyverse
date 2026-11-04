# Task 011: Custom voices: record, upload, or ask a voice artist

Build on task 010. The design is `docs/design/voice.html`: follow its layout and copy. A project owner can create a custom ElevenLabs voice for a character from their own recording, an uploaded sample, or recordings from a voice artist reached by a link. You have no API keys and must not look for any: test with mocks. You must not deploy anything.

## 1. Protect the owner's account

The app has no logins, and custom voices use up the owner's ElevenLabs voice slots. A stranger must never be able to clone a voice with the owner's key.

- New environment variable `VOICE_OWNER_CODE`, server only. Add it to `.env.example` and the key-grep test.
- Creating an invite, listing or deleting submissions, creating a custom voice, and speaking with a custom voice all require header `x-voice-owner-code`, compared in constant time. After 10 wrong attempts from one hashed IP in an hour, return 429.
- If it is unset, or the visitor hasn't entered it, the custom voice area shows "Custom voices are for this project's owner." with a code field and nothing else. Keep the entered code in `sessionStorage`, never in the world or the URL.
- `/api/voice/speak` accepts a premade voice from the list without the code. Any other voice needs the code.

## 2. Consent

- Owner record and upload: a required checkbox, "I have the right and the speaker's consent to create an AI voice from this audio." Creating a voice stays disabled until it is ticked.
- Artist page: name field plus a required checkbox, "I'm the person speaking, and I agree that the owner of {project title} may create an AI voice from these recordings for the characters listed here." Store name, the wording shown and a timestamp with the submission. Show this record to the owner beside each artist's takes, and store it on the character's `voice` when the voice is created.

## 3. Reading lines

`POST /api/voice/lines` `{ world, characterId }` (owner code required). Muse Spark picks 8 to 12 lines this character would say, taken from or true to the material, together taking about 90 seconds to read aloud, with varied emotion. Strip images. **Never include anything from `secrets`, or a character's `secret`,** and add a test that secret text is absent from the prompt. The owner can edit, add and remove lines before using them.

## 4. Storage

Add `lib/voice-store.ts`:
- With `BLOB_READ_WRITE_TOKEN`: Vercel Blob with random suffixes.
- Without it: files under `.data/voice/`. Add `.data/` to `.gitignore`.

Each file is at most 4MB, with audio types only. An invite holds at most 12 files per character. Invite tokens come from `crypto.randomBytes(24)` in base64url and expire after 14 days.

Routes, with validation and calm errors:
- `POST /api/voice/invites` (owner): `{ projectTitle, note, characters: [{ id, name, brief, lines }] }`, returns `{ token, url }`. The invite stores only these fields, so no canon or secrets. Add a test.
- `GET /api/voice/invites/[token]` (public): the invite, without any owner data. Expired or unknown gives a calm 404.
- `POST /api/voice/invites/[token]/files` (public): one recording as multipart, with character id, line index, artist name and consent.
- `GET /api/voice/invites/[token]/files` (owner): the submissions.
- `DELETE /api/voice/invites/[token]` (owner): removes the invite and all its files.
- `POST /api/voice/samples` (owner): stores an owner recording or upload the same way, under a per-character prefix, returning a sample id.

## 5. Creating the voice

`POST /api/voice/custom` (owner): `{ characterName, sampleIds, consent }`. The server reads the files and calls `POST https://api.elevenlabs.io/v1/voices/add` as multipart, with `name`, `files`, `remove_background_noise: false`, and a description. Returns `{ voiceId, requiresVerification }`. Map a plan or voice-limit error to: "Your ElevenLabs plan can't add another custom voice. Check your plan or remove a voice there." After success, offer to delete the source recordings.

Set `character.voice` to `{ id, name, kind: "custom", source, consent }`, extending the schema with optional fields. Custom voices appear at the top of the voice select.

## 6. Recorder

One shared `components/voice/Recorder.tsx`, used in the drawer and on the artist page.

- `MediaRecorder`, preferring `audio/mp4` then `audio/webm`, with echo cancellation, noise suppression and auto gain turned off for clean samples.
- One line at a time: the line shown large, Record, Stop, Play back, Retake, Next. Show a simple level meter so people can see they're being heard.
- Show total recorded length, from `decodeAudioData`. Under 10 seconds: can't continue. Under 60 seconds: "One to two minutes works best." Over 3 minutes: "Three minutes is plenty."
- Upload option takes MP3, WAV or M4A.
- Handle a refused microphone or no `MediaRecorder` with a plain message and the upload option.
- Set `Permissions-Policy: microphone=(self)`.

## 7. Characters drawer

Under Voice, add "Make a custom voice", with the three options in the design: **Record**, **Upload**, **Ask a voice artist**. Ask a voice artist:
- Choose one or more characters, edit each one's brief and lines, add a note, and press "Create link", then show the link with a Copy button.
- "Check for recordings" lists each artist's takes per character, with play controls and the consent record. Choose takes, then "Create this voice".

## 8. Artist page

`/voice/[token]`, in the existing paper style with no project navigation, `noindex`. It shows the project title, the owner's note, each character with its brief and lines, the Recorder, name and consent, and "Send recordings". It works at phone width. It must show nothing else from the project. On success: "Thanks, your recordings were sent."

## 9. README

Explain custom voices, the owner code and consent, and add the new variables.

## Tests

Mock `fetch` and storage. Cover the owner code, lockout, consent being required, secrets absent from lines and invites, file limits, token expiry, and voice limit error mapping.

You can't run a server or a microphone in your sandbox, so say what you could not check.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
