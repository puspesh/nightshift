#!/usr/bin/env bash
# ns-agent-loop.sh — Run a single nightshift agent in a repeating loop.
# Usage: ns-agent-loop.sh <cwd> <interval-seconds> <runner> <status-file> <prompt>
#
# Invokes Claude Code in non-interactive mode (--print -p <prompt>) where
# <runner> already includes --agent <name> (injected by buildRunnerForAgent).
# Sleeps between cycles. Writes status file updates so monitoring works.

set -euo pipefail

CWD="$1"
INTERVAL="$2"
RUNNER="$3"
STATUS_FILE="$4"
PROMPT="$5"

# Clean up child process on SIGTERM/SIGINT
CHILD_PID=""
trap 'if [ -n "$CHILD_PID" ]; then kill "$CHILD_PID" 2>/dev/null; fi; echo "idle|$(date +%s)|" > "$STATUS_FILE"; exit 0' TERM INT

cd "$CWD" || exit 1

while true; do
  echo "working|$(date +%s)|" > "$STATUS_FILE"
  # Run one agent cycle in non-interactive mode (output goes to log via parent's FD redirect)
  $RUNNER --print -p "$PROMPT" 2>&1 &
  CHILD_PID=$!
  wait "$CHILD_PID" || true
  CHILD_PID=""
  echo "idle|$(date +%s)|" > "$STATUS_FILE"
  sleep "$INTERVAL"
done
