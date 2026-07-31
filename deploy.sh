#!/usr/bin/env bash
#
# One-command deploy for familie-opgaver.
# Commits all changes to main, pushes, and then waits for the new version to
# actually appear on kh-opgaver.netlify.app before reporting success.
#
# That last part matters: this script used to print "Netlify is now building"
# unconditionally, so when Netlify started skipping builds (2026-07-19, account
# credit limit) every deploy still looked like it had worked. Six commits piled
# up unpublished before anyone noticed. A push is not a deploy — so we check.
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

# Poll the live service worker rather than the Netlify API: it needs no CLI, no
# login and no site id, and it answers the question we actually care about —
# has the new version reached the devices the family uses?
default_site="https://kh-opgaver.netlify.app"
site="${DEPLOY_URL_BASE:-$default_site}"
timeout="${DEPLOY_TIMEOUT:-180}"

echo ""
echo "Pushed. Waiting for $site to publish $next …"

live=""
deadline=$((SECONDS + timeout))
while ((SECONDS < deadline)); do
  # cache-buster: the CDN may hold a stale copy even with must-revalidate.
  live="$(curl -fsS --max-time 10 "$site/service-worker.js?cb=$RANDOM" 2>/dev/null \
    | grep -oE 'familie-opgaver-v[0-9]+' | head -1 || true)"
  if [ "$live" = "$next" ]; then
    echo ""
    echo "✅ Live at $site/ ($next)"
    exit 0
  fi
  sleep 5
done

echo ""
echo "⚠️  NOT PUBLISHED after ${timeout}s."
echo "   Expected: $next"
echo "   Live now: ${live:-could not reach the site}"
echo ""
echo "   Your commit is safely on GitHub — nothing is lost, it just isn't served yet."
# Only the real site is served by our Netlify project; pointing at a deploy log
# for some other host would be misleading.
if [ "$site" = "$default_site" ]; then
  echo "   Check the deploy log:  https://app.netlify.com/projects/kh-opgaver/deploys"
  echo "   (If builds say \"Skipped due to account credit usage exceeded\", that is"
  echo "    the account limit, not your code — it resets at the usage period start.)"
fi
exit 1
