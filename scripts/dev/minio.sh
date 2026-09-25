#!/bin/sh
# Native MinIO for local dev (no Docker). Data: ~/.zemi-dev/minio, S3 on :59000, console :59001.
# The API creates the "zemi" bucket on boot (S3_AUTO_CREATE_BUCKET=true).
mkdir -p "$HOME/.zemi-dev/minio"
export MINIO_ROOT_USER=zemi MINIO_ROOT_PASSWORD=zemi-secret
exec minio server "$HOME/.zemi-dev/minio" --address 127.0.0.1:59000 --console-address 127.0.0.1:59001
