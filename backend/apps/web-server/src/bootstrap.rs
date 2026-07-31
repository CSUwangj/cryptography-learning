//! Fail-before-serve application bootstrap.
//!
//! Construction succeeds only when configuration parses, the Practice Catalog
//! initializes, and the static SPA root (including `index.html`) is available.
//! A successfully bootstrapped [`Application`] is the readiness state that
//! `/health/ready` reports.

use std::path::{Path, PathBuf};

use async_graphql::{EmptyMutation, EmptySubscription, Schema};
use thiserror::Error;

use crate::model::Query;
use crate::practice_catalog::{
    LabContentSource, PracticeCatalog, PracticeCatalogError, RawConfiguration,
};

/// GraphQL schema type served by the web application.
pub type AppSchema = Schema<Query, EmptyMutation, EmptySubscription>;

/// Injected build and image identity for structured lifecycle logs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessIdentity {
    pub build_commit: String,
    pub image_id: String,
}

impl ProcessIdentity {
    pub fn unknown() -> Self {
        Self {
            build_commit: "unknown".to_string(),
            image_id: "unknown".to_string(),
        }
    }
}

/// Paths and collaborators required to construct the web application.
#[derive(Debug)]
pub struct BootstrapPaths {
    pub config_path: PathBuf,
    pub static_root: PathBuf,
}

/// Successfully initialized application state ready to serve.
#[derive(Clone)]
pub struct Application {
    practice_catalog: PracticeCatalog,
    schema: AppSchema,
    static_root: PathBuf,
    identity: ProcessIdentity,
}

/// Reasons bootstrap refuses to start serving.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum BootstrapError {
    #[error("failed to read configuration at {path}: {message}")]
    ConfigRead { path: String, message: String },

    #[error("failed to parse configuration at {path}: {message}")]
    ConfigParse { path: String, message: String },

    #[error("unsupported configuration schema version {actual}; expected {expected}")]
    UnsupportedSchemaVersion { expected: u32, actual: u32 },

    #[error("Practice Catalog initialization failed: {0}")]
    Catalog(#[from] PracticeCatalogError),

    #[error("static root is missing or not a directory: {path}")]
    StaticRootMissing { path: String },

    #[error("static SPA index is missing: {path}")]
    IndexHtmlMissing { path: String },
}

impl Application {
    /// Load configuration, initialize modules, and verify static assets.
    ///
    /// Returns [`Err`] before any listener is bound when any prerequisite fails.
    pub fn bootstrap(
        paths: &BootstrapPaths,
        content_source: &dyn LabContentSource,
        identity: ProcessIdentity,
    ) -> Result<Self, BootstrapError> {
        let raw = load_raw_configuration(&paths.config_path)?;
        Self::from_raw(raw, &paths.static_root, content_source, identity)
    }

    /// Construct from already-parsed configuration (test seam helper).
    pub fn from_raw(
        raw: RawConfiguration,
        static_root: &Path,
        content_source: &dyn LabContentSource,
        identity: ProcessIdentity,
    ) -> Result<Self, BootstrapError> {
        raw.validate_schema_version()
            .map_err(
                |(expected, actual)| BootstrapError::UnsupportedSchemaVersion { expected, actual },
            )?;
        validate_static_root(static_root)?;
        let practice_catalog = PracticeCatalog::try_from_raw(raw.practice, content_source)?;
        let schema = Schema::build(Query, EmptyMutation, EmptySubscription)
            .data(practice_catalog.clone())
            .finish();
        Ok(Self {
            practice_catalog,
            schema,
            static_root: static_root.to_path_buf(),
            identity,
        })
    }

    pub fn practice_catalog(&self) -> &PracticeCatalog {
        &self.practice_catalog
    }

    pub fn schema(&self) -> &AppSchema {
        &self.schema
    }

    pub fn static_root(&self) -> &Path {
        &self.static_root
    }

    pub fn identity(&self) -> &ProcessIdentity {
        &self.identity
    }

    /// Readiness reflects successful bootstrap: modules initialized and static assets present.
    pub fn is_ready(&self) -> bool {
        self.static_root.is_dir() && self.static_root.join("index.html").is_file()
    }
}

fn load_raw_configuration(path: &Path) -> Result<RawConfiguration, BootstrapError> {
    let config_string =
        std::fs::read_to_string(path).map_err(|err| BootstrapError::ConfigRead {
            path: path.display().to_string(),
            message: err.to_string(),
        })?;
    let raw: RawConfiguration =
        ron::from_str(&config_string).map_err(|err| BootstrapError::ConfigParse {
            path: path.display().to_string(),
            message: err.to_string(),
        })?;
    raw.validate_schema_version()
        .map_err(
            |(expected, actual)| BootstrapError::UnsupportedSchemaVersion { expected, actual },
        )?;
    Ok(raw)
}

