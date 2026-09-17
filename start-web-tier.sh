#!/bin/sh
set -eu

CONTENT_DIR="${CONTENT_DIR:-/content}"
STATIC_DIR="${STATIC_DIR:-/www}"
CONFIG_PATH="${CONFIG_PATH:-${CONTENT_DIR}/config.ron}"
ACCESS_POINT="${ACCESS_POINT:-0.0.0.0:8000}"
BUILD_COMMIT="${BUILD_COMMIT:-unknown}"
IMAGE_ID="${IMAGE_ID:-unknown}"

# Serve content-owned public assets from the mounted content repo without
# mutating or replacing files baked into the image.
for directory in img resources; do
  if [ -d "${CONTENT_DIR}/${directory}" ] && [ ! -e "${STATIC_DIR}/${directory}" ]; then
    ln -s "${CONTENT_DIR}/${directory}" "${STATIC_DIR}/${directory}" || true
  fi
done

cd "${CONTENT_DIR}"

exec /app/backend \
  -vv \
  --static "${STATIC_DIR}" \
  --config "${CONFIG_PATH}" \
  --access-point "${ACCESS_POINT}" \
  --build-commit "${BUILD_COMMIT}" \
  --image-id "${IMAGE_ID}"
