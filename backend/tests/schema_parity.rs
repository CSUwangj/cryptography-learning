use std::fs;
use std::path::PathBuf;

use cryptography_learning_backend::schema::{backend_schema_sdl, normalize_schema_sdl};

fn frontend_schema_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("frontend")
        .join("schema")
        .join("schema.gql")
}

#[test]
fn frontend_schema_matches_backend_sdl() {
    let frontend_path = frontend_schema_path();
    let frontend_sdl = fs::read_to_string(&frontend_path).unwrap_or_else(|err| {
        panic!(
            "failed to read frontend schema at {}: {err}",
            frontend_path.display()
        )
    });

    let backend_sdl = backend_schema_sdl();
    let normalized_frontend = normalize_schema_sdl(&frontend_sdl);
    let normalized_backend = normalize_schema_sdl(&backend_sdl);

    if normalized_frontend != normalized_backend {
        eprintln!("frontend schema: {}", frontend_path.display());
        eprintln!("--- diff (backend vs frontend) ---");
        for (index, (backend_line, frontend_line)) in normalized_backend
            .lines()
            .zip(normalized_frontend.lines())
            .enumerate()
        {
            if backend_line != frontend_line {
                eprintln!(
                    "line {}: backend={backend_line:?} frontend={frontend_line:?}",
                    index + 1
                );
            }
        }
        if normalized_backend.lines().count() != normalized_frontend.lines().count() {
            eprintln!(
                "line count: backend={} frontend={}",
                normalized_backend.lines().count(),
                normalized_frontend.lines().count()
            );
        }
        eprintln!("--- backend SDL (normalized) ---");
        eprintln!("{normalized_backend}");
        eprintln!("--- frontend schema.gql (normalized) ---");
        eprintln!("{normalized_frontend}");
        panic!("GraphQL schema drift: frontend/schema/schema.gql does not match backend SDL");
    }
}
