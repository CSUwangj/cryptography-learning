# Where these files come from

`schema.gql` is **a hand-maintained copy, not generated output.** Nothing currently
checks it against the backend. Joining the two halves into this repo is what makes
that check possible; adding it is tracked as
`CSUAuroraLab/cryptography-learning-infra#6`.

## The chain

The backend never writes a schema file. `async-graphql` derives the schema at
runtime from the Rust types in `backend/src/model.rs` — `#[Object] impl Query` for
the root, and the `SimpleObject` structs for everything else — and serves it from
the running process. `schema.gql` here is a human transcription of that.

`graphql-codegen` then reads `schema.gql` together with the operations in
`query.gql` and `fragment.gql`, per `../.codegen.yml`, and writes:

- `../src/generated/graphql.tsx` — typed hooks the components import
- `../src/generated/fragmentTypes.json` — the Apollo fragment matcher

So the frontend's types are derived from *this file*, not from the backend. If this
file drifts from the Rust types, the generated types are wrong in a way that
compiles cleanly and fails at runtime. That is the failure ADR-0002 exists to
prevent.

Regenerate the client types after editing any of these files:

```bash
cd frontend && npm run gen
```

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
