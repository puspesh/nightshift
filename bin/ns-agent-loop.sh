#!/usr/bin/env bash
# ns-agent-loop.sh — Run a single nightshift agent in a repeating loop.
# Usage: ns-agent-loop.sh <agent-name> <cwd> <interval-seconds> <runner-base> <status-file>
#
# Invokes Claude Code in non-interactive mode (--print -p "@<agent>")
# and sleeps between cycles. Writes status file updates so monitoring works.

set -euo pipefail

AGENT="$1"
CWD="$2"
INTERVAL="$3"
RUNNER_BASE="$4"
STATUS_FILE="$5"

# Clean up child process on SIGTERM/SIGINT
CHILD_PID=""
trap 'if [ -n "$CHILD_PID" ]; then kill "$CHILD_PID" 2>/dev/null; fi; echo "idle|$(date +%s)|" > "$STATUS_FILE"; exit 0' TERM INT

cd "$CWD" || exit 1

while true; do
  echo "working|$(date +%s)|" > "$STATUS_FILE"
  # Run one agent cycle in non-interactive mode (output goes to log via parent's FD redirect)
  $RUNNER_BASE --print -p "@${AGENT}" 2>&1 &
  CHILD_PID=$!
  wait "$CHILD_PID" || true
  CHILD_PID=""
  echo "idle|$(date +%s)|" > "$STATUS_FILE"
  sleep "$INTERVAL"
done
