#!/usr/bin/env bash
set -euo pipefail

echo "=== nightshift build-time measurement ==="
echo "Date: $(date)"
echo "Bun:  $(bun --version)"
echo "Node: $(node --version)"
echo ""

echo "--- Cleaning node_modules/ ---"
rm -rf node_modules/
echo ""

echo "--- bun install ---"
time bun install
echo ""

echo "--- bun run test ---"
time bun run test
echo ""

echo "=== measurement complete ==="
