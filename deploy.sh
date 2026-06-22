#!/usr/bin/env bash
#
# One-command deploy for familie-opgaver.
# Commits all changes to main and pushes — Netlify then auto-publishes
# kh-opgaver.netlify.app within ~30 seconds.
#
# Usage:
#   ./deploy.sh "describe what you changed"
#
set -euo pipefail

# Always run from the project folder, no matter where you call it from.
cd "$(dirname "$0")"

msg="${1:-}"
if [ -z "$msg" ]; then
  echo "Usage: ./deploy.sh \"describe what you changed\""
  exit 1
fi

# Nothing staged or unstaged? Don't make an empty commit.
if git diff --quiet && git diff --cached --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "No changes to deploy — working tree is clean."
  exit 0
fi

git add -A
git commit -m "$msg"
git push

echo ""
echo "✅ Pushed to GitHub. Netlify is now building."
echo "   Live in ~30s at https://kh-opgaver.netlify.app/"
