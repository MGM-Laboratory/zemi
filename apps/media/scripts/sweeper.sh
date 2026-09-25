#!/bin/sh
# Retries uploads for segments that are finished (untouched for 3+ minutes)
# but still on disk, e.g. because the API was restarting.
while true; do
  sleep 120
  find /recordings -type f -name '*.mp4' -mmin +3 2>/dev/null | while read -r f; do
    rel="${f#/recordings/}"
    p="$(dirname "$rel")"
    /zemi/upload-segment.sh "$f" "$p" "" || true
  done
done
