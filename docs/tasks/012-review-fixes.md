# Task 012 review fixes

You are on the branch for pull request (task/012-script). I tested with real Muse calls. Draft, highlighting, saving, scene list and leak detection all work. Make only these fixes.

1. **"Apply" pastes advice into the script.** For the line "Anukili is a small and gentle woman from Lagos." the model returned the fix "Remove this description and replace it with the canon-consistent identity and origin.", and Apply put that sentence into the script. `fix` must be literal replacement text. Rename it `replacement` in the schema and code, and tell the model: "replacement is the exact script text that replaces the quote, written in the script's own form. Never describe an edit. Use an empty string only if the line should simply be removed." The UI shows the replacement as the new line, or "Remove this line" if it is empty. Add a test that applying an empty replacement removes the quote.

2. **Problems are too vague.** "This Series line contradicts canon for this figure's established traits and home." says nothing useful. Contradictions must say plainly what's wrong and what the canon says, using real names, such as "Anukili is a huge man in the canon, not a small woman." Only leak issues withhold details. They say which channel the information belongs to, without repeating it. Update the instructions. Keep the filter that drops issues repeating another channel's secret.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
