#!/usr/bin/env bash
# One-command characterization baseline for the current Linux web-tier image.
#
# Fresh checkout requirements: Docker with Compose v2, Python 3.9+.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

port_is_busy() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -tln | grep -qE ":${port}\\s"
  else
    return 1
  fi
}

if [[ -z "${WEB_HTTP_PORT:-}" ]]; then
  if port_is_busy 8000; then
    WEB_HTTP_PORT=18000
    echo "==> Host port 8000 is busy; using ${WEB_HTTP_PORT}"
  else
    WEB_HTTP_PORT=8000
  fi
fi
export WEB_HTTP_PORT
export CONTENT_DIR="${CONTENT_DIR:-$ROOT/baseline/content}"
export BASELINE_BASE_URL="${BASELINE_BASE_URL:-http://127.0.0.1:${WEB_HTTP_PORT}}"

COMPOSE=(docker compose -f "$ROOT/docker-compose.yml" --project-name cryptography-learning-baseline)

cleanup() {
  "${COMPOSE[@]}" down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

# CI builds and loads the image with Buildx (and a GHA BuildKit cache scope)
# before invoking this script. Local runs keep the one-command build-and-test path.
if [[ "${BASELINE_SKIP_BUILD:-}" == "1" ]]; then
  echo "==> Starting prebuilt Linux web-tier container on host port ${WEB_HTTP_PORT}"
  "${COMPOSE[@]}" up -d --no-build
else
  echo "==> Building and starting Linux web-tier container on host port ${WEB_HTTP_PORT}"
  "${COMPOSE[@]}" up --build -d
fi

echo "==> Waiting for web tier at ${BASELINE_BASE_URL}"
python3 - <<'PY'
import sys
from pathlib import Path
sys.path.insert(0, str(Path("baseline/tests").resolve()))
from helpers import wait_until_ready
wait_until_ready(timeout=180)
print("web tier ready")
PY

echo "==> Running characterization checks"
python3 -m unittest discover -s "$ROOT/baseline/tests" -p 'test_*.py' -v

echo "==> Baseline green"
