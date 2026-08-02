# Linux image operation

The web tier is one immutable Linux image. CI builds it from the pinned Rust and
Node toolchains and committed lockfiles, then records the resulting image digest.
The production Host promotes that digest; it does not rebuild source during a
maintenance window. Lab Descriptions, images, and the generated RON manifest stay
in the private content repository and are mounted read-only.

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

## Promotion and rollback

During a maintenance window with no active Lab sessions, record the candidate and
currently running digests. Start the candidate with the private content directory
mounted read-only, then verify health, root and nested routes, static assets,
Practice GraphQL, one classroom-browser terminal session, and five minutes of clean
logs. The Host retains the previous image digest and its last known-good compatible
manifest; neither is edited in place.

If startup, routing, GraphQL, terminal, browser, or health checks regress, stop the
candidate and restart the previous image by digest with the retained manifest:

```bash
docker compose up -d --no-build --force-recreate
```

The deployment repository supplies the exact digest-pinned compose override and
rollback command. No database reversal is required for this stateless web tier.

## Ownership

This repository owns the image, startup contract, health routes, and acceptance
checks. The private infrastructure repository owns Host orchestration, digest
promotion, generated manifest values, secrets, and persistent mounts. This public
repository must never contain private Lab content or deployment credentials.
