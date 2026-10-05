#!/usr/bin/env bash
# Собирает v2 из текущей ветки и выкладывает в папку v2/ ветки master (GitHub Pages: …/hello-world/v2/).
# Корень master (v1) не трогается.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_BRANCH="$(git -C "$ROOT" branch --show-current)"
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
node "$ROOT/scripts/build.mjs"
WT="$(mktemp -d)"
git -C "$ROOT" fetch -q origin master
git -C "$ROOT" worktree add -q "$WT" origin/master
trap 'git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT
rm -rf "$WT/v2"
mkdir -p "$WT/v2"
cp "$ROOT/index.html" "$WT/v2/"
cp -r "$ROOT/assets" "$WT/v2/"
cd "$WT"
git add -A v2
if git diff --cached --quiet; then
  echo "v2 без изменений"
  exit 0
fi
git commit -q -m "Публикация v2 «Гроза на бумаге» из ${SRC_BRANCH}@${SHA}" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LSu7PmUcKJDg349qbq36wT"
git push -q origin HEAD:master
echo "опубликовано: https://ysunde.github.io/hello-world/v2/"
