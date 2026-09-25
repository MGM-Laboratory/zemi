#!/bin/sh
# Tell the Zemi API that a live path went online/offline.
# usage: hook.sh online|offline   (MediaMTX provides MTX_* env vars)
event="$1"
curl -fsS -m 10 -X POST "$ZEMI_API_INTERNAL_URL/api/v1/internal/media/$event" \
  -H "x-media-secret: $MEDIA_INTERNAL_SECRET" \
  -H 'content-type: application/json' \
  -d "{\"path\":\"$MTX_PATH\",\"query\":\"$MTX_QUERY\",\"sourceType\":\"$MTX_SOURCE_TYPE\",\"sourceId\":\"$MTX_SOURCE_ID\"}" \
  >/dev/null 2>&1 || echo "[zemi-hook] $event notify failed for $MTX_PATH"
exit 0
