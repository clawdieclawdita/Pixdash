#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Stop any existing instance
pkill -f "packages/backend" 2>/dev/null || true
sleep 0.5

# Build everything
pnpm -r build

# Start backend in background
nohup pnpm --filter backend dev > /tmp/pixdash.log 2>&1 &
echo "PixDash starting... (PID: $!)"
echo "Logs: tail -f /tmp/pixdash.log"
echo "URL: http://192.168.1.200:3000"
