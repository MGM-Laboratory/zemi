#!/bin/sh
set -e
: "${ZEMI_API_INTERNAL_URL:?ZEMI_API_INTERNAL_URL is required}"
: "${MEDIA_INTERNAL_SECRET:?MEDIA_INTERNAL_SECRET is required}"
export ZEMI_API_INTERNAL_URL MEDIA_INTERNAL_SECRET
export MTX_AUTHHTTPADDRESS="${ZEMI_API_INTERNAL_URL}/api/v1/internal/media/auth"
# The API HLS proxy is our "CDN": one shared cookieless session for all viewers.
export MTX_HLSCDNSECRET="${MEDIA_INTERNAL_SECRET}"
mkdir -p /recordings
/zemi/sweeper.sh &
exec /usr/local/bin/mediamtx /zemi/mediamtx.yml
