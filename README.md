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
private content repo, not here.

## Deploy independently

Run the web tier from this checkout with the checked-in synthetic content:

```bash
CONTENT_DIR="$PWD/baseline/content" docker compose up --build -d
```

This starts a safe demo only; `baseline/content` contains synthetic fixtures, not
real Labs. For a real deployment, set `CONTENT_DIR` to an operator-provided
directory containing `config.ron` and the Lab Description files it references.
Compose mounts that directory read-only. See [deployment](docs/deployment.md) for
the full contract.

The separate [infrastructure repository](https://github.com/CSUAuroraLab/cryptography-learning-infra)
is available for managed course-Host orchestration, but is not required to deploy
this web tier.

## Characterization baseline

Capture current deployable behavior (SPA routes, static assets, Practice
GraphQL/RON loading, terminal WebSocket path, known terminal defects) against
the Linux container with one command:

```bash
./baseline/run.sh
```

See [`baseline/README.md`](baseline/README.md). Locally that remains a
one-command build-and-test. CI builds the image with Buildx (cached BuildKit
layers) and runs the explicit-image acceptance command without rebuilding.

## Building

Both halves build independently from a clean checkout.

```bash
cd backend
cargo build --locked --release
```

```bash
cd frontend
npm ci
npm run typecheck
npm test
npm run build
```

The frontend needs the Node version in `frontend/.nvmrc` (Node 24 / npm 11).
`VITE_FEEDBACK_URL` is baked into the bundle at build time, so set it to get a
working feedback link — CI passes the value the deployed site uses. Do not put
secrets in `VITE_*` variables; they are public to the browser bundle.

Running the backend needs a `config.ron` and a directory of static files:

```bash
cd backend
cargo run -- --static ../frontend/dist -vv config.ron
```

`config.ron` is Host-local and deliberately not committed; `backend/apps/web-server/example.ron` is
the sample. Lab Description paths inside it resolve relative to the working
directory.

## The schema contract

`frontend/schema/schema.gql` is a hand-maintained copy of the schema `async-graphql`
derives from the Rust types in `backend/apps/web-server/src/model.rs` — `#[Object] impl Query` for
the root, and the `SimpleObject` structs for everything else — and serves it from
the running process. `schema.gql` here is a human transcription of that. CI fails
when the copy drifts (`backend/apps/web-server/tests/schema_parity.rs`).
