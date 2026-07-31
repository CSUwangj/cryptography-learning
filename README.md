# cryptography-learning

The web tier of the Cryptography Learning platform: a Rust GraphQL/WebSocket
backend and a React/TypeScript client, in one repository so that a schema change
and its client update land together.

Students read a Lab's Description in the browser and attack a running server-side
Challenge, either from a terminal embedded in the page or with their own tooling.

| Path | Contents |
| ----------- | ----------------------------------------------------------- |
| `backend/` | Rust backend — serves the GraphQL API and the static bundle |
| `frontend/` | React client, and the GraphQL schema copy it generates types from |

The Challenges themselves, the Lab Descriptions and the Lab Registry live in the
private content repo, not here. Deploy from the private infra repo:

```bash
python3 $INFRA/tools/deploy.py up \
  --role web-and-labs \
  --hostname localhost \
  --code-dir /path/to/cryptography-learning \
  --content-dir /path/to/cryptography-learning-content
```

See [cryptography-learning-infra](https://github.com/CSUAuroraLab/cryptography-learning-infra)
for Host roles, verification and cutover docs. Per ADR-0002 the split is on who may
read a thing, not on which component it belongs to — this repo is the public half.

## Characterization baseline

Capture current deployable behavior (SPA routes, static assets, Practice
GraphQL/RON loading, terminal WebSocket path, known terminal defects) against
the Linux container with one command:

```bash
./baseline/run.sh
```

See [`baseline/README.md`](baseline/README.md). CI runs the same command on every
push.

## Building

Both halves build independently from a clean checkout.

```bash
cd backend
cargo build --locked --release
```

```bash
cd frontend
npm ci
npm run build
```

The frontend needs the Node version in `frontend/.nvmrc`; `react-scripts` 3.4.3
does not run on current Node. `REACT_APP_FEEDBACK_URL` is baked into the bundle at
build time, so set it to get a working feedback link — CI passes the value the
deployed site uses.

Running the backend needs a `config.ron` and a directory of static files:

```bash
cd backend
cargo run -- --static ../frontend/build -vv config.ron
```

`config.ron` is Host-local and deliberately not committed; `backend/example.ron` is
the sample. Lab Description paths inside it resolve relative to the working
directory.

## The schema contract

`frontend/schema/schema.gql` is a hand-maintained copy of the schema `async-graphql`
derives from the Rust types in `backend/src/model.rs` — `#[Object] impl Query` for
the root, and the `SimpleObject` structs for everything else — and serves it from
the running process. `schema.gql` here is a human transcription of that. CI fails
when the copy drifts (`backend/tests/schema_parity.rs`).

## How this repo was assembled

A flat copy of two repositories into a fresh tree, per ADR-0008, so **history begins
here.** To trace why any file looks the way it does, go to the archived originals
(readable, not deleted):

- `CSUAuroraLab/cryptography-learning-backend`
- `CSUAuroraLab/cryptography-learning-frontend`

Every tracked file from both came across unchanged. What differs is the surrounding
scaffolding:

- **Four workflows became one.** Only workflows at the repository root run, so the
  two `.github/` directories could not simply be nested. `.github/workflows/build.yml`
  builds both halves on every push.
- **The two `Publish` workflows were not carried over,** and neither were the
  release-shaped parts of the two build workflows: the backend's four-target matrix
  (Windows, macOS, armv7) and its musl static-build job, and the artifact uploads
  from both. All of it produced loose per-platform artifacts for a `deploy.sh` that
  fetched `releases/latest`. ADR-0007 replaces that with a single Linux web image; the
  Host builds that image locally via the infra repo's `deploy.py`.
- **`frontend/.nvmrc` is new.** The build job needs an exact Node pin, and a file
  both CI and a local checkout read is better than a value repeated per workflow.
- **`frontend/schema/README.md` is new,** documenting where the schema copy comes
  from.
- **The two `.gitignore` files were left where they are,** and the new root one holds
  only what neither subdirectory can cover from inside its own subtree.

`frontend/docker/` is an unused container stack that never worked; the live web tier
is the root `Dockerfile` built by Compose.

## Licensing needs a decision

Both originals are MIT with the same terms but **different copyright holders** — the
backend's names `CSUAuroraLab`, the frontend's names `CSUwangj`. Both files are
preserved as `backend/LICENSE` and `frontend/LICENSE` rather than merged, because
picking a holder for the combined work is the maintainer's call, not a mechanical
one. There is deliberately no root `LICENSE` until that is decided.
