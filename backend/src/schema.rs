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
/// Strips comments, blank lines, frontend-only tooling directives such as
/// `@ifdef`, and the root `schema { ... }` block that `async-graphql` emits
/// but the frontend copy omits.
pub fn normalize_schema_sdl(sdl: &str) -> String {
    let mut in_schema_block = false;

    sdl.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !line.starts_with('#'))
        .filter(|line| !line.starts_with("directive @ifdef"))
        .filter_map(|line| {
            if line.starts_with("schema {") {
                in_schema_block = true;
                return None;
            }
            if in_schema_block {
                if line == "}" {
                    in_schema_block = false;
                }
                return None;
            }
            Some(line)
        })
        .collect::<Vec<_>>()
        .join("\n")
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
    fn backend_sdl_normalizes_without_frontend_copy() {
        let backend = normalize_schema_sdl(&backend_schema_sdl());
        assert!(backend.contains("type Query"));
        assert!(!backend.contains("schema {"));
    }
}
