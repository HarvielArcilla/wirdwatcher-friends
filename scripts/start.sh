#!/usr/bin/env bash
# Starts wirdwatcher from this folder (installs what it needs the first time).
# If the app has fetched a new release (it leaves the tag in .update-to),
# this moves to it first, while nothing is running.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .update-to ]; then
  tag="$(cat .update-to)"
  rm -f .update-to
  if git rev-parse -q --verify "refs/tags/$tag" >/dev/null && [ -z "$(git status --porcelain --untracked-files=no)" ]; then
    lock_was="$(git rev-parse HEAD:package-lock.json 2>/dev/null || true)"
    if git reset -q --hard "$tag"; then
      echo "Updated wirdwatcher to $tag"
      # New dependencies only when they changed.
      [ "$lock_was" = "$(git rev-parse HEAD:package-lock.json 2>/dev/null || true)" ] || npm install --no-audit --no-fund
    fi
  else
    echo "Skipped the update to $tag: files in this folder have been changed."
  fi
fi

[ -d node_modules ] || npm install --no-audit --no-fund
export WIRDWATCHER_LAUNCHER=1
exec npm start
