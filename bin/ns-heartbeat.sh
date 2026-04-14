#!/usr/bin/env bash
# Nightshift heartbeat adapter for Claude Code hooks.
# Reads hook JSON from stdin, maps to Agentville event API, posts to server.
# Always exits 0 — the visualization server may not be running and that's fine.
#
# Usage: ns-heartbeat.sh <server_url> <agent> <event>
#   server_url  e.g. http://localhost:4321
#   agent       e.g. ns-dev-producer
#   event       e.g. PreToolUse, PostToolUse, Stop, SessionStart, UserPromptSubmit, SubagentStart, SubagentStop, SessionEnd

SERVER_URL="${1:?}"
AGENT="${2:?}"
EVENT="${3:?}"

# Read stdin (Claude Code pipes hook JSON here)
STDIN_DATA=""
if [ ! -t 0 ]; then
  STDIN_DATA=$(cat)
fi

# Extract fields from stdin JSON (best-effort with basic tools)
extract_json_field() {
  echo "$STDIN_DATA" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*"'"$1"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/'
}

TOOL_NAME=$(extract_json_field "tool_name")
PROMPT=$(extract_json_field "prompt")
SUBAGENT_ID=$(extract_json_field "subagent_id")
SUBAGENT_TASK=$(extract_json_field "subagent_task")

# Map Claude Code hook events to Agentville event types
case "$EVENT" in
  SessionStart)
    TYPE="agent:heartbeat"
    DATA="{\"state\":\"idle\"}"
    ;;
  UserPromptSubmit)
    TYPE="agent:heartbeat"
    TASK="${PROMPT:-Processing request}"
    # Truncate task to 60 chars
    TASK=$(echo "$TASK" | cut -c1-60)
    DATA="{\"state\":\"working\",\"task\":\"${TASK}\"}"
    ;;
  PreToolUse)
    TYPE="agent:heartbeat"
    DATA="{\"state\":\"working\",\"task\":\"${TOOL_NAME:-Using tool}\"}"
    ;;
  PostToolUse)
    TYPE="agent:heartbeat"
    DATA="{\"state\":\"working\",\"task\":\"Done: ${TOOL_NAME:-tool}\"}"
    ;;
  PostToolUseFailure)
    TYPE="agent:error"
    DATA="{\"error\":\"Failed: ${TOOL_NAME:-tool}\",\"tool\":\"${TOOL_NAME}\"}"
    ;;
  SubagentStart)
    TYPE="agent:spawned"
    CHILD="${SUBAGENT_ID:-sub-$(date +%s)}"
    DATA="{\"parent\":\"${AGENT}\",\"child\":\"${CHILD}\",\"task\":\"${SUBAGENT_TASK:-Running}\"}"
    ;;
  SubagentStop)
    TYPE="agent:spawn-ended"
    CHILD="${SUBAGENT_ID:-sub}"
    DATA="{\"parent\":\"${AGENT}\",\"child\":\"${CHILD}\"}"
    ;;
  Stop|SessionEnd)
    TYPE="agent:idle"
    DATA="{\"reason\":\"session_ended\"}"
    ;;
  *)
    # Unknown event — send as heartbeat
    TYPE="agent:heartbeat"
    DATA="{\"state\":\"working\"}"
    ;;
esac

# Post to unified events API
curl -s -o /dev/null --connect-timeout 1 -X POST \
  "${SERVER_URL}/api/events" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"${TYPE}\",\"source\":\"nightshift\",\"agent\":\"${AGENT}\",\"data\":${DATA}}" \
  >/dev/null 2>&1

exit 0
