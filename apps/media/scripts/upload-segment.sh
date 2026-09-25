#!/bin/sh
# Upload one finished recording segment to the Zemi API, then delete it.
# Called by MediaMTX (runOnRecordSegmentComplete) or by the sweeper.
# usage: upload-segment.sh [file] [path] [duration]
f="${1:-$MTX_SEGMENT_PATH}"
p="${2:-$MTX_PATH}"
d="${3:-$MTX_SEGMENT_DURATION}"
[ -f "$f" ] || exit 0

lock="$f.lock"
mkdir "$lock" 2>/dev/null || exit 0
trap 'rmdir "$lock" 2>/dev/null' EXIT

i=1
while [ $i -le 6 ]; do
  if curl -fsS -m 900 -X POST "$ZEMI_API_INTERNAL_URL/api/v1/internal/media/segments" \
      -H "x-media-secret: $MEDIA_INTERNAL_SECRET" \
      -F "path=$p" -F "duration=$d" -F "filename=$(basename "$f")" \
      -F "file=@$f;type=video/mp4" >/dev/null; then
    rm -f "$f"
    echo "[zemi-upload] uploaded $f"
    exit 0
  fi
  echo "[zemi-upload] attempt $i failed for $f"
  sleep $((i * 5))
  i=$((i + 1))
done
echo "[zemi-upload] giving up on $f for now, sweeper will retry"
exit 1
