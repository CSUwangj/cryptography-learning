# syntax=docker/dockerfile:1.7

###
# Build backend (Rust) using Cargo.lock
###
FROM rust:1.97.0 AS backend-builder

WORKDIR /src

COPY backend/Cargo.toml backend/Cargo.lock ./backend/
COPY backend/apps ./backend/apps
COPY backend/crates ./backend/crates
RUN cargo build --release --locked --manifest-path backend/Cargo.toml

###
# Build frontend (React) using the checked-in Node pin
###
FROM node:24.18.1 AS frontend-builder

WORKDIR /src

ARG VITE_FEEDBACK_URL="https://github.com/CSUAuroraLab/ISSUE-COLLECTOR/issues/new/choose"

COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./frontend/
RUN cd frontend && npm ci

COPY frontend ./frontend/
RUN cd frontend \
  && VITE_FEEDBACK_URL="${VITE_FEEDBACK_URL}" \
     npm run build

###
# Host Completion Relay: release binary + CA certificates for HTTPS verification
###
FROM debian:bookworm-slim AS completion-relay

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=backend-builder /src/backend/target/release/completion-relay /app/completion-relay

ENTRYPOINT ["/app/completion-relay"]

###
# Runtime image: one web-tier process serving static frontend + GraphQL
###
FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

ARG BUILD_COMMIT=unknown
ARG IMAGE_VERSION=dev
LABEL org.opencontainers.image.title="Cryptography Learning web tier" \
      org.opencontainers.image.description="Immutable Practice web tier" \
      org.opencontainers.image.revision="${BUILD_COMMIT}" \
      org.opencontainers.image.version="${IMAGE_VERSION}"

WORKDIR /app

# Backend binary
COPY --from=backend-builder /src/backend/target/release/cryptography-learning-backend ./backend

# Prebuilt frontend bundle
COPY --from=frontend-builder /src/frontend/dist /www

COPY start-web-tier.sh /app/start-web-tier.sh
RUN chmod +x /app/start-web-tier.sh

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD wget --quiet --output-document=- http://127.0.0.1:8000/health/ready >/dev/null || exit 1

ENTRYPOINT ["/app/start-web-tier.sh"]
