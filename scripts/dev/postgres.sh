#!/bin/sh
# Native Postgres 16 for local dev (no Docker). Data: ~/.zemi-dev/pg, port 55440, user/pass zemi/zemi.
set -e
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@16/bin}"
DATA="$HOME/.zemi-dev/pg"
if [ ! -f "$DATA/PG_VERSION" ]; then
  mkdir -p "$DATA"
  printf 'zemi' > "$HOME/.zemi-dev/pwfile"
  "$PGBIN/initdb" -D "$DATA" -U zemi --pwfile="$HOME/.zemi-dev/pwfile" --auth-local=trust --auth-host=scram-sha-256 >/dev/null
  rm -f "$HOME/.zemi-dev/pwfile"
  ( sleep 3; "$PGBIN/createdb" -h 127.0.0.1 -p 55440 -U zemi zemi 2>/dev/null || true ) &
fi
exec "$PGBIN/postgres" -D "$DATA" -p 55440 -k /tmp -c listen_addresses=127.0.0.1,::1
