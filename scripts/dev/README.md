# Local dev services without Docker

Run each in its own terminal (or background it). Data lives in `~/.zemi-dev`.

```bash
sh scripts/dev/postgres.sh   # Postgres 16 on :55440 (brew install postgresql@16)
sh scripts/dev/minio.sh      # S3 on :59000 (brew install minio)
sh scripts/dev/media.sh      # MediaMTX 1.21.1: RTMP :51935, HLS :58888, API :59997
pnpm --filter @zemi/api dev  # API on :4400
pnpm --filter @zemi/web dev  # web on :3300
```

`docker-compose.dev.yml` offers the same services with Docker.
