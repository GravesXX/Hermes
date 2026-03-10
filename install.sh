#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$SCRIPT_DIR/plugin"

echo "[Hermes] Installing dependencies..."
cd "$PLUGIN_DIR" && npm install

echo "[Hermes] Verifying build..."
npx tsc --noEmit

echo "[Hermes] Running tests..."
npx vitest run

echo ""
echo "[Hermes] Installation complete."
echo ""
echo "To add Hermes to OpenClaw, add to ~/.openclaw/openclaw.json:"
echo "  agents.list: { \"hermes\": { \"name\": \"Hermes\", \"plugin\": \"$PLUGIN_DIR/src/index.ts\" } }"
echo "  workspaces: { \"hermes\": \"$SCRIPT_DIR/workspace\" }"
