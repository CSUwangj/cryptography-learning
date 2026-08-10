#!/usr/bin/env bash
# Exact-image local relay-to-board Completion Records acceptance (#49).
set -euo pipefail

usage() {
  echo "Usage: $0 <web-tier-image> <completion-relay-image>" >&2
  exit 64
}
[[ $# -eq 2 ]] || usage

WEB_IMAGE="$1"
RELAY_IMAGE="$2"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

COURSE_RUN="${COMPLETION_COURSE_RUN:-2026-acceptance}"
LAB_ID="${COMPLETION_LAB:-affine}"
STUDENT_ID="${COMPLETION_STUDENT:-20260001}"
KID="${COMPLETION_KID:-acceptance-host-a}"
CONTENT_DIR="${CONTENT_DIR:-$ROOT/baseline/content}"

port_is_busy() {
  command -v ss >/dev/null 2>&1 && ss -tln | grep -qE ":${1}\\s"
}

pick_free_port() {
  local candidate
  for candidate in "$@"; do
    if ! port_is_busy "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
}

WEB_HTTP_PORT="${WEB_HTTP_PORT:-$(pick_free_port 18010 18011 18012)}"
RELAY_PORT="${RELAY_PORT:-$(pick_free_port 18110 18111 18112)}"
if [[ "$WEB_HTTP_PORT" == "$RELAY_PORT" ]]; then
  RELAY_PORT="$(pick_free_port 18120 18121 18122)"
fi

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cryptography-learning-completion-acceptance.XXXXXX")"
ARTIFACT_DIR="${ACCEPTANCE_ARTIFACT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/cryptography-learning-completion-acceptance-artifacts.XXXXXX")}"
mkdir -p "$ARTIFACT_DIR" "$WORK_DIR/keys" "$WORK_DIR/completion"

WEB_CONTAINER="cryptography-learning-completion-web-$$"
RELAY_CONTAINER="cryptography-learning-completion-relay-$$"
STATUS=0

scrub_secrets() {
  # Delete only this harness's ephemeral key. Never walk caller-supplied ARTIFACT_DIR.
  rm -f "$WORK_DIR/keys/completion-relay.pem" 2>/dev/null || true
}

retain_diagnostics() {
  scrub_secrets
  {
    docker logs "$WEB_CONTAINER" 2>&1 || true
  } >"$ARTIFACT_DIR/web-tier.log" || true
  {
    docker logs "$RELAY_CONTAINER" 2>&1 || true
  } >"$ARTIFACT_DIR/relay.log" || true
  cp -f "$WORK_DIR/completion/completion.ron" "$ARTIFACT_DIR/completion.ron" 2>/dev/null || true
  cp -f "$WORK_DIR/relay.ron" "$ARTIFACT_DIR/relay.ron" 2>/dev/null || true
  # Never copy private key material into retained diagnostics.
  scrub_secrets
  echo "Completion acceptance failed; diagnostics retained in $ARTIFACT_DIR" >&2
}

cleanup() {
  STATUS=$?
  set +e
  if [[ $STATUS -ne 0 ]]; then
    retain_diagnostics
  elif [[ -z "${ACCEPTANCE_ARTIFACT_DIR:-}" ]]; then
    rm -rf "$ARTIFACT_DIR"
  fi
  docker rm -f "$WEB_CONTAINER" >/dev/null 2>&1
  docker rm -f "$RELAY_CONTAINER" >/dev/null 2>&1
  scrub_secrets
  rm -rf "$WORK_DIR"
  exit "$STATUS"
}
trap cleanup EXIT

echo "==> Generating ephemeral relay signing key with $RELAY_IMAGE"
REGISTRATION="$(
  docker run --rm \
    --mount "type=bind,src=${WORK_DIR}/keys,dst=/keys" \
    "$RELAY_IMAGE" \
    key generate --kid "$KID" --private-key /keys/completion-relay.pem
)"
printf '%s\n' "$REGISTRATION" | grep -q 'public_key_hex:' || {
  echo "key generate did not emit a public registration line" >&2
  exit 1
}

cat >"$WORK_DIR/completion/completion.ron" <<EOF
CompletionConfiguration(
  course_run: "${COURSE_RUN}",
  trusted_keys: [
    ${REGISTRATION}
  ],
)
EOF

