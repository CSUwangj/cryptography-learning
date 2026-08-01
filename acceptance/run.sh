#!/usr/bin/env bash
# Stable public entrypoint for web-tier image acceptance.
set -euo pipefail

if [[ $# -ne 3 || "$2" != "--mode" ]]; then
  echo "Usage: $0 <image-reference-or-id> --mode <smoke|pr|release>" >&2
  exit 64
fi

case "$3" in smoke|pr|release) ;; *)
  echo "Mode must be smoke, pr, or release" >&2
  exit 64
  ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$ROOT/baseline/run.sh" "$1" "$3"
