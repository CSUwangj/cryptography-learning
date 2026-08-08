# Use a static Vite SPA and an Axum service

The supported web tier is a static Vite, React, and TypeScript SPA backed by a
Rust workspace using Tokio, Axum, and async-graphql. It retains npm and committed
lockfiles, GraphQL over HTTP, separate raw Lab terminal WebSockets, SQLx with
SQLite for local durable state, and Ed25519 through `ed25519-dalek`; browser-side
Learning execution stays in typed modules, with module Web Workers reserved for
CPU-heavy or interruptible work.

We chose this foundation over a React meta-framework, JavaScript monorepo
manager, continued Warp use, and a separate database server because the web tier
is a small independently deployable SPA and service with low write concurrency.
Toolchains are exact-pinned and lockfiles capture tested dependency versions,
but package patch versions are maintenance choices rather than architectural
commitments. The research snapshot, compatibility evidence, alternatives, and
cutover constraints are preserved in
[issue #2](https://github.com/CSUwangj/cryptography-learning/issues/2).
