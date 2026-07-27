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
private content repo, not here. The Deployment definition and the deploy pipeline
live in the private infra repo. Per ADR-0002 the split is on who may read a thing,
not on which component it belongs to — this repo is the public half.

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
derives from the Rust types in `backend/src/model.rs`, and nothing verifies the copy
matches. Joining the two halves here is what makes that check possible; see
`frontend/schema/README.md` for the full chain and
`CSUAuroraLab/cryptography-learning-infra#6` for the gate itself.

## How this repo was assembled

A flat copy of two repositories into a fresh tree, per ADR-0008, so **history begins
here.** To trace why any file looks the way it does, go to the originals, which are
kept and must not be deleted:

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
  fetched `releases/latest`. ADR-0007 replaces that with a single Linux web image, so
  CI here only proves both halves build; publishing the image is
  `CSUAuroraLab/cryptography-learning-infra#5`. The originals remain in the archived
  repos.
- **`frontend/.nvmrc` is new.** The build job needs an exact Node pin, and a file
  both CI and a local checkout read is better than a value repeated per workflow.
  Reproducibility of the *publish* path is a separate concern and belongs to
  `CSUAuroraLab/cryptography-learning-infra#5`.
- **`frontend/schema/README.md` is new,** documenting where the schema copy comes
  from.
- **The two `.gitignore` files were left where they are,** and the new root one holds
  only what neither subdirectory can cover from inside its own subtree. Git applies a
  `.gitignore` to its own subtree, so merging them upward would have meant
  re-anchoring every rule by hand for no gain.

Everything else was left alone on purpose, including `frontend/docker/` — an unused
container stack that never worked, whose deletion belongs to
`CSUAuroraLab/cryptography-learning-infra#5`.

## Licensing needs a decision

Both originals are MIT with the same terms but **different copyright holders** — the
backend's names `CSUAuroraLab`, the frontend's names `CSUwangj`. Both files are
preserved as `backend/LICENSE` and `frontend/LICENSE` rather than merged, because
picking a holder for the combined work is the maintainer's call, not a mechanical
one. There is deliberately no root `LICENSE` until that is decided.
