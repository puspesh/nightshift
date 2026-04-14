#!/usr/bin/env bash
# Emit work:completed events to the Agentville server.
# Always exits 0 — the visualization server may not be running.
#
# Usage: ns-work-event.sh <server_url> <agent> <work_type> [description]
#   server_url   e.g. http://localhost:4321
#   agent        e.g. ns-dev-producer
#   work_type    e.g. issue_triaged, plan_written, review_completed, test_passed, pr_merged
#   description  optional free-text description

SERVER_URL="${1:?}"
AGENT="${2:?}"
WORK_TYPE="${3:?}"
DESCRIPTION="${4:-}"

# Escape a string for safe JSON interpolation
json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

WORK_TYPE=$(json_escape "$WORK_TYPE")
DESCRIPTION=$(json_escape "$DESCRIPTION")

DATA="{\"workType\":\"${WORK_TYPE}\"}"
if [ -n "$DESCRIPTION" ]; then
  DATA="{\"workType\":\"${WORK_TYPE}\",\"description\":\"${DESCRIPTION}\"}"
fi

curl -s -o /dev/null --connect-timeout 1 -X POST \
  "${SERVER_URL}/api/events" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"work:completed\",\"source\":\"nightshift\",\"agent\":\"${AGENT}\",\"data\":${DATA}}" \
  >/dev/null 2>&1

exit 0
