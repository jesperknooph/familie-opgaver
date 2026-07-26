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

# Auto-bump the service-worker cache version. Static assets are served
# cache-first, so already-installed devices only pick up new files when the
# cache name changes — doing it here means it can never be forgotten.
sw="service-worker.js"
cur="$(grep -oE 'familie-opgaver-v[0-9]+' "$sw" | head -1)"
num="${cur##*-v}"
next="familie-opgaver-v$((num + 1))"
tmp="$(mktemp)"
sed "s/familie-opgaver-v${num}/${next}/" "$sw" > "$tmp" && mv "$tmp" "$sw"
echo "Bumped service-worker cache: $cur → $next"

git add -A
git commit -m "$msg"
git push

echo ""
echo "✅ Pushed to GitHub. Netlify is now building."
echo "   Live in ~30s at https://kh-opgaver.netlify.app/"