cat >"$WORK_DIR/relay.ron" <<EOF
RelayConfiguration(
  course_run: "${COURSE_RUN}",
  backend_endpoint: "http://127.0.0.1:${WEB_HTTP_PORT}/api/completion-claims",
  listen_port: ${RELAY_PORT},
  key: (
    kid: "${KID}",
    private_key_path: "/keys/completion-relay.pem",
  ),
)
EOF

echo "==> Starting web-tier image $WEB_IMAGE on http://127.0.0.1:${WEB_HTTP_PORT}"
docker run -d --name "$WEB_CONTAINER" \
  -p "127.0.0.1:${WEB_HTTP_PORT}:8000" \
  --mount "type=bind,src=${CONTENT_DIR},dst=/content,readonly" \
  --mount "type=bind,src=${WORK_DIR}/completion,dst=/completion" \
  -e CONTENT_DIR=/content \
  -e CONFIG_PATH=/content/config.ron \
  -e STATIC_DIR=/www \
  -e ACCESS_POINT=0.0.0.0:8000 \
  -e COMPLETION_CONFIG=/completion/completion.ron \
  -e COMPLETION_DB=/completion/claims.sqlite \
  "$WEB_IMAGE" >/dev/null

echo "==> Starting relay image $RELAY_IMAGE on 127.0.0.1:${RELAY_PORT} (host network)"
docker run -d --name "$RELAY_CONTAINER" \
  --network host \
  --mount "type=bind,src=${WORK_DIR}/keys/completion-relay.pem,dst=/keys/completion-relay.pem,readonly" \
  --mount "type=bind,src=${WORK_DIR}/relay.ron,dst=/config/relay.ron,readonly" \
  "$RELAY_IMAGE" \
  serve --config /config/relay.ron >/dev/null

export BASELINE_BASE_URL="http://127.0.0.1:${WEB_HTTP_PORT}"
python3 - <<'PY'
import sys
from pathlib import Path
sys.path.insert(0, str(Path("baseline/tests").resolve()))
from helpers import wait_until_ready
wait_until_ready(timeout=180)
PY

python3 - <<PY
import json
import time
import urllib.error
import urllib.request

url = "http://127.0.0.1:${RELAY_PORT}/health"
deadline = time.time() + 60
last = None
while time.time() < deadline:
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            body = json.loads(response.read().decode())
            if response.status == 200 and body.get("status") == "ok":
                raise SystemExit(0)
            last = body
    except Exception as exc:  # noqa: BLE001 — readiness poll
        last = exc
        time.sleep(0.25)
raise SystemExit(f"relay not ready at {url}: {last}")
PY

export PLAYWRIGHT_BASE_URL="http://127.0.0.1:${WEB_HTTP_PORT}"
export COMPLETION_RELAY_URL="http://127.0.0.1:${RELAY_PORT}"
export COMPLETION_COURSE_RUN="$COURSE_RUN"
export COMPLETION_LAB="$LAB_ID"
export COMPLETION_STUDENT="$STUDENT_ID"
export PLAYWRIGHT_ARTIFACT_DIR="$ARTIFACT_DIR/playwright"
mkdir -p "$PLAYWRIGHT_ARTIFACT_DIR"

echo "==> Running Chromium Playwright completion-records.spec.ts"
run_frontend_playwright() {
  # Pin Node from frontend/.nvmrc and install from the lockfile before Playwright.
  if command -v fish >/dev/null 2>&1; then
    fish -lc "cd '$ROOT/frontend'; nvm use; npm ci; npx playwright test --project=chromium e2e/completion-records.spec.ts"
    return
  fi
  (
    cd "$ROOT/frontend"
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [[ -s "$NVM_DIR/nvm.sh" ]]; then
      # shellcheck source=/dev/null
      . "$NVM_DIR/nvm.sh"
      nvm use
    elif command -v nvm >/dev/null 2>&1; then
      nvm use
    else
      echo "frontend/.nvmrc pin required: install nvm (bash) or fish+nvm.fish" >&2
      exit 1
    fi
    npm ci
    npx playwright test --project=chromium e2e/completion-records.spec.ts
  )
}
run_frontend_playwright

echo "==> Completion acceptance green for $WEB_IMAGE + $RELAY_IMAGE"
