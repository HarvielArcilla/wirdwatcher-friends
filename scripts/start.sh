#!/usr/bin/env bash
# Starts wirdwatcher from this folder (installs what it needs the first time).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm install
npm start
