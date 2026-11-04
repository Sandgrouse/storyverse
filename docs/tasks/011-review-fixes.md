# Task 011 review fixes

You are on the branch for custom voices. I tested the routes against a running server. The owner code, invites, secret-free payload and noindex all work. Make only these fixes.

1. **The artist page is blank below the note.** The class `.panel` already exists in `app/globals.css` (line 1122) for another screen, with `position: absolute` and a translate, so every panel on `/voice/[token]` sits off the screen at left 1289px. Rename the voice classes to a unique prefix, `.vx-` (`.vx-panel`, `.vx-line`, and so on), across `ArtistPage`, `CustomVoice` and `Recorder`, and check no other voice class collides with an existing one. Also `.logo` is absolute, so the artist page's logo overlaps "A voice request". Give it normal flow there. The page must scroll normally, including at phone width.

2. **Unchecked path inputs.** `readInvite` and others build file paths from `token`, and `getSample` from sample ids. Validate tokens against `^[A-Za-z0-9_-]{32}$` and file ids against the exact form `putAudio` generates, before any disk or Blob access, returning not found otherwise. Add tests with `../` inputs.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
