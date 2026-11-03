# AGENTS.md

Muse Code reads this file as project rules. Muse Code writes this project's application code. Each task is specified in `docs/tasks/` and reviewed through a pull request.

## Read first

- `docs/PRD.md` for the product, stack and scope
- The task file you were given
- `docs/design/` for the UI, when the task touches it

## Rules

- Do only what the task asks. List anything else you notice in your final message.
- This repo is public, and all work must be new. Do not copy in code, data or assets you lack the rights to, and record any open source dependency in `package.json`.
- Never commit secrets. `MODEL_API_KEY` and other keys come from the environment and are used only on the server.
- Demo content must contain no war, political or medical-advice themes.
- Prefer small, plain code. No abstractions the task does not need.
- Every task must pass `pnpm lint`, `pnpm typecheck` and `pnpm build` before you finish. Add a test for any logic that is not UI.

## Finish

Commit your work on the current branch with a clear message. Do not push and do not open a pull request; the task runner does that. End with a short summary: what changed, how you checked it, and anything left undone.
