# Task 008: Real pages, real navigation, many projects

The project owner tested the app and the flow fails basic expectations. It is one page with hash scenes and a single saved story. Nobody can go back, go home, or keep two stories. Fix the structure and behaviour. Keep the visual language in `app/globals.css` (fonts, colours, pills, scene look). Do not redesign any scene. You must not deploy anything, and you have no API key: test model paths with mocks.

Do not touch `docs/design/`. A new landing page design comes in a later task.

## 1. Routes

Replace hash scenes with real App Router pages. The browser's Back and Forward buttons, reload, and pasted links must all work.

| Path | Shows |
|---|---|
| `/` | Today's arrival scene |
| `/projects` | Your projects (section 3) |
| `/projects/new` | The two doors: "I already have material" and "I have an idea" |
| `/projects/new/idea` | Idea scene |
| `/projects/new/material` | Bring scene |
| `/projects/new/reading` | Reading scene |
| `/projects/[id]` | Redirects to `/projects/[id]/story` |
| `/projects/[id]/understood` | Understood scene |
| `/projects/[id]/channels` | Channels scene |
| `/projects/[id]/material` | Bring scene, adding to this project (section 5) |
| `/projects/[id]/reading` | Reading scene for added material |
| `/projects/[id]/story` | World scene, Story section |
| `/projects/[id]/characters` | World scene, Characters drawer open |
| `/projects/[id]/story-pack` | World scene, Story Pack drawer open, when it is opened from a part |
| `/projects/[id]/package` | World scene, Agent package drawer open |

Notes:
- Use one catch-all client page for the Story, Characters, Story Pack and Package paths, so World scene state, such as a running ripple, survives moving between those sections. Opening or closing a drawer changes the URL.
- Hold in-progress files and idea text in a client provider in `app/projects/layout.tsx`, so they survive moving between the `new` pages. After a reload they are gone: `/projects/new/reading` with no files redirects to `/projects/new/material`.
- An unknown project id shows a calm "We couldn't find that story" message with a link to Your projects.
- `/` buttons: "I already have material" goes to `/projects/new/material`, "I have an idea" to `/projects/new/idea`. Add a quiet "Your projects" link at the top right of `/`.

## 2. Top bar

Add one shared top bar to every `/projects` page, in the existing style, staying clear of scene content:

- **Left, in this order:** a Back button where the page has a parent, the Storyverse logo linking to `/`, and a "Your projects" link. On project pages, then the story's title.
- **Right, on Story, Characters and Package pages:** the existing section links (Story, Characters, Agent package). Move them out of `WorldScene` into the bar.

Back goes to the page's parent, and never leaves the user with lost work:

| Page | Back goes to |
|---|---|
| `/projects/new` | `/projects` |
| `new/idea`, `new/material` | `/projects/new` |
| `new/reading` | `new/material` |
| `[id]/understood` | `/projects` |
| `[id]/channels` | `[id]/understood` |
| `[id]/story`, `characters`, `package`, `story-pack` | `[id]/channels` |
| `[id]/material` | `[id]/understood` |
| `[id]/reading` | `[id]/material` |

Remove the duplicate Back buttons in scene footers. Forward actions stay at the right of the footer. Leaving `new/reading` while a read is running cancels it.

Remove **Start over** everywhere. Deleting now lives on Your projects.

## 3. Your projects

Add `lib/projects.ts`, a small store with unit tests.

- Keep an index in `localStorage` under one key: id, title, updatedAt, sample flag, cover image path. Keep each world under its own key, with image data stripped as `persistWorld` does now. Images stay in IndexedDB keyed by world id, so each project's images are separate. Move persistence from `sessionStorage` to this store.
- Every new world gets a unique id, a slug of the title plus a short random suffix, so two stories with the same title never collide. The sample keeps the seed's id.
- All access wraps storage in try/catch. Discard an entry that fails `WorldSchema.safeParse`, without crashing. Render from a safe initial state, then load in an effect, so there are no hydration errors.
- Old saved data in `sessionStorage` can be ignored.

The page:
- Heading "Your projects". A pill "New story" going to `/projects/new`. Small quiet text: "Saved in this browser."
- A grid of cards: cover art or tint, title, "Sample" label if it is the sample, and "Edited" with a relative time. Clicking a card opens `/projects/[id]/story`, or `/projects/[id]/understood` if the channels step was never confirmed. Record that as a field in the index.
- The sample always appears, even if never opened, as "Anukili Ugama".
- Each card has a quiet "Delete" action with a confirmation dialog: "Delete {title}?" / "This removes the story and its images from this browser. This can't be undone." Buttons: "Delete story", "Keep story". It also clears the project's images.
- The sample's action is instead "Reset sample", with: "Reset the sample?" / "This removes your changes to the sample and restores the original." Buttons: "Reset sample", "Keep my changes".
- Empty case cannot occur, because the sample is always there.

## 4. Reading never moves on by itself

Remove every timer that calls `onDone` in `ReadingScene`, for real and sample results alike. The reading result stays on screen, with its highlighted passage and the characters found, until the user acts.

- While reading: the existing status, with the forward button disabled.
- When finished: the status becomes "Finished reading", and a pill **See what I found** appears at the right of the footer. Only that goes to `/projects/[id]/understood`.
- The project is created in the store when reading finishes, not before.
- On failure: show the existing message, a "Try again" pill, and the Back button.

Sample path: on Bring, "Use the sample project" fills the fan as now. "Read my story" goes to `/projects/new/reading`, which shows the sample read, labelled "Sample", then waits in the same way. Going through this path opens the one sample project and makes no second copy.

## 5. Add more material keeps what's there

On Understood, "Add more material" goes to `/projects/[id]/material`.

- The fan shows files already in memory for this project. After a reload, it starts empty, with the note "Your earlier files have already been read. Add anything new."
- "Read my story" becomes "Read what's new", disabled until a new file is added. For the sample it stays disabled, with the note "This is the sample. Start a new story to read your own files."
- The read sends only the new files, plus one generated text file holding the current canon (parts, characters, locations), named `current-story.txt`. The instruction asks the model to return the whole story with the new material merged in. Keep the same route and schema.
- On the result, keep existing sheets, cutouts, art and images for characters and parts whose names or titles match, case-insensitively. Add a unit test for this merge function.
- The Reading page behaves as in section 4, and its button returns to `[id]/understood`.

## 6. Small fixes

- Add `suppressHydrationWarning` to `<body>` in `app/layout.tsx`. Browser extensions such as Grammarly add attributes there.
- The "Best on a larger screen" note stays for every page.
- Sample mode without an API key must still work on every path.
- Update any tests that depended on hash scenes.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass, and no console hydration errors appear. In your final message, list each route and how you checked it, and anything left undone.
