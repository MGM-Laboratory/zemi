#!/bin/sh
# Native MediaMTX 1.21.1 for local dev (no Docker). RTMP :51935, HLS :58888, API :59997.
# Uses apps/media/mediamtx.yml with local paths. Binary: ~/.zemi-dev/bin/mediamtx
set -e
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="${MEDIAMTX_BIN:-$HOME/.zemi-dev/bin/mediamtx}"
if [ ! -x "$BIN" ]; then
  mkdir -p "$(dirname "$BIN")"
  arch=$(uname -m); [ "$arch" = "x86_64" ] && arch=amd64
  curl -sSfL "https://github.com/bluenviron/mediamtx/releases/download/v1.21.1/mediamtx_v1.21.1_darwin_${arch}.tar.gz" | tar xz -C "$(dirname "$BIN")" mediamtx
fi
export RECORDINGS_DIR="$HOME/.zemi-dev/recordings"
mkdir -p "$RECORDINGS_DIR"
CONF="$HOME/.zemi-dev/mediamtx.yml"
sed -e "s#/zemi/#$REPO/apps/media/scripts/#g" -e "s#/recordings/#$RECORDINGS_DIR/#g" "$REPO/apps/media/mediamtx.yml" > "$CONF"
export ZEMI_API_INTERNAL_URL="${ZEMI_API_INTERNAL_URL:-http://localhost:4400}"
export MEDIA_INTERNAL_SECRET="${MEDIA_INTERNAL_SECRET:-dev-media-secret}"
export MTX_AUTHHTTPADDRESS="$ZEMI_API_INTERNAL_URL/api/v1/internal/media/auth"
export MTX_HLSCDNSECRET="$MEDIA_INTERNAL_SECRET"
export MTX_RTMPADDRESS=:51935 MTX_HLSADDRESS=:58888 MTX_APIADDRESS=:59997 MTX_RTSPADDRESS=:58554
"$REPO/apps/media/scripts/sweeper.sh" &
exec "$BIN" "$CONF"
