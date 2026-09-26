#!/bin/sh
# Local S3 for dev (no Docker): Versity S3 Gateway with a plain-file POSIX backend.
# Objects live as files in ~/.zemi-dev/s3/<bucket>/<key>. S3 on :59000 (key zemi / secret zemi-secret).
# Unlike MinIO it has no hard "disk 99% full" write cutoff. The API creates the bucket on boot.
#   brew install versitygw
mkdir -p "$HOME/.zemi-dev/s3"
exec versitygw --access zemi --secret zemi-secret --port 127.0.0.1:59000 posix "$HOME/.zemi-dev/s3"
