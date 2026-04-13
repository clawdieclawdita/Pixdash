#!/usr/bin/env bash
set -euo pipefail

PIXDASH_DIR="$HOME/.openclaw/pixdash"
PID_FILE="$PIXDASH_DIR/pixdash.pid"
STOPPED=0

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    STOPPED=1
  fi
fi

# Fallback: match only within the PixDash backend directory to avoid killing unrelated processes.
# This only runs if the PID file is missing or stale.
pkill -f "pixdash/packages/backend/dist/server.js" 2>/dev/null && STOPPED=1 || true
rm -f "$PID_FILE"

if [[ "$STOPPED" -eq 1 ]]; then
  echo "PixDash stopped."
else
  echo "PixDash was not running."
fi
