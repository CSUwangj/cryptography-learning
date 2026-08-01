#!/usr/bin/env bash
# One-command deployable-behavior characterization baseline.
set -euo pipefail

if [[ $# -ne 0 ]]; then
  echo "Usage: $0" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="cryptography-learning-web-tier:baseline"

echo "==> Building baseline image $IMAGE"
docker build -t "$IMAGE" "$ROOT"
exec "$ROOT/acceptance/run.sh" "$IMAGE" --mode smoke
