#!/usr/bin/env bash
# ns-agent-loop.sh — Run a single nightshift agent in a repeating loop.
# Usage: ns-agent-loop.sh <cwd> <interval-seconds> <runner> <status-file> <prompt> [costs-file] [agent-name]
#
# Invokes Claude Code in non-interactive mode. When costs-file and agent-name
# are provided, uses --output-format json to capture cost/token data per cycle
# and appends a JSONL entry to costs-file. Otherwise falls back to --print.
#
# The issue number is read from a breadcrumb file that the agent writes during
# its claim step: ~/.nightshift/<repo>/<team>/last-issue/<agent-name>
#
# Sleeps between cycles. Writes status file updates so monitoring works.

set -euo pipefail

CWD="$1"
INTERVAL="$2"
RUNNER="$3"
STATUS_FILE="$4"
PROMPT="$5"
COSTS_FILE="${6:-}"
AGENT_NAME="${7:-}"

# Clean up child process on SIGTERM/SIGINT
CHILD_PID=""
trap 'if [ -n "$CHILD_PID" ]; then kill "$CHILD_PID" 2>/dev/null; fi; echo "idle|$(date +%s)|" > "$STATUS_FILE"; exit 0' TERM INT

cd "$CWD" || exit 1

# Derive repo name for breadcrumb path (matches agent profile convention)
REPO_NAME=$(basename "$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\.git$||')")

# Determine if cost tracking is enabled
TRACK_COST=""
if [ -n "$COSTS_FILE" ] && [ -n "$AGENT_NAME" ]; then
  TRACK_COST=1
fi

while true; do
  echo "working|$(date +%s)|" > "$STATUS_FILE"
  CYCLE_START=$(date +%s)

  if [ -n "$TRACK_COST" ]; then
    # Cost tracking mode: capture JSON output, stderr goes to parent log
    CYCLE_OUTPUT=$(mktemp)
    $RUNNER --output-format json -p "$PROMPT" >"$CYCLE_OUTPUT" &
    CHILD_PID=$!
    wait "$CHILD_PID" || true
    CHILD_PID=""

    CYCLE_END=$(date +%s)
    DURATION=$(( CYCLE_END - CYCLE_START ))

    # Read breadcrumb to get which issue this cycle worked on
    BREADCRUMB=$(find "$HOME/.nightshift/${REPO_NAME}" -path "*/last-issue/${AGENT_NAME}" 2>/dev/null | head -1)
    ISSUE=""
    if [ -n "$BREADCRUMB" ] && [ -f "$BREADCRUMB" ]; then
      ISSUE=$(tr -d '[:space:]' < "$BREADCRUMB")
    fi

    # Parse JSON and write cost entry (node is always available in a Node.js project)
    if [ -n "$ISSUE" ] && [ -f "$CYCLE_OUTPUT" ] && [ -s "$CYCLE_OUTPUT" ]; then
      node -e "
        const fs = require('fs');
        try {
          const raw = fs.readFileSync(process.argv[1], 'utf8');
          const data = JSON.parse(raw);
          if (data.total_cost_usd != null) {
            const entry = {
              issue: parseInt(process.argv[2]),
              agent: process.argv[3],
              cost_usd: data.total_cost_usd,
              duration_s: parseInt(process.argv[4]),
              model_usage: data.modelUsage || {},
              ts: new Date().toISOString()
            };
            fs.appendFileSync(process.argv[5], JSON.stringify(entry) + '\n');
          }
        } catch {}
      " "$CYCLE_OUTPUT" "$ISSUE" "$AGENT_NAME" "$DURATION" "$COSTS_FILE"
    fi

    rm -f "$CYCLE_OUTPUT"
  else
    # No cost tracking: original behavior
    $RUNNER --print -p "$PROMPT" 2>&1 &
    CHILD_PID=$!
    wait "$CHILD_PID" || true
    CHILD_PID=""
  fi

  echo "idle|$(date +%s)|" > "$STATUS_FILE"
  sleep "$INTERVAL"
done
