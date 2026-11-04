# Known limitations

Things that are built but untested, or that only work once the app is
deployed. Linked from the README; update this file when a limitation
is cleared.

- **ElevenLabs is untested against the live service.** The Fish Audio
  provider is the live one, and the ElevenLabs implementation is kept
  in the code, unchanged in behaviour, for when a key is added. No
  paid ElevenLabs key was available, so no ElevenLabs call in this
  repo has ever been run against the live service. Custom voices
  through ElevenLabs need a paid plan.
- **The voice artist link needs a deployed app.** Invite links
  (`/voice/[token]`) and artist recordings only work where the app is
  deployed, with `BLOB_READ_WRITE_TOKEN` set so audio and invites are
  stored in Vercel Blob. Without it the app falls back to local files,
  which do not survive serverless restarts.
