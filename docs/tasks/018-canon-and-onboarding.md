# Task 018: The book, story basics, channel wording and scene notes

The owner approved `docs/design/canon.html` (open it and follow it exactly: layout, copy, hover, sample content). You have no API keys and must not look for any: test with mocks. You must not deploy anything. Other tasks run at the same time and edit the Script, Video, Characters and Agent package pages, so **do not touch** `app/projects/[id]/script`, `app/projects/[id]/video`, `components/experience/CastDrawer.tsx`, `components/experience/PackDrawer.tsx`, `lib/package.ts`, `lib/script.ts` or `lib/video.ts`. Put new CSS in `app/canon.css`.

Where each prototype tab goes in the app:
1. **Read my story** (`components/experience/ReadingScene.tsx`, routes `/projects/new/reading` and `/projects/[id]/reading`): while Muse is reading, names light up and cards arrive, as now. When it finishes, the same page is the book of tab 1: contents, a scrollable page, highlighted names, and the characters and places panel. The text must never be cut off: the page scrolls inside the book.
2. **What I understood** (`UnderstoodScene.tsx`): add the story basics of tab 2.
3. **The channels page** (`ChannelsScene.tsx`): reword and fix per tab 3.
4. **Scene notes** (`StoryPackDrawer.tsx`): rename and restyle per tab 4.

## 1. Data

Add to `PartSchema`: `text: z.string().default("")`, the verbatim passage of the source that belongs to that part. Add to `WorldSchema`: `facts: z.array(FactSchema).default([])`, where a fact is `{ id, label, value, source: "material" | "muse" | "you" }`. An empty `value` means "not in your material yet".

Update the read and plan structured-output schemas (every property in `required`, optional ones nullable) so Muse Spark returns `facts` and each part's `text`. Facts are chosen to suit the kind of story: for fiction, kind of story, genre, where, when, tone, told as, themes, who it's for, language and voice; for an ad, product, audience, promise, call to action, tone, where it runs; for a documentary, subject, people, question, where, when. Muse picks the labels, includes empty ones for what matters but is missing, and sets `source` to "material" only when the material states it. Real names and details only.

Update `data/seed/anukili.json`: set each part's `text` from the matching section of `docs/story/anukili-treatment.md` (verbatim), and set `facts` exactly as the prototype's tab 2 shows, with the same sources. `mergeWorldAssets` keeps facts. Old worlds still load: when a part has no `text`, the book shows its summary then its excerpt.

Extend `ChannelKindSchema` to `["game", "series", "shorts", "press", "film", "website", "ad", "other"]`, in exactly that order. Another task makes the same edit.

## 2. The book

- **Contents:** one entry per part, with a progress bar; clicking scrolls the page to that chapter.
- **Page:** a cover (title, logline, chips from the facts), then each chapter: number, title, italic summary, text.
- **Highlights:** character names and place names (from `locations`) in the text. Match whole names, case-insensitively, and also the name without a leading "The". A character highlight is amber and a place highlight is teal. Clicking one focuses its card.
- **Right panel:** tabs Characters and Places, as a vertical list of compact cards. The focused card opens large, with its art, name and canon text, and "Appears in N of M chapters", plus a button "Open in Characters" going to `/projects/[id]/characters?c=<character-id>` (places have no button). Clicking a compact card focuses it. It scales to any number of characters.
- **Canon button:** on the Story page (`WorldScene.tsx`), beside the Scene notes button, add a "Canon" button opening `/projects/[id]/canon`, a page showing the same book with no reading animation. Its Back goes to Story. Do not add it to the top bar. Update `lib/nav.ts` and its test.
- Narrow screens: contents collapses into a select, the panel goes below the page.

## 3. Story basics (What I understood)

The facts grid of tab 2: each fact card with its label, value and source line ("From your treatment", "My reading", "You edited this"); hover shows Edit, which edits inline and saves with `source: "you"`; empty facts show the dashed "Not in your material yet" card with Add. Keep the existing questions list and buttons.

## 4. Channels page

Title "Choose the screens it will live on." with kicker "Where your story goes", and the subtitle from tab 3. The subtitle must be fully visible, with the cards below it and never over it. Cards keep their content. Add the dashed "Add a screen" tile: it asks for a kind (Series, Game, Shorts, Film, Website, Ad, Other) and a name, and adds a channel with no secret (a secret is optional). Rename the page's button to "Open my world". Keep the secret-accepting behaviour.

## 5. Scene notes

Rename "Story pack" to "Scene notes" everywhere users see it: the Story page button, the drawer, the README and the package labels if any. Replace the blank drawer with tab 4: before generating, each section card (Scene outline, Shot ideas, Posts, Reveals) shows what it will contain; after generating, the same cards hold the content. Keep copy, download and the channel chips.

## Tests

Cover the schemas and seed, highlight matching (whole names, "The" form, no partial words), the empty-fact path, `mergeWorldAssets`, the nav test, and the old-world fallback.

You can't run a server in your sandbox, so say what you could not check.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
