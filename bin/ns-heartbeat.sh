#!/usr/bin/env bash
# Best-effort heartbeat to the nightshift agentville server.
# Always exits 0 — the visualization server may not be running and that's fine.
#
# Usage: ns-heartbeat.sh <server_url> <agent> <event>
#   server_url  e.g. http://localhost:4321
#   agent       e.g. ns-dev-producer
#   event       e.g. PreToolUse, PostToolUse, Stop, SessionStart, UserPromptSubmit

SERVER_URL="${1:?}"
AGENT="${2:?}"
EVENT="${3:?}"

curl -s -o /dev/null --connect-timeout 1 -X POST \
  "${SERVER_URL}/api/hooks/claude-code?agent=${AGENT}&name=${AGENT}" \
  -H "Content-Type: application/json" \
  -d "{\"hook_event_name\":\"${EVENT}\"}" \
  >/dev/null 2>&1

exit 0
