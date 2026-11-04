# Task 025: Story views, visual style, channel cards and book polish

The owner tested the onboarding and Story page. You have no API keys and must not look for any: test with mocks. You must not deploy anything. Other tasks run at the same time and edit the landing page, the Characters page, the Script page and the Agent package page, so **do not touch** `components/landing/*`, `components/experience/CastDrawer.tsx`, `components/experience/PackDrawer.tsx`, `app/projects/[id]/script`, `lib/script.ts`, or `lib/package.ts` beyond the one named edit in section 3. Put new CSS in `app/canon.css`.

## 1. The book's side columns stay put

On the Read my story page, the Canon page and the Story page's Book view (section 2), the contents column on the left and the Characters and Places column on the right stay fixed while only the book page scrolls (sticky, filling the viewport height under the top bar). The owner must never scroll back up to reach another chapter. Give the cards in the right column bottom padding: the "Open in Characters" button on a focused card needs at least 16px of space below it, and never touches the card's bottom edge. Check it on a card with a short canon text such as "Anukili's father".

## 2. Story page: Timeline and Book views

On the Story page (`WorldScene.tsx`), add a quiet two-option switch, "Timeline" and "Book", at the top, beside the change bar's area but never over it. Timeline is the current view. Book is the Canon book: contents on the left, the book page, and the Characters and Places column on the right. The view is in the URL as `?view=book` (default timeline), survives reload, and is remembered per project. Remove the "Canon" button, and make `/projects/[id]/canon` redirect to `/projects/[id]/story?view=book`. Update `lib/nav.ts` and tests. The Story page's change bar and Scene notes stay in the Timeline view only.

## 3. Visual style

Every project needs a visual style, which drives its art, video and game. Add to `WorldSchema`: `visualStyle: z.object({ preset: z.string(), notes: z.string() }).default({ preset: "", notes: "" })`, and `FactSchema`-style provenance as `visualStyleSource: z.enum(["art", "muse", "you", ""]).default("")`.
- **Presets** (in `lib/style.ts`): "Painterly 2D", "Anime", "Comic book", "Stop-motion", "Low-poly 3D", "Pixel art", "Photoreal", "Watercolour", "Custom". Each has a short description and a prompt phrase.
- **The Understood page:** a "Visual style" card in the basics grid: a row of preset chips, a notes text box, and the line "From your art", "My reading" or "You chose this". When there is none yet, it shows the dashed card with "Choose a style". The read step asks Muse Spark to suggest one when art was provided (look at the art) or the text implies one, and the owner can change it.
- **The sample:** set `preset: "Painterly 2D"`, `notes: "Dark, mythic, painterly digital art, as in the project's existing art."`, source `"art"`, in `data/seed/anukili.json`, and extend the saved-sample upgrade from task 023 to fill it when empty.
- **It is used:** `lib/art.ts` appends the style's prompt phrase and notes to sheet, scene, cutout-free sketch (storyboard sketches stay pencil sketches), and video-shot prompts, only when a style is set. With no style, prompts are exactly as before (add a test). `design/art-bible.md` in the game package (one small edit in `lib/package.ts`) opens with the visual style. The Script draft prompts mention it in one line.
- Add tests: presets, prompt composition with and without a style, the seed, the upgrade, and the art-bible line.

## 4. Channel cards open an editor, not the world

On the channels page, clicking a screen card currently does the same thing as "Open my world". Change it: clicking a card opens a small editor panel for that screen (title, pitch, kind, an optional secret, and Remove with a confirm "Remove this screen?" / "Remove it" / "Keep it"), saved as you type. Only the "Open my world" button opens the world. Keyboard accessible. Update tests.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. Say what you could not check.
