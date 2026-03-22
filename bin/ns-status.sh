#!/bin/bash
# Reads agent status file and outputs formatted text for tmux pane border.
# Usage: ns-status.sh <status-file> <interval-seconds>
#
# Status file format: "working|<timestamp>|" or "idle|<timestamp>|"
# Output: "working" or "idle · 8m left" or "idle · soon"

STATUS_FILE="$1"
INTERVAL="${2:-900}" # default 15 minutes

if [ ! -f "$STATUS_FILE" ]; then
  echo "–"
  exit 0
fi

LINE=$(cat "$STATUS_FILE" 2>/dev/null)
STATUS=$(echo "$LINE" | cut -d'|' -f1)
TIMESTAMP=$(echo "$LINE" | cut -d'|' -f2)

if [ -z "$STATUS" ] || [ -z "$TIMESTAMP" ]; then
  echo "–"
  exit 0
fi

NOW=$(date +%s)

if [ "$STATUS" = "working" ]; then
  ELAPSED=$(( (NOW - TIMESTAMP) / 60 ))
  if [ "$ELAPSED" -gt 0 ]; then
    echo "working · ${ELAPSED}m"
  else
    echo "working"
  fi
else
  # idle — calculate time until next loop
  WAKE_AT=$(( TIMESTAMP + INTERVAL ))
  REMAINING=$(( WAKE_AT - NOW ))

  if [ "$REMAINING" -le 0 ]; then
    echo "idle · soon"
  elif [ "$REMAINING" -lt 60 ]; then
    echo "idle · ${REMAINING}s"
  else
    MINS=$(( REMAINING / 60 ))
    echo "idle · ${MINS}m left"
  fi
fi
