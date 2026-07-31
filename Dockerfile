# syntax=docker/dockerfile:1.7

###
# Build backend (Rust) using Cargo.lock
###
FROM rust:1.76 AS backend-builder

WORKDIR /src

COPY backend/Cargo.toml backend/Cargo.lock ./backend/
COPY backend ./backend/
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
# Runtime image: one web-tier process serving static frontend + GraphQL
###
FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend binary
COPY --from=backend-builder /src/backend/target/release/cryptography-learning-backend ./backend

# Prebuilt frontend bundle
COPY --from=frontend-builder /src/frontend/dist /www

COPY start-web-tier.sh /app/start-web-tier.sh
RUN chmod +x /app/start-web-tier.sh

EXPOSE 8000

ENTRYPOINT ["/app/start-web-tier.sh"]
