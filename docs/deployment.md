# Deploy the web tier

This repository can deploy the public web tier on its own. Docker Compose builds
the checked-out source by default and mounts an operator-provided content directory
read-only. The private infrastructure repository is only needed when operating the
maintained course Host.

## Standalone example

From a checkout, start the web tier with the synthetic fixture tracked here:

```bash
CONTENT_DIR="$PWD/baseline/content" docker compose up --build -d
```

It is ready when `http://127.0.0.1:8000/health/ready` returns successfully. Stop
the example with `docker compose down`.

The fixture is intentionally synthetic and contains no private Lab content. To run
real Labs, replace `CONTENT_DIR` with a directory that contains `config.ron` and
every Lab Description or resource referenced by that configuration. Compose mounts
the directory at `/content` and does not modify it.

To run an already-built image instead of building this checkout, set
`WEB_TIER_IMAGE` and use `--no-build`:

```bash
WEB_TIER_IMAGE=registry.example/cryptography-learning:version \
  CONTENT_DIR=/path/to/content \
  docker compose up --no-build -d
```

This Compose example is Practice-only: it does not supply Completion process
options. See [Completion-enabled operation](#completion-enabled-operation) when
the optional Completion module is required.

## Local development and acceptance

Use the checked-in fixture to exercise the same image contract used by CI:

```bash
./baseline/run.sh
```

For browser acceptance against a running image:

```bash
docker compose up -d --build
cd frontend
npm ci
npx playwright install chromium
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000 npm run test:terminal-browser -- --grep 'Linux web-tier acceptance'
```

The content mount is read-only. Readiness means configuration, the Practice
Catalog, and the static SPA index were loaded; it does not probe Challenge hosts.

Release candidates repeat the browser acceptance against the same digest in each
engine, including the classroom Linux browser environment:

```bash
for browser in chromium firefox webkit; do
  npx playwright install "$browser"
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000 npx playwright test --browser "$browser" --grep 'Linux web-tier acceptance'
done
```

The terminal session is also checked manually from the classroom browser during
the promotion window because its network path and clipboard policy are deployment
properties, not properties a local container test can prove.

Native terminal keyboard compatibility has a deliberately narrow supported matrix
and separate evidence procedures in [native terminal keyboard compatibility](native-terminal-compatibility.md).
The Linux Playwright checks above are regression coverage, not native-platform
evidence, and native-matrix failures do not gate web-image releases.

## Public web-image releases

Public operators may pull a supported `web-v<major>.<minor>.<patch>` image and
run it with the synthetic content tracked in this repository:

```bash
docker pull ghcr.io/csuwangj/cryptography-learning:0.1.0
WEB_TIER_IMAGE=ghcr.io/csuwangj/cryptography-learning:0.1.0 \
  CONTENT_DIR="$PWD/baseline/content" \
  docker compose up --no-build -d
```

The release workflow tests the exact Linux AMD64 candidate in Chromium,
Firefox, and WebKit before it is attested and published. No `latest` tag is
published. The newest release receives fixes; older releases remain pullable
and the immediately previous release is the rollback candidate. The maintained
course Host remains on the local Git-build path described below, rather than
pulling published images.

### First public release checkpoint

GitHub creates a new Container registry package as private. Before the first
public release, a maintainer must use that package's GitHub settings page to
set its visibility to public. The release workflow's final anonymous pull is
the enforcement point: if it fails on the first `web-v0.1.0` run, set the
package public in the UI and rerun the failed verification job. Do not bypass
the anonymous-pull check.

## Practice-only versus Completion-enabled

Completion is runtime-optional.

| Mode | Process options | Behavior |
| --- | --- | --- |
| Practice-only | Both `COMPLETION_CONFIG` / `--completion-config` and `COMPLETION_DB` / `--completion-db` absent | Existing Practice experience with Completion disabled. Completion GraphQL returns `COMPLETION_NOT_CONFIGURED`. `POST /api/completion-claims` is not registered. |
| Completion-enabled | Both options supplied | Loads Completion policy RON, opens durable SQLite, runs embedded migrations, then serves. |
| Invalid | Exactly one of the pair supplied | Startup fails before the listener binds. |

There is no automatic repair, database downgrade, database recreation, or
in-memory fallback. Configuration parse failure, missing database parent,
open/locking failure, or migration failure stops startup.

## Completion-enabled operation

Supply synthetic placeholders only in public examples. Private paths, keys,
schedules, storage destinations, credentials, and Host orchestration belong in
private infrastructure and must not be copied into this repository.

### Paired configuration

Example policy document shape (values are placeholders):

```ron
CompletionConfiguration(
  course_run: "COURSE_RUN",
  trusted_keys: [
    (kid: "KID", public_key_hex: "PUBLIC_KEY_HEX"),
  ],
)
```

Both environment variables (or their `--long` CLI equivalents) must be supplied
together. A Compose override for Completion-enabled operation adds them to the
web-tier service environment and mounts the persistent paths:

```yaml
services:
  web-tier:
    environment:
      COMPLETION_CONFIG: /completion/completion.ron
      COMPLETION_DB: /completion/claims.sqlite
    volumes:
      - ${COMPLETION_DIR}:/completion
```

The database parent directory must already exist before startup. Mount the
Completion policy file and SQLite path persistently across restarts. The store
uses SQLite WAL mode; retain the database file and its WAL/SHM companions as one
unit when copying.

Embedded migrations run at process start before serving. Do not hand-edit the
schema or invent a downgrade path.

### Host Completion Relay

Key generation, backend registration, rotation, failed-delivery evidence, and
manual replay are documented in
[backend/apps/completion-relay/README.md](../backend/apps/completion-relay/README.md).
Link there rather than duplicating those procedures. Relay delivery during
web-tier downtime follows that document's failure-log / manual-replay path, or
the student repeats the completion action.

### Weekly cold backup and restore

The maintained Host must not enable Completion until private infrastructure
satisfies
[infrastructure issue #20](https://github.com/CSUAuroraLab/cryptography-learning-infra/issues/20).
That private issue gates maintained-Host enablement; it does not block closing
the public Completion feature work in this repository.

While Completion is enabled, operators must:

- retain at least one successfully created, restorable Completion database
  backup no more than seven days old;
- create a new backup before replacing the prior successful backup;
- use a cold backup: stop the web tier cleanly, copy the SQLite database while
  it is unopened, restart, and verify readiness;
- accept brief scheduled downtime (ADR 0005);
- restore manually during a maintenance window, then verify readiness plus
  current and historical Completion Board reads.

This repository documents the safe procedure and contract only. Scheduling,
destination, retention beyond the newest valid backup, storage credentials,
encryption, alerting, and restore exercises belong to infrastructure issue #20.
Do not add a backend scheduler, background backup task, feature flag, or
deployment configuration here.

Cold backup sketch (placeholders):

```bash
# 1. Stop the web tier cleanly so the SQLite files are unopened.
# 2. Copy COMPLETION_DB and its WAL/SHM companions to the backup destination.
# 3. Restart the web tier with the same paired Completion options.
# 4. Verify /health/ready, then current and historical board reads.
```

Restore uses the same maintenance-window stop / replace / start / verify
sequence with a known-good backup copy.

### Image rollback with Completion storage

Image rollback retains the Completion database unchanged. Restart the previous
image digest with the same persistent Completion mount and paired options.

A prior Practice-only image may temporarily hide Completion Records (no
Completion module registered) but must not delete, downgrade, or rewrite the
Completion database. Re-enabling Completion on a Completion-capable image
reopens the retained store.

## Course Run transition

There is no relay queue to drain, automated Course Run transition, database
rewrite, or supported mixed-Course-Run period. Perform the change during one
manual maintenance window:

1. Replay or explicitly abandon any known failed delivery evidence for the old
   Course Run (see the relay README).
2. Take the cold backup described above.
3. Update the backend Completion policy and every relay configuration to the
   same new Course Run as one coordinated change.
4. Restart them and verify web-tier readiness and relay health.
5. Verify `/completion` shows the new empty board.
6. Verify `/completion/<old-course-run-id>` still shows historical records.
7. Archive legacy unsigned record files separately. Never import them as
   Completion Records.

Historical Course Run links are distributed out of band; there is no Course Run
discovery endpoint.

## Managed Host promotion and rollback

During a maintenance window with no active Lab sessions, record the candidate and
currently running digests. Start the candidate with the private content directory
mounted read-only, then verify health, root and nested routes, static assets,
Practice GraphQL, one classroom-browser terminal session, and five minutes of clean
logs. When Completion is enabled, also verify the persistent Completion mount,
readiness after migrations, and current/historical board reads. The Host retains
the previous image digest and its last known-good compatible manifest; neither is
edited in place.

If startup, routing, GraphQL, terminal, browser, or health checks regress, stop the
candidate and restart the previous image by digest with the retained manifest:

```bash
docker compose up -d --no-build --force-recreate
```

The deployment repository supplies the exact digest-pinned compose override and
rollback command. Practice-only operation has no Completion database to reverse.
Completion-enabled operation retains the persistent SQLite store across image
rollback as described above; do not treat the web tier as universally
database-free.

## Ownership

This repository owns the image, startup contract, health routes, Completion
optional-module contract, public operator procedures above, and acceptance
checks. Independent operators own their Compose invocation and supplied content.
For the maintained course Host, the private infrastructure repository owns Host
orchestration, digest promotion, generated manifest values, secrets, persistent
mounts, and the weekly backup scheduler tracked by infrastructure issue #20.
This public repository must never contain private Lab content or deployment
credentials.
