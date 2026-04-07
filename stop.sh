#!/usr/bin/env bash
set -euo pipefail
pkill -f "packages/backend" 2>/dev/null && echo "PixDash stopped." || echo "PixDash was not running."
