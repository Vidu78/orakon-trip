#!/usr/bin/env bash
# Start the API and the SvelteKit dashboard together.
# Prefers tmux (true split panes); falls back to running both with prefixed,
# interleaved output in a single terminal. Ctrl-C stops everything.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_CMD="npm run dev:api"
DASH_CMD="npm run dev:dashboard"

if command -v tmux >/dev/null 2>&1; then
  SESSION="orakon-trip"
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  tmux new-session -d -s "$SESSION" -n dev "cd '$ROOT' && $API_CMD"
  tmux split-window -h -t "$SESSION" "cd '$ROOT' && $DASH_CMD"
  tmux select-layout -t "$SESSION" even-horizontal
  echo "Started tmux session '$SESSION' (API | dashboard). Attaching…"
  exec tmux attach -t "$SESSION"
fi

echo "tmux not found — running API + dashboard in this terminal (Ctrl-C to stop)."
$API_CMD &
API_PID=$!
$DASH_CMD &
DASH_PID=$!
trap 'kill "$API_PID" "$DASH_PID" 2>/dev/null || true' EXIT INT TERM
wait
