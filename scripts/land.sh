#!/usr/bin/env bash
# Lands a work branch on main with every commit signed by YOUR key, so
# GitHub shows them as Verified. Run from your own clone:
#
#   scripts/land.sh            # lands the branch "claude/next"
#   scripts/land.sh my-branch  # or any other branch
#
# It re-signs the branch's commits on top of main (keeping their author and
# message), fast-forwards main, pushes, and deletes the branch.
# Needs commit signing set up once (see the README, "Signed commits").
set -euo pipefail
branch="${1:-claude/next}"

if [ "$(git config --get commit.gpgsign || true)" != "true" ] || [ -z "$(git config --get user.signingkey || true)" ]; then
  echo "Set up commit signing first (README → Signed commits)." >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "You have uncommitted changes; commit or stash them first." >&2
  exit 1
fi

git fetch origin main "$branch"
git switch main
git pull --ff-only origin main
count=$(git rev-list --count "main..origin/$branch")
if [ "$count" = 0 ]; then echo "Nothing new on $branch."; exit 0; fi
echo "Signing and landing $count commit(s) from $branch…"

git switch -C "land-$$" "origin/$branch"
git rebase main --exec 'git commit --amend --no-edit --no-verify -S --quiet'
git switch main
git merge --ff-only "land-$$"
git branch -D "land-$$"

git log --show-signature -1 --format='%h %an: %s' | tail -n 3
git push origin main
git push origin --delete "$branch"
echo "Done: $count verified commit(s) on main."
