#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PID_FILE="/tmp/pixdash.pid"
LOG_FILE="/tmp/pixdash.log"
HOST="192.168.1.200"
PORT="3000"

./stop.sh
sleep 1

pnpm -r build

# Conditional --watch flag: enabled when PIXDASH_DEV_MODE=true, default is production (no watch)
NODE_FLAGS=""
if [ "${PIXDASH_DEV_MODE:-}" = "true" ]; then
  NODE_FLAGS="--watch --enable-source-maps"
fi

pushd packages/backend >/dev/null
nohup node $NODE_FLAGS dist/server.js > "$LOG_FILE" 2>&1 &
PID=$!
popd >/dev/null

echo "$PID" > "$PID_FILE"

echo "PixDash starting... (PID: $PID)"
echo "Logs: tail -f $LOG_FILE"
echo "URL: http://$HOST:$PORT"

sleep 2

if ! kill -0 "$PID" 2>/dev/null; then
  echo "PixDash failed to start: process $PID is not running." >&2
  rm -f "$PID_FILE"
  exit 1
fi

if ! ss -ltnp | grep -q ":$PORT\b"; then
  echo "PixDash failed to bind port $PORT." >&2
  exit 1
fi

echo "PixDash started successfully."
