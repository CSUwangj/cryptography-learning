use async_graphql::{EmptyMutation, EmptySubscription, Schema};

use crate::model::Query;

/// SDL derived from the Rust types the backend serves.
pub fn backend_schema_sdl() -> String {
    Schema::build(Query, EmptyMutation, EmptySubscription)
        .finish()
        .sdl()
}

/// Normalize SDL for comparison with the frontend's hand-maintained copy.
///
/// Strips comments, blank lines, GraphQL description blocks, frontend tooling
/// and known GraphQL built-in directive declarations, and the root
/// `schema { ... }` block that async-graphql emits but the frontend copy omits.
pub fn normalize_schema_sdl(sdl: &str) -> String {
    let mut in_schema_block = false;
    let mut in_description = false;

    sdl.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !line.starts_with('#'))
        .filter(|line| {
            if in_description {
                if line.ends_with("\"\"\"") {
                    in_description = false;
                }
                return false;
            }
            if line.starts_with("\"\"\"") {
                if !(line.len() > 3 && line.ends_with("\"\"\"")) {
                    in_description = true;
                }
                return false;
            }
            if is_ignored_directive(line) {
                return false;
            }
            if line.starts_with("schema {") {
                in_schema_block = true;
                return false;
            }
            if in_schema_block {
                if *line == "}" {
                    in_schema_block = false;
                }
                return false;
            }
            true
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn is_ignored_directive(line: &str) -> bool {
    let Some(name) = line.strip_prefix("directive @") else {
        return false;
    };
    let name = name
        .split(|ch: char| !ch.is_ascii_alphanumeric() && ch != '_')
        .next();
    matches!(
        name,
        Some("ifdef")
            | Some("skip")
            | Some("include")
            | Some("deprecated")
            | Some("specifiedBy")
            | Some("oneOf")
            | Some("defer")
            | Some("stream")
    )
}

#[cfg(test)]
mod tests {
    use super::{backend_schema_sdl, normalize_schema_sdl};

    #[test]
    fn normalize_strips_frontend_only_directives_and_schema_root() {
        let input = r#"
# comment
directive @ifdef on FIELD

type Query { hello: String! }

schema {
  query: Query
}
"#;

        assert_eq!(normalize_schema_sdl(input), "type Query { hello: String! }");
    }

    #[test]
    fn normalize_strips_builtin_directives_and_descriptions() {
        let input = r#"
type Query { hello: String! }
"""
Directs the executor to include this field.
"""
directive @include(if: Boolean!) on FIELD
"""
Skip.
"""
directive @skip(if: Boolean!) on FIELD
"#;
        assert_eq!(normalize_schema_sdl(input), "type Query { hello: String! }");
    }

    #[test]
    fn normalize_preserves_unknown_directives_for_parity() {
        let input = "directive @custom on FIELD\ntype Query { hello: String! }";
        assert_eq!(normalize_schema_sdl(input), input);
    }

    #[test]
    fn backend_sdl_normalizes_without_frontend_copy() {
        let backend = normalize_schema_sdl(&backend_schema_sdl());
        assert!(backend.contains("type Query"));
        assert!(!backend.contains("schema {"));
        assert!(!backend.contains("directive @oneOf"));
    }
}
