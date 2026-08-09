# Host Completion Relay

Trusted per-Host service that accepts Challenge completions on loopback, signs
strict Completion Evidence, and submits it once to the backend. This document is
the public local-build and manual operator path. Private infrastructure supplies
real paths, ports, UID/GID, image identity, and lifecycle/orchestration values.

The public repository supports a reproducible local image build. It does not
publish a relay image, loose binary, or release artifact, and the relay is not
part of the public release pipeline.

## Build the local image

From the repository root:

```sh
docker build --target completion-relay \
  -t cryptography-learning-completion-relay:local .
```

The image entrypoint is `/app/completion-relay`. Pass explicit CLI arguments;
there is no startup wrapper or default configuration path.

## Generate a Host signing key

Set both `RELAY_UID` and `RELAY_GID` to the identity you will pass to `serve`
(do not rely on shell `UID`/`GID`). The host key directory must be writable by
that identity so the container can create the PEM there; otherwise a root-owned
`0600` key is unreadable to a non-root relay process.

```sh
mkdir -p "${HOST_KEY_DIR}"
docker run --rm \
  --user "${RELAY_UID}:${RELAY_GID}" \
  --mount "type=bind,src=${HOST_KEY_DIR},dst=/keys" \
  cryptography-learning-completion-relay:local \
  key generate --kid "${KID}" --private-key /keys/completion-relay.pem
```

Stdout is one ready-to-paste RON registration entry, for example:

```text
(kid: "lab-host-a-2026-01", public_key_hex: "<64-hex>"),
```

The private key is written as unencrypted PKCS#8 PEM with mode `0600`, owned by
`${RELAY_UID}:${RELAY_GID}`.

## Register the public key with the backend

Paste the emitted entry into the backend `CompletionConfiguration.trusted_keys`
list. Supply that file through `--completion-config` or `COMPLETION_CONFIG`. The
backend loads the registry at startup, so restart or redeploy after editing.

```ron
CompletionConfiguration(
  course_run: "COURSE_RUN",
  trusted_keys: [
    (kid: "KID", public_key_hex: "PUBLIC_KEY_HEX"),
  ],
)
```

## Relay configuration

Write a RON file whose `private_key_path` is an absolute path visible inside the
container (the mount destination, not a host-only path):

```ron
RelayConfiguration(
  course_run: "COURSE_RUN",
  backend_endpoint: "https://BACKEND_HOST/api/completion-claims",
  listen_port: LISTEN_PORT,
  key: (
    kid: "KID",
    private_key_path: "/keys/completion-relay.pem",
  ),
)
```

## Run `serve`

The relay binds `127.0.0.1:LISTEN_PORT`. It and its Challenges must share the
Host network namespace so Challenges can reach that loopback listener.

```sh
docker run --rm \
  --network host \
  --user "${RELAY_UID}:${RELAY_GID}" \
  --mount "type=bind,src=${HOST_CONFIG_PATH},dst=/config/relay.ron,readonly" \
  --mount "type=bind,src=${HOST_KEY_DIR}/completion-relay.pem,dst=/keys/completion-relay.pem,readonly" \
  cryptography-learning-completion-relay:local \
  serve --config /config/relay.ron
```

## Health

From Host loopback while serving:

```sh
curl -sS "http://127.0.0.1:${LISTEN_PORT}/health"
```

Expected body: `{"status":"ok"}`.

## Failure log and manual replay

Inconclusive backend delivery returns `503 {"error":"delivery_failed"}` to the
Challenge and emits one JSON stderr event with `event` =
`completion_delivery_failed`. Useful fields:

| Field | Meaning |
| --- | --- |
| `lab` | Parsed Lab ID |
| `student` | Parsed Student ID |
| `evidence` | Exact compact Completion Evidence |
| `failure_category` | Bounded category (`connection_failed`, `timeout`, `backend_rejected`, `unexpected_response`) |
| `backend_status` | HTTP status when available |
| `backend_error` | Recognized backend error code when available |

Replay the exact logged evidence (no durability guarantee for logs; repeating
the completion action is the fallback):

```sh
curl --fail-with-body \
  -H 'Content-Type: application/jose' \
  --data-binary 'COMPACT_EVIDENCE_FROM_LOG' \
  'https://BACKEND_HOST/api/completion-claims'
```

Backend `stored` or `already_exists` completes recovery.

## Manual key rotation

1. Generate a new private key under a new `kid`.
2. Add the emitted public-key entry to the backend's `trusted_keys` while
   retaining the old entry, then restart or redeploy the backend so it loads
   both keys.
3. Update the relay configuration to the new `kid` and private-key path, then
   restart the relay.
4. Replay or explicitly abandon any outstanding failure evidence signed by the
   old key.
5. Remove the old public-key entry, then restart or redeploy the backend.
6. Retire the old private key through private infrastructure.

The overlap preserves manual replay of old evidence. There is no automated
rotation, fixed grace period, or new recovery mechanism.
