#!/usr/bin/env bash
# Acceptance harness for an already-built immutable web-tier image.
set -euo pipefail

usage() { echo "Usage: $0 <image-reference-or-id> --mode <smoke|pr|release>" >&2; exit 64; }
[[ $# -eq 3 && "$2" == "--mode" ]] || usage
IMAGE_REFERENCE="$1"
MODE="$3"
case "$MODE" in smoke|pr|release) ;; *) usage ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
port_is_busy() { command -v ss >/dev/null 2>&1 && ss -tln | grep -qE ":${1}\\s"; }
if [[ -z "${WEB_HTTP_PORT:-}" ]]; then
  if port_is_busy 8000; then WEB_HTTP_PORT=18000; else WEB_HTTP_PORT=8000; fi
fi
export WEB_HTTP_PORT
export CONTENT_DIR="${CONTENT_DIR:-$ROOT/baseline/content}"
export BASELINE_BASE_URL="${BASELINE_BASE_URL:-http://127.0.0.1:${WEB_HTTP_PORT}}"
export WEB_TIER_IMAGE="$IMAGE_REFERENCE"

PROJECT="cryptography-learning-acceptance-${MODE}-$$"
COMPOSE=(docker compose -f "$ROOT/docker-compose.yml" --project-name "$PROJECT")
ARTIFACT_DIR="${ACCEPTANCE_ARTIFACT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/cryptography-learning-acceptance.XXXXXX")}"
mkdir -p "$ARTIFACT_DIR"
cleanup() {
  status=$?
  if [[ $status -ne 0 ]]; then
    "${COMPOSE[@]}" logs --no-color >"$ARTIFACT_DIR/compose.log" 2>&1 || true
  fi
  "${COMPOSE[@]}" down --remove-orphans >"$ARTIFACT_DIR/compose-down.log" 2>&1 || true
  if [[ $status -ne 0 ]]; then
    echo "Acceptance failed; diagnostics retained in $ARTIFACT_DIR" >&2
  elif [[ -z "${ACCEPTANCE_ARTIFACT_DIR:-}" ]]; then
    rm -rf "$ARTIFACT_DIR"
  fi
  exit "$status"
}
trap cleanup EXIT

echo "==> Starting exact image $IMAGE_REFERENCE on ${BASELINE_BASE_URL}"
"${COMPOSE[@]}" up -d --no-build
python3 - <<'PY'
import sys
from pathlib import Path
sys.path.insert(0, str(Path("baseline/tests").resolve()))
from helpers import wait_until_ready
wait_until_ready(timeout=180)
PY
python3 -m unittest discover -s "$ROOT/baseline/tests" -p 'test_*.py' -v
"${COMPOSE[@]}" restart web-tier
python3 - <<'PY'
import sys
from pathlib import Path
sys.path.insert(0, str(Path("baseline/tests").resolve()))
from helpers import wait_until_ready
wait_until_ready(timeout=60)
PY

if [[ "$MODE" != smoke ]]; then
  export PLAYWRIGHT_BASE_URL="$BASELINE_BASE_URL"
  export PLAYWRIGHT_ARTIFACT_DIR="$ARTIFACT_DIR/playwright"
  if [[ "$MODE" == pr ]]; then BROWSERS=(chromium); else BROWSERS=(chromium firefox webkit); fi
  for browser in "${BROWSERS[@]}"; do
    (cd frontend && npx playwright test --project="$browser")
  done
fi
echo "==> $MODE acceptance green for $IMAGE_REFERENCE"
