# Task 023: Upgrade saved projects, and art for places

The reviewer ran PR 18 in a browser. It works on a fresh sample project, but a project saved in the browser before it (the owner's sample is one) has no `facts` and no part `text`, so the Canon book shows only summaries and excerpts and the "What I understood" page shows no story basics. You must not deploy anything. You have no API keys: test with mocks. Touch only the files this needs.

## 1. Upgrade the saved sample

When a stored project is loaded (the store in `lib/projects.ts` and `components/projects/ProjectContext.tsx`), and its id is the sample's id (`anukili`), fill in what the seed has and the stored copy lacks: `facts` when empty, and each part's `text` when empty (match parts by id). Never overwrite anything the owner edited or made: scripts, storyboards, shorts, voices, lines, secrets, art, canon changes, facts that are already there. Save the upgraded world back. Add tests for: an old sample gains facts and part text; an edited fact survives; a stored sample with art and scripts keeps them all.

## 2. Story basics for any saved project

On the "What I understood" page, when a project has no facts, show one pill "Read the story's basics" in the facts area. It calls a new `POST /api/facts` `{ world }` (`maxDuration = 60`, the 4.5MB limit, zod validation, images stripped, budget route `facts`, 1 cent), where Muse Spark returns facts in the same shape as the read step does (reuse its prompt and schema), chosen to suit the kind of story, using real names only. Save them with their sources. Show budget and failure messages where the action was. Add tests with a mocked model.

## 3. Places need art

In the Canon book's Places tab the focused place card is a blank tan block. Use the art of the first part whose text, summary or excerpt names the place (whole-name, case-insensitive match), and fall back to the first part's art. Compact place cards use the same art as their thumbnail. Add a test for the chooser.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. Say what you could not check.
