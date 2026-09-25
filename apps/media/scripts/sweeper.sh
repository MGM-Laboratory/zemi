#!/bin/sh
# Retries uploads for segments that are finished (untouched for 3+ minutes)
# but still on disk, e.g. because the API was restarting.
while true; do
  sleep 120
  find "${RECORDINGS_DIR:-/recordings}" -type f -name '*.mp4' -mmin +3 2>/dev/null | while read -r f; do
    rel="${f#${RECORDINGS_DIR:-/recordings}/}"
    p="$(dirname "$rel")"
    "$(dirname "$0")/upload-segment.sh" "$f" "$p" "" || true
  done
done
