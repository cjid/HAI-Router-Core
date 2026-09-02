#!/usr/bin/env sh
# Local Docker helpers — canonical HAI-Router container identity
set -eu

IMAGE="${HAIROUTER_IMAGE:-hairouter:latest}"
CONTAINER="${HAIROUTER_CONTAINER:-hairouter}"
VOLUME="${HAIROUTER_VOLUME:-hairouter-data}"

docker stop "$CONTAINER" 2>/dev/null || true
docker rm "$CONTAINER" 2>/dev/null || true
docker build -t "$IMAGE" .
docker run -d --name "$CONTAINER" -p 20128:20128 --env-file .env -v "${VOLUME}:/app/data" "$IMAGE"
