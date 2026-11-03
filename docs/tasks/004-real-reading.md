# Task 004: Really read the user's story

Make Bring, Reading, Understood and Channels real. Whatever the user drops becomes a world they can ripple. Do not change the visual design. You have no API key and must not look for one, so mock `fetch` in tests.

## Reading files

`POST /api/read` takes `{ files, idea? }` as JSON. Each file is `{ name, type, dataUrl }`, and `text` instead of `dataUrl` for text files.

- **Client side, before sending:**
  - Accept PDF, `.md`, `.txt`, and images.
  - Read text files as text.
  - Downscale each image in a canvas to at most 1024px on the long side, as WebP.
  - Vercel limits a request to 4.5MB. If the total is over 4MB, stop and tell the user which file is too large. Never fail silently.
  - Keep the original image data URLs in client state for display. Send only the downscaled copies.
- **Request to the model.** A user message whose content holds parts in this order: `input_text` listing the file names in order, then `{ "type": "input_file", "filename": name, "file_data": "data:application/pdf;base64,..." }` for each PDF, `input_text` for each text file, and `{ "type": "input_image", "image_url": dataUrl }` for each image. Extend `completeJson` so `input` may be this array, as `[{ role: "user", content }]`. A real test confirmed this shape works, at about 20 seconds.
- **Instructions, exactly:**

> You read a creator's raw story material and build its canon. Use only what the material says. Never rename anyone, and keep all names and details exactly. Split the story into its natural parts. An excerpt is a short retelling in your own words, never copied text. A gap is an important question the material leaves open. For each image, say who or what it shows. Set artFile on a character, or on a part, only if an image clearly shows them, otherwise leave it empty.

- **Output schema, strict:** `title`, `logline`, `files[]` (`file`, `kind` of `story`, `character_art`, `scene_art`, `other`, and `label`), `characters[]` (`id`, `name`, `canon`, `artFile`), `locations[]` (`id`, `name`, `description`), `parts[]` (`id`, `order`, `title`, `summary`, `excerpt`, `artFile`), `gaps[]` (`id`, `question`).
- **Idea path.** When `idea` is present and there are no files, use the same route. Add to the input: "This is only an idea. Build a first draft of the canon from it, and treat what you add as a draft for the creator to confirm."
- Set `maxDuration = 60`. Clear any `artFile` that names no sent file.

## Planning the channels

`POST /api/plan` takes the canon and returns `channels[]` (`id`, `name`, `kind` of `series`, `game`, `press`, `title`, `pitch`), `beats[]` (`id`, `partId`, `channelId`, `unitLabel`, `title`, `content`, `characterIds`) and `secrets[]` (`id`, `text`, `knownThrough`, `note`). Constrain the id references with enums in the schema, and drop anything that does not resolve.

Instructions, exactly:

> You plan how one story spreads across channels. Propose three channels unless the material names others. Give each channel its own piece of the story, so that each holds at least one secret the others don't, and fans must follow several to get the whole truth. Every part must appear in at least one channel. Beat content is two to four sentences. Invented secrets are additions: keep them consistent with the canon, and never change a name or an established detail.

`Channel` gains `pitch`. Add `pitch` to the seed. Give the seed's channels a colour by their position, not by kind, so three channels always read as distinct.

## Experience

- **Bring.**
  - Real dropped files fan out with tags. Tags start as the file name, then change to the model's `label` when the result arrives.
  - The gap note is written from the result, in code, from which kinds are present.
  - "Read my story" starts reading.
  - "Use the sample project" keeps loading the seed world with no model calls, and shows "Sample" on Reading.
- **Reading.**
  - Runs `/api/read`, then `/api/plan`.
  - The sheet shows the file names and honest status lines while waiting: "Reading your files", "Finding the people and places", "Planning your channels".
  - When the canon arrives, the sheet shows the parts' excerpts with character and place names highlighted, and cards land for each character, using their art or a calm typographic card if they have none.
  - Move on only after both calls finish, and at least 3 seconds after the canon arrives so people can see it.
  - Failure shows a plain message and a retry, and keeps the user's files.
- **Understood.** Uses the real logline, names and gaps. "Answer now" opens a small field, and the answer is added to `canonChanges`. "Keep it a secret" adds the gap to `secrets` with `knownThrough` empty and the note "Not revealed yet". Both mark the gap handled.
- **Channels.** Real channels, with real pitches and each channel's own secret. The card image is the art of a part that channel covers, or a calm tinted card if there is no art.
- **World.** A part with no art shows a tinted cover with its title. Drawers and the ripple use the new world. Clearing state returns to Arrival with a "Start over" control in the pill nav.
- World state stays in the client. Persist it to `sessionStorage` when it fits, ignoring failures, and do not store image data there.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Tests, with `fetch` mocked, cover: the request content order, dropping unresolved references, clearing bad `artFile`s, the size limit, the idea path, and read failure. No component holds story text. Without `MODEL_API_KEY`, `/api/read` and `/api/plan` return the seed with `sample: true`.