fn validate_static_root(static_root: &Path) -> Result<(), BootstrapError> {
    if !static_root.is_dir() {
        return Err(BootstrapError::StaticRootMissing {
            path: static_root.display().to_string(),
        });
    }
    let index = static_root.join("index.html");
    if !index.is_file() {
        return Err(BootstrapError::IndexHtmlMissing {
            path: index.display().to_string(),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::practice_catalog::{
        InMemoryLabContentSource, RawLab, RawLabCategory, RawPractice, RawResource, RawTranslation,
    };
    use std::collections::HashMap;
    use std::fs;

    fn translation(lang: &str, text: &str) -> RawTranslation {
        RawTranslation {
            lang: lang.to_string(),
            text: text.to_string(),
        }
    }

    fn resource(lang: &str, name: &str, path: &str) -> RawResource {
        RawResource {
            lang: lang.to_string(),
            name: name.to_string(),
            resource: path.to_string(),
        }
    }

    fn valid_raw(content_path: &str) -> RawConfiguration {
        RawConfiguration {
            schema_version: RawConfiguration::SUPPORTED_SCHEMA_VERSION,
            practice: RawPractice {
                lab_categories: vec![RawLabCategory {
                    id: "classical".to_string(),
                    name: vec![translation("en-US", "Classical")],
                    labs: vec![RawLab {
                        id: "affine".to_string(),
                        ws_endpoints: vec![],
                        tcp_endpoints: vec![],
                        resources: vec![resource("en-US", "Affine", content_path)],
                    }],
                }],
            },
        }
    }

    fn write_spa_root(dir: &Path) {
        fs::create_dir_all(dir).unwrap();
        fs::write(
            dir.join("index.html"),
            "<!doctype html><html><body><div id=\"root\"></div></body></html>",
        )
        .unwrap();
        fs::write(dir.join("app.js"), "console.log('ok');").unwrap();
    }

    #[test]
    fn bootstrap_succeeds_with_valid_config_catalog_and_static_root() {
        let tmp = tempfile::tempdir().unwrap();
        let static_root = tmp.path().join("www");
        write_spa_root(&static_root);

        let mut files = HashMap::new();
        files.insert("affine.md".to_string(), "content".to_string());
        let source = InMemoryLabContentSource::new(files);

        let app = Application::from_raw(
            valid_raw("affine.md"),
            &static_root,
            &source,
            ProcessIdentity {
                build_commit: "abc123".into(),
                image_id: "sha256:deadbeef".into(),
            },
        )
        .expect("bootstrap should succeed");

        assert!(app.is_ready());
        assert_eq!(app.identity().build_commit, "abc123");
        assert_eq!(app.practice_catalog().practice().len(), 1);
    }

    #[test]
    fn bootstrap_fails_before_serve_when_configuration_is_invalid() {
        let tmp = tempfile::tempdir().unwrap();
        let static_root = tmp.path().join("www");
        write_spa_root(&static_root);
        let config_path = tmp.path().join("bad.ron");
        fs::write(&config_path, "not-valid-ron").unwrap();

        let err = Application::bootstrap(
            &BootstrapPaths {
                config_path,
                static_root,
            },
            &InMemoryLabContentSource::default(),
            ProcessIdentity::unknown(),
        )
        .err()
        .expect("invalid configuration must fail bootstrap");

        match err {
            BootstrapError::ConfigParse { .. } => {}
            other => panic!("expected ConfigParse, got {other:?}"),
        }
    }

    #[test]
    fn bootstrap_fails_before_serve_when_catalog_initialization_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let static_root = tmp.path().join("www");
        write_spa_root(&static_root);

        let err = Application::from_raw(
            valid_raw("missing.md"),
            &static_root,
            &InMemoryLabContentSource::default(),
            ProcessIdentity::unknown(),
        )
        .err()
        .expect("missing lab content must fail bootstrap");

        assert!(matches!(err, BootstrapError::Catalog(_)));
    }

    #[test]
    fn bootstrap_fails_before_serve_when_static_root_or_index_is_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let missing_root = tmp.path().join("missing-www");
        let mut files = HashMap::new();
        files.insert("affine.md".to_string(), "content".to_string());
        let source = InMemoryLabContentSource::new(files);

        let missing_dir = Application::from_raw(
            valid_raw("affine.md"),
            &missing_root,
            &source,
            ProcessIdentity::unknown(),
        )
        .err()
        .expect("missing static root must fail bootstrap");
        assert!(matches!(
            missing_dir,
            BootstrapError::StaticRootMissing { .. }
        ));

        let empty_root = tmp.path().join("empty-www");
        fs::create_dir_all(&empty_root).unwrap();
        let missing_index = Application::from_raw(
            valid_raw("affine.md"),
            &empty_root,
            &source,
            ProcessIdentity::unknown(),
        )
        .err()
        .expect("missing index.html must fail bootstrap");
        assert!(matches!(
            missing_index,
            BootstrapError::IndexHtmlMissing { .. }
        ));
    }

    #[test]
    fn bootstrap_from_config_file_path() {
        let tmp = tempfile::tempdir().unwrap();
        let static_root = tmp.path().join("www");
        write_spa_root(&static_root);
        let content_dir = tmp.path().join("content");
        fs::create_dir_all(&content_dir).unwrap();
        fs::write(content_dir.join("affine.md"), "from-disk").unwrap();
        let config_path = tmp.path().join("config.ron");
        fs::write(
            &config_path,
            r#"Configuration(
            schema_version: 1,
            practice: (
                lab_categories: [
                    (
                        id: "classical",
                        name: [(language: "en-US", text: "Classical")],
                        labs: [(
                            id: "affine",
                            resources: [(language: "en-US", name: "Affine", resource: "affine.md")],
                            ws_endpoints: [],
                            tcp_endpoints: []
                        )]
                    )
                ]
            )
        )"#,
        )
        .unwrap();

        let source = crate::practice_catalog::FilesystemLabContentSource::new(&content_dir);
        let app = Application::bootstrap(
            &BootstrapPaths {
                config_path,
                static_root,
            },
            &source,
            ProcessIdentity::unknown(),
        )
        .expect("path-based bootstrap");
        assert!(app.is_ready());
    }
}
