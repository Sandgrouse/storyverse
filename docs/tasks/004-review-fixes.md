# Task 004 review fixes

You are on the branch for pull request 4. I ran a real upload end to end. Reading and planning work, but the ripple then fails on any uploaded story. Make only these fixes.

## Must fix

1. **The ripple fails with a 400 when a world has no secrets.** `rippleModelJsonSchema` builds `enum: secretIds`. With no secrets that is an empty enum, which the API rejects. Omit `secretUpdates` from the schema's enum constraint when the list is empty, and handle the same case for beats and any other enum built from world data, in every route. On any API error, log the API's error message on the server, without the key, so failures can be diagnosed. Add tests for empty lists.

2. **Planning returned no secrets at all.** The plan for a real upload had `secrets: []`, though secrets are the whole point of the channels. Find out why, including whether valid secrets are being dropped. `knownThrough` refers to channel ids created in the same response, so they cannot come from a world enum, and must be validated against the returned channels instead. Make the schema require them and tell the model every channel must hold at least one. If the validated plan still has a channel with no secret, retry once, then continue with what exists. Show each channel's own secret on the Channels card, as in the design: "Only here: ...".

3. **Images are sent to the API in every ripple request.** The client sends its in-memory world, which holds image data URLs, to `/api/ripple`, `/apply` and `/check`. Vercel rejects requests over 4.5MB, so this breaks in production with enough art. Strip image data from the world before sending, with one helper used by all three calls. Add a test.

4. **A hardcoded change in the ask bar.** `DEFAULT_CHANGE` names a character and shows on every story. Use it only for the sample project, from the seed data. Otherwise leave the bar empty with the "What if…" placeholder, and disable the button until something is typed. Also move the Anukili-specific face crop out of `WorldScene.tsx` into seed data, so components hold no story content.

5. **Dropped files must all show.** In Bring, after a real drop of three files, only the first card was visible a few seconds later. Every dropped file must appear in the fan at once, with its image thumbnail, and the gap note must wrap inside the screen. Check this at 1280x720.

## Polish

6. **Understood.** The left page is blank when no art matches the story. Use the first available art from any file. With no art at all, use a tinted plate with the story's title.
7. **Logline.** The real result was "Fiction based on the Igbo myth...". Add to the read instructions: "The logline tells the story itself in one gripping sentence. It never describes the document."
8. **Channel names.** The plan returned "Omabala Tales" as a `name`, and long names collide in the shelf's lane labels. Add to the plan instructions: "name is one plain word for the format, such as Series, Game or Shorts. title is the name of the work." Lane labels stay on one line, with an ellipsis if needed.
9. **Typographic character cards.** Cards for characters with no art are blank with a tiny label. Set the name large and centred.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
