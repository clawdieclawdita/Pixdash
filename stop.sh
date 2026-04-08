#!/usr/bin/env bash
set -euo pipefail

PID_FILE="/tmp/pixdash.pid"
STOPPED=0

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    STOPPED=1
  fi
fi

pkill -f "dist/server.js" 2>/dev/null && STOPPED=1 || true
rm -f "$PID_FILE"

if [[ "$STOPPED" -eq 1 ]]; then
  echo "PixDash stopped."
else
  echo "PixDash was not running."
fi
