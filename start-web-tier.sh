#!/bin/sh
set -eu

CONTENT_DIR="${CONTENT_DIR:-/content}"
STATIC_DIR="${STATIC_DIR:-/www}"
CONFIG_PATH="${CONFIG_PATH:-${CONTENT_DIR}/config.ron}"
ACCESS_POINT="${ACCESS_POINT:-0.0.0.0:8000}"
BUILD_COMMIT="${BUILD_COMMIT:-unknown}"
IMAGE_ID="${IMAGE_ID:-unknown}"

# The React bundle references /img/*; serve Lab assets from the mounted
# content repo by linking it into the static bundle directory.
if [ -d "${CONTENT_DIR}/img" ]; then
  # Do not mutate or replace files baked into the image.
  if [ ! -e "${STATIC_DIR}/img" ]; then
    ln -s "${CONTENT_DIR}/img" "${STATIC_DIR}/img" || true
  fi
fi

cd "${CONTENT_DIR}"

exec /app/backend \
  -vv \
  --static "${STATIC_DIR}" \
  --config "${CONFIG_PATH}" \
  --access-point "${ACCESS_POINT}" \
  --build-commit "${BUILD_COMMIT}" \
  --image-id "${IMAGE_ID}"
