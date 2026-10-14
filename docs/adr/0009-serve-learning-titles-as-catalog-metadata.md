# Serve Learning titles as catalog metadata

## Status

Accepted decision; implementation pending under phase P1 of
[#95](https://github.com/CSUWangj/cryptography-learning/issues/95).

Learning navigation needs readable names before a student opens a Lesson.
Following the Practice catalog delivery pattern, the backend will return title
metadata in the Learning catalog. Existing locale documents remain the only
authored source of `title`; configuration does not gain a duplicate name.

This deliberately narrows the current opaque-document boundary: the backend reads
only the metadata needed to resolve titles, including `default_locale`, while
Lesson compilation and cryptographic graph validation remain frontend concerns.
Prefer the requested language, then the default locale. Unavailable metadata affects
only its Lesson; retain the item and expose the unavailable-title state for a
localized label plus stable ID. Existing Lesson diagnostics remain accessible.

The alternative of fetching every full Lesson document in the frontend preserves
the old backend boundary but couples menu labels to those document reads. Duplicated
configuration names create competing authored sources. The maintainer chose backend
metadata extraction in
[Q6/Q8](https://github.com/CSUWangj/cryptography-learning/issues/94#issuecomment-6145126690).

Preserve request-time content semantics and the GraphQL schema parity contract.
No new cache, content-build pipeline, startup validation guarantee or full Rust
Lesson compiler is authorized. Selecting a suitable YAML parser is an explicit
P1 prerequisite; no dependency has been selected or installed by this decision.
