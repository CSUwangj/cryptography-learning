# Where these files come from

`schema.gql` is **a hand-maintained copy, not generated output.** CI compares it
against the SDL `async-graphql` derives from `backend/src/model.rs` on every push
(`backend/tests/schema_parity.rs`).

## The chain

The backend never writes a schema file. `async-graphql` derives the schema at
runtime from the Rust types in `backend/src/model.rs` — `#[Object] impl Query` for
the root, and the `SimpleObject` structs for everything else — and serves it from
the running process. `schema.gql` here is a human transcription of that.

Feature modules own their GraphQL operation documents. `graphql-codegen` reads
`schema.gql` together with those documents (see `../.codegen.yml`) and writes the
GraphQL Code Generator client preset under `../src/transport/generated/` — typed
documents and operation result types used inside feature mapping layers.

Practice documents live under `../src/practice/graphql/`. Transport-owned smoke
documents (for example `Hello`) live under `../src/transport/graphql/`. Generated
GraphQL types must not become cross-module domain types; feature modules map
results into local domain shapes.

So the frontend's types are derived from *this file*, not from the backend. If this
file drifts from the Rust types, the generated types are wrong in a way that
compiles cleanly and fails at runtime. That is the failure ADR-0002 exists to
prevent.

Regenerate the client types after editing the schema or any module GraphQL
document:

```bash
cd frontend && npm run gen
```

CI runs generation and fails if the tree is dirty, so committed generated output
must stay in sync.

## Reading it against the Rust types

Two transformations to expect when comparing by eye, both of which a naive text
diff will report as differences:

- `async-graphql` camel-cases field names, so `ws_endpoints` becomes `wsEndpoints`.
- Fields marked `#[graphql(skip)]` are absent here. `ResourceWithTranslation` has a
  `resource: String` field in Rust — the path to the Lab Description on disk — and
  it is correctly not in the schema, because it is a server-side detail.

Also note `directive @ifdef on FIELD` on the first line. The backend does not emit
it; it was added by hand for tooling. Whatever implements the parity gate has to
account for it rather than treat it as drift.

## Verified correspondence

Checked by hand at the time this repo was assembled: every type and field in
`schema.gql` corresponds to `backend/src/model.rs`, and the only Rust field absent
is the skipped `resource`. This is a point-in-time statement, which is exactly why
it needs to become a CI gate.
