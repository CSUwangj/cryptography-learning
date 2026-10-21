# Rust YAML Parser Research for Issue #102

## Question

Identify parser candidates for extracting only Lesson catalog metadata (`title`
and `default_locale`) in the backend, and check their published Rust minimum
version and documented YAML/API fit against the repository's Rust 1.97 toolchain.
This is evidence for a maintainer decision; it does not select or add a dependency.

## Repository evidence

- The backend package declares `rust-version = "1.97"` in
  [`backend/apps/web-server/Cargo.toml`](../../backend/apps/web-server/Cargo.toml).
- The workspace pins Rust 1.97.0 in [`rust-toolchain.toml`](../../rust-toolchain.toml).
- Current `lesson.yaml` files expose top-level `default_locale`; current locale
  files expose top-level `title`. Examples include
  [`aes-128-demo/lesson.yaml`](../../baseline/content/lessons/aes-128-demo/lesson.yaml),
  [`en-US.yaml`](../../baseline/content/lessons/aes-128-demo/locales/en-US.yaml),
  and [`zh-CN.yaml`](../../baseline/content/lessons/aes-128-demo/locales/zh-CN.yaml).
  Titles use both quoted and plain scalar forms; no broader YAML syntax is
  required by the observed metadata examples.
- The backend already depends on Serde, but no YAML parser is present in the
  workspace lockfile or web-server manifest at the time of inspection.

## Candidates

| Candidate | Published version checked | Rust requirement | Relevant documented fit | Limit |
| --- | --- | --- | --- | --- |
| `serde_yaml_ng` | 0.10.0 | `rust-version = "1.64"` | Serde YAML data format; documented `from_str` deserializes YAML into a Rust value/type, matching existing Serde use and the small metadata structs needed here. | Its own docs identify it as a Serde YAML format but do not make a YAML 1.2 conformance claim on the inspected crate page. Static metadata/API evidence only; not compiled in this repository. |
| `saphyr` | 0.2.2 | `rust-version = "1.85.0"` | Describes itself as fully YAML 1.2 compliant and documents `Yaml::load_from_str`, which parses into YAML documents/nodes. | Lower-level node access than direct Serde deserialization. Static metadata/API evidence only; not compiled in this repository. |
| `yaml-rust2` | 0.13.0 | `rust-version = "1.85.0"` | Describes itself as a fully YAML 1.2-compliant parser and pure-Rust YAML 1.2 implementation. | Parser/node-oriented API rather than a Serde deserializer; more mapping/scalar handling is left to the caller for this use. Static evidence only; not compiled in this repository. |
| `serde_yaml` | 0.9.34+deprecated | `rust-version = "1.64"` | Serde deserialization API would fit the metadata shape. | The published latest crate is explicitly marked deprecated, so its low MSRV alone is not a sufficient reason to select it. |

All listed declared MSRVs are older than the repository's pinned Rust 1.97.0.
This is published compatibility evidence, not a build proof for the selected
version and its resolved dependency graph.

## Focused compatibility probe

With explicit maintainer authorization, a temporary Cargo project under `/tmp`
used `serde_yaml_ng = "=0.10.0"` and the pinned Rust 1.97.0 toolchain. The
probe deserialized the five valid checked-in `lesson.yaml` files and all nine
matching locale files into structs containing only `default_locale` or `title`.
It successfully handled quoted and plain scalar titles, including English and
Chinese examples. It also confirmed that the intentionally malformed
`baseline/content/lessons/malformed-yaml/lesson.yaml` fixture returns a parse
error. The malformed fixture was checked separately and is not counted as valid
metadata coverage.

Result: compilation and parsing passed; the probe and its Cargo lockfile remain
outside the repository. This demonstrates the tested version/toolchain/sample
combination, not support for every possible authored YAML document or full
Lesson validation.

## Primary sources

- Backend package manifest and existing metadata examples: repository files
  linked above.
- `serde_yaml_ng` 0.10.0 published manifest:
  <https://docs.rs/crate/serde_yaml_ng/0.10.0/source/Cargo.toml>
- `serde_yaml_ng` 0.10.0 crate page and `from_str` example:
  <https://docs.rs/crate/serde_yaml_ng/0.10.0>
- `saphyr` 0.2.2 published manifest:
  <https://docs.rs/crate/saphyr/0.2.2/source/Cargo.toml>
- `saphyr` 0.2.2 crate page and parser example:
  <https://docs.rs/crate/saphyr/0.2.2>
- `yaml-rust2` 0.13.0 published manifest:
  <https://docs.rs/crate/yaml-rust2/0.13.0/source/Cargo.toml>
- `yaml-rust2` 0.13.0 crate page:
  <https://docs.rs/crate/yaml-rust2/0.13.0>
- `serde_yaml` published latest page, showing version 0.9.34+deprecated:
  <https://docs.rs/crate/serde_yaml/latest>
- `serde_yaml` 0.9.34+deprecated published manifest:
  <https://docs.rs/crate/serde_yaml/0.9.34%2Bdeprecated/source/Cargo.toml>

## Decision-relevant conclusion

If the maintainer values direct Serde deserialization for only the observed
metadata fields, `serde_yaml_ng` has the closest documented API fit and a
published MSRV below the pinned toolchain. If YAML 1.2 conformance is the
deciding criterion, `saphyr` and `yaml-rust2` make an explicit conformance claim
and also publish MSRVs below the pin, at the cost of a lower-level parsing API.
The ticket does not establish a requirement to validate full Lesson YAML or to
prefer YAML 1.2 conformance over the existing metadata syntax.

The maintainer selected `serde_yaml_ng` 0.10.0 for this metadata-only use after
reviewing the probe evidence. The decision and its scope are recorded in
[issue #102](https://github.com/CSUwangj/cryptography-learning/issues/102#issuecomment-6321878055).
The probe downloaded and built the candidate only in `/tmp`; no repository
dependency was added by this decision record.
