# Characterization baseline

Executable capture of the **current** deployable web-tier behavior before
modernization (issue #12). Checks run against the Linux container image and a
protocol-faithful Challenge WebSocket fixture. Known terminal defects are
documented in `terminal/known_defects.md` rather than asserted as requirements.

## One command

From a fresh checkout with Docker available:

```bash
./baseline/run.sh
```

That builds the root `Dockerfile`, starts Compose with `baseline/content` as
`CONTENT_DIR`, waits for HTTP readiness, and runs the characterization suite.

CI builds and loads the same image with Docker Buildx (BuildKit layers restored
and exported under the `baseline-web-tier` GitHub Actions cache scope), then
invokes this script with `BASELINE_SKIP_BUILD=1` so characterization runs
against the loaded image without a second rebuild.

## What is covered

| Seam | Location |
| --- | --- |
| Root SPA shell | `tests/test_http_spa.py` |
| Nested-route SPA fallback | `tests/test_http_spa.py` |
| Static assets + content `img/` | `tests/test_http_spa.py` |
| Practice catalog order/content | `tests/test_graphql.py` + `fixtures/graphql/` |
| Lab Description / RON loading | `tests/test_graphql.py` |
| Stable GraphQL response fixtures | `fixtures/graphql/*.json` |
| Terminal WS connection path | `tests/test_terminal.py` + `terminal/fixture.py` |
| Known terminal defects registry | `terminal/known_defects.md` |
| Schema SDL parity | existing `backend/tests/schema_parity.rs` (CI Backend job) |

## Fixture content

`baseline/content/` is a minimal in-repo stand-in for the private content
repository: a checked-in fixture `config.ron`, Lab Description markdown, and a
tiny `img/` asset. Production Hosts continue to mount the private content repo.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `CONTENT_DIR` | `baseline/content` | RON + Lab Descriptions mounted into the container |
| `WEB_HTTP_PORT` | `8000` (or `18000` if busy) | Host port published by Compose |
| `BASELINE_BASE_URL` | `http://127.0.0.1:$WEB_HTTP_PORT` | Web tier URL under test |
| `BASELINE_SKIP_BUILD` | unset | When `1`, start Compose with `--no-build` (CI after Buildx load) |
