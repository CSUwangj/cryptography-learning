# Application manifest contract

The public web tier consumes a generated RON application manifest. The root is
still `Configuration(...)` and the existing `practice` shape is intentionally
unchanged for the cutover. `schema_version: 1` is required for the current
backend.

The backend deserializes every manifest type with unknown-field rejection and
then validates the schema version before constructing the application. A
manifest must contain unique category and Lab IDs, valid relative content
paths, non-empty display data, and endpoints with a host and a port in
`1..=65535`. Validation errors include the relevant collection/index path (or
the conflicting IDs) so a Host operator can correct the generated input.

## Generator and Host responsibilities

The public application owns the schema and validation rules. The Host-only
configuration consists of the generated endpoint values and content resource
paths; those values must not be inferred from public application defaults.
Hosts should render a complete manifest to a temporary file on the same
filesystem, flush and close it, then atomically rename it over the active
manifest before starting or restarting the backend. The backend reads one
manifest during fail-before-serve bootstrap and does not watch or mutate it.

The additive version field is deliberate rollback compatibility: the previous
backend's `Configuration(practice: ...)` deserializer ignores the new
`schema_version` field and can therefore read the version-1 fixture at
`backend/apps/web-server/tests/fixtures/versioned-manifest.ron`.
