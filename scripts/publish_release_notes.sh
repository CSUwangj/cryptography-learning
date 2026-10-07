#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_REF_NAME:?GITHUB_REF_NAME is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${PUBLISHED_IMAGE:?PUBLISHED_IMAGE is required}"

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
python3 "$script_dir/release_notes.py" render "${GITHUB_REF_NAME#web-v}" "$GITHUB_SHA" "$PUBLISHED_IMAGE" > release-notes.md

if gh release view "$GITHUB_REF_NAME" >/dev/null 2>&1; then
  gh release edit "$GITHUB_REF_NAME" --title "Web image $GITHUB_REF_NAME" --notes-file release-notes.md
else
  gh release create "$GITHUB_REF_NAME" --title "Web image $GITHUB_REF_NAME" --notes-file release-notes.md
fi
