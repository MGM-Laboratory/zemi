#!/bin/sh
set -e
: "${ZEMI_API_INTERNAL_URL:?ZEMI_API_INTERNAL_URL is required}"
: "${MEDIA_INTERNAL_SECRET:?MEDIA_INTERNAL_SECRET is required}"

# The secret travels in URLs (authHTTP basic auth) and headers, so keep it URL safe.
case "$MEDIA_INTERNAL_SECRET" in
  *[!A-Za-z0-9._~-]*)
    echo "[zemi-media] MEDIA_INTERNAL_SECRET may only contain A-Z a-z 0-9 . _ ~ - (try: openssl rand -hex 32)" >&2
    exit 1
    ;;
esac

ZEMI_API_INTERNAL_URL="${ZEMI_API_INTERNAL_URL%/}"
export ZEMI_API_INTERNAL_URL MEDIA_INTERNAL_SECRET

# authHTTP only POSTs the JSON payload, so the API can't see a header from us. Go's HTTP client turns
# URL userinfo into "Authorization: Basic", which the API checks against MEDIA_INTERNAL_SECRET.
scheme="${ZEMI_API_INTERNAL_URL%%://*}"
rest="${ZEMI_API_INTERNAL_URL#*://}"
export MTX_AUTHHTTPADDRESS="${scheme}://mediamtx:${MEDIA_INTERNAL_SECRET}@${rest}/api/v1/internal/media/auth"

# The API HLS proxy is our "CDN": one shared cookieless session for all viewers.
export MTX_HLSCDNSECRET="${MEDIA_INTERNAL_SECRET}"
mkdir -p /recordings
/zemi/sweeper.sh &
exec /usr/local/bin/mediamtx /zemi/mediamtx.yml
