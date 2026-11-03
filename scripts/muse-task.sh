#!/usr/bin/env bash
# Runs one task file through Muse Code on its own branch, then opens a pull request.
# Usage: scripts/muse-task.sh docs/tasks/001-scaffold.md [branch-to-continue]
set -euo pipefail

task_file="$1"
slug="$(basename "$task_file" .md)"
branch="${2:-task/$slug}"
model="${MUSE_MODEL:-muse-spark-1.3-contributor}"
effort="${MUSE_EFFORT:-medium}"
max_steps="${MUSE_MAX_STEPS:-120}"
log_dir="$(mktemp -d)"
log="$log_dir/$slug.jsonl"

cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean. Commit or stash first." >&2
  exit 1
fi

git fetch origin --quiet
if [ $# -ge 2 ]; then
  git switch "$branch"
else
  git switch -c "$branch" origin/main
fi

prompt="$(mktemp)"
{
  echo "Follow the project rules in AGENTS.md. Your task:"
  echo
  cat "$task_file"
} > "$prompt"

muse exec \
  --json \
  --prompt-file "$prompt" \
  --model "$model" \
  --reasoning-effort "$effort" \
  --max-model-steps "$max_steps" \
  --approval-mode never \
  --trust-workspace \
  > "$log"

echo "Muse log: $log"

if [ -n "$(git status --porcelain)" ]; then
  git add -A
  staged="$(git diff --cached --name-only | wc -l | tr -d ' ')"
  if [ "$staged" -gt 200 ]; then
    git reset --quiet
    echo "Refusing to commit $staged leftover files. Check .gitignore." >&2
    exit 1
  fi
  git commit -m "$slug: uncommitted Muse Code changes"
fi

if [ "$(git rev-list --count "origin/main..HEAD")" = "0" ]; then
  echo "Muse Code made no commits." >&2
  exit 1
fi

git push -u origin "$branch"

if gh pr view "$branch" >/dev/null 2>&1; then
  echo "Updated existing pull request."
else
  body="$(mktemp)"
  {
    echo "Code written by Muse Code (\`$model\`, effort \`$effort\`) from \`$task_file\`."
    echo
    echo "Spec and review by Claude Code."
    echo
    echo "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
  } > "$body"
  gh pr create --base main --head "$branch" --title "$slug" --body-file "$body"
fi
