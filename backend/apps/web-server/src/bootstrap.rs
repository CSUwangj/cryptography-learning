//! Fail-before-serve application bootstrap.
//!
//! Construction succeeds only when configuration parses, the Practice Catalog
//! initializes, and the static SPA root (including `index.html`) is available.
//! When Completion options are supplied, policy validation, global Lab
//! uniqueness, database open, and migrations must also succeed before serve.
//! A successfully bootstrapped [`Application`] is the readiness state that
//! `/health/ready` reports.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::Arc;

use async_graphql::{EmptyMutation, EmptySubscription, Schema};
use completion_claims::LabId;
use thiserror::Error;

use crate::completion::{
    ClaimStore, ClaimStoreError, Clock, CompletionConfigError, CompletionPolicy, CompletionService,
    SystemClock,
};
use crate::model::Query;
use crate::opts::CompletionModulePaths;
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
    pub completion: Option<CompletionModulePaths>,
}

/// Successfully initialized application state ready to serve.
#[derive(Clone)]
pub struct Application {
    practice_catalog: PracticeCatalog,
    schema: AppSchema,
    static_root: PathBuf,
    identity: ProcessIdentity,
    completion: Option<CompletionService>,
}

/// Reasons bootstrap refuses to start serving.
#[derive(Debug, Error)]
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

    #[error("Completion configuration error: {0}")]
    CompletionConfig(#[from] CompletionConfigError),

    #[error("Completion requires globally unique Lab IDs; duplicate `{0}`")]
    DuplicateGlobalLabId(String),

    #[error("Completion Lab ID `{0}` is not a valid protocol LabId")]
    InvalidLabId(String),

    #[error("Completion database error: {0}")]
    CompletionStore(#[from] ClaimStoreError),
}

impl Application {
    /// Load configuration, initialize modules, and verify static assets.
    ///
    /// Returns [`Err`] before any listener is bound when any prerequisite fails.
    pub async fn bootstrap(
        paths: &BootstrapPaths,
        content_source: &dyn LabContentSource,
        identity: ProcessIdentity,
    ) -> Result<Self, BootstrapError> {
        let raw = load_raw_configuration(&paths.config_path)?;
        Self::from_raw(
            raw,
            &paths.static_root,
            content_source,
            identity,
            paths.completion.as_ref(),
            Arc::new(SystemClock) as Arc<dyn Clock>,
        )
        .await
    }

    /// Construct from already-parsed configuration (test seam helper).
    pub async fn from_raw(
        raw: RawConfiguration,
        static_root: &Path,
        content_source: &dyn LabContentSource,
        identity: ProcessIdentity,
        completion_paths: Option<&CompletionModulePaths>,
        clock: Arc<dyn Clock>,
    ) -> Result<Self, BootstrapError> {
        raw.validate_schema_version()
            .map_err(
                |(expected, actual)| BootstrapError::UnsupportedSchemaVersion { expected, actual },
            )?;
        validate_static_root(static_root)?;
        let practice_catalog = PracticeCatalog::try_from_raw(raw.practice, content_source)?;

        let completion = if let Some(paths) = completion_paths {
            Some(build_completion_service(&practice_catalog, paths, clock).await?)
        } else {
            None
        };

        let mut schema_builder =
            Schema::build(Query, EmptyMutation, EmptySubscription).data(practice_catalog.clone());
        if let Some(service) = completion.clone() {
            schema_builder = schema_builder.data(service);
        }
        let schema = schema_builder.finish();

        Ok(Self {
            practice_catalog,
            schema,
            static_root: static_root.to_path_buf(),
            identity,
            completion,
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

    pub fn completion(&self) -> Option<&CompletionService> {
        self.completion.as_ref()
    }

    /// Readiness reflects successful bootstrap: modules initialized and static assets present.
    pub fn is_ready(&self) -> bool {
        self.static_root.is_dir() && self.static_root.join("index.html").is_file()
    }
}

async fn build_completion_service(
    practice_catalog: &PracticeCatalog,
    paths: &CompletionModulePaths,
    clock: Arc<dyn Clock>,
) -> Result<CompletionService, BootstrapError> {
    let policy = CompletionPolicy::load_from_path(&paths.config)?;
    let lab_strings = practice_catalog
        .globally_unique_lab_ids()
        .map_err(BootstrapError::DuplicateGlobalLabId)?;
    let mut known_labs = HashSet::new();
    for lab in lab_strings {
        let lab_id =
            LabId::from_str(&lab).map_err(|_| BootstrapError::InvalidLabId(lab.clone()))?;
        known_labs.insert(lab_id);
    }
    let store = ClaimStore::open(&paths.database).await?;
    Ok(CompletionService::new(policy, known_labs, store, clock))
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
    use std::sync::Arc;

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

    #[tokio::test]
    async fn bootstrap_succeeds_with_valid_config_catalog_and_static_root() {
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
            None,
            Arc::new(SystemClock),
        )
        .await
        .expect("bootstrap should succeed");

        assert!(app.is_ready());
        assert_eq!(app.identity().build_commit, "abc123");
        assert_eq!(app.practice_catalog().practice().len(), 1);
        assert!(app.completion().is_none());
    }

    #[tokio::test]
    async fn bootstrap_fails_before_serve_when_configuration_is_invalid() {
        let tmp = tempfile::tempdir().unwrap();
        let static_root = tmp.path().join("www");
        write_spa_root(&static_root);
        let config_path = tmp.path().join("bad.ron");
        fs::write(&config_path, "not-valid-ron").unwrap();

        let err = Application::bootstrap(
            &BootstrapPaths {
                config_path,
                static_root,
                completion: None,
            },
            &InMemoryLabContentSource::default(),
            ProcessIdentity::unknown(),
        )
        .await
        .err()
        .expect("invalid configuration must fail bootstrap");

        match err {
            BootstrapError::ConfigParse { .. } => {}
            other => panic!("expected ConfigParse, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn bootstrap_fails_before_serve_when_catalog_initialization_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let static_root = tmp.path().join("www");
        write_spa_root(&static_root);

        let err = Application::from_raw(
            valid_raw("missing.md"),
            &static_root,
            &InMemoryLabContentSource::default(),
            ProcessIdentity::unknown(),
            None,
            Arc::new(SystemClock),
        )
        .await
        .err()
        .expect("missing lab content must fail bootstrap");

        assert!(matches!(err, BootstrapError::Catalog(_)));
    }

    #[tokio::test]
    async fn bootstrap_fails_before_serve_when_static_root_or_index_is_missing() {
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
            None,
            Arc::new(SystemClock),
        )
        .await
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
            None,
            Arc::new(SystemClock),
        )
        .await
        .err()
        .expect("missing index.html must fail bootstrap");
        assert!(matches!(
            missing_index,
            BootstrapError::IndexHtmlMissing { .. }
        ));
    }

    #[tokio::test]
    async fn bootstrap_from_config_file_path() {
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
                completion: None,
            },
            &source,
            ProcessIdentity::unknown(),
        )
        .await
        .expect("path-based bootstrap");
        assert!(app.is_ready());
    }

    #[tokio::test]
    async fn completion_enabled_bootstrap_rejects_duplicate_global_lab_ids() {
        let tmp = tempfile::tempdir().unwrap();
        let static_root = tmp.path().join("www");
        write_spa_root(&static_root);
        let mut files = HashMap::new();
        files.insert("a.md".to_string(), "a".to_string());
        files.insert("b.md".to_string(), "b".to_string());
        let source = InMemoryLabContentSource::new(files);

        let raw = RawConfiguration {
            schema_version: RawConfiguration::SUPPORTED_SCHEMA_VERSION,
            practice: RawPractice {
                lab_categories: vec![
                    RawLabCategory {
                        id: "classical".into(),
                        name: vec![translation("en-US", "Classical")],
                        labs: vec![RawLab {
                            id: "affine".into(),
                            ws_endpoints: vec![],
                            tcp_endpoints: vec![],
                            resources: vec![resource("en-US", "A", "a.md")],
                        }],
                    },
                    RawLabCategory {
                        id: "modern".into(),
                        name: vec![translation("en-US", "Modern")],
                        labs: vec![RawLab {
                            id: "affine".into(),
                            ws_endpoints: vec![],
                            tcp_endpoints: vec![],
                            resources: vec![resource("en-US", "B", "b.md")],
                        }],
                    },
                ],
            },
        };

        let pubkey = "D75A980182B10AB7D54BFED3C964073A0EE172F3DAA62325AF021A68F707511A";
        let completion_config = tmp.path().join("completion.ron");
        fs::write(
            &completion_config,
            format!(
                r#"CompletionConfiguration(
                  course_run: "2026-autumn",
                  trusted_keys: [(kid: "lab-host-a-2026-01", public_key_hex: "{pubkey}")],
                )"#
            ),
        )
        .unwrap();
        let completion_db = tmp.path().join("claims.sqlite");

        let err = Application::from_raw(
            raw,
            &static_root,
            &source,
            ProcessIdentity::unknown(),
            Some(&CompletionModulePaths {
                config: completion_config,
                database: completion_db,
            }),
            Arc::new(SystemClock),
        )
        .await
        .err()
        .expect("duplicate global lab ids must fail");
        assert!(matches!(err, BootstrapError::DuplicateGlobalLabId(_)));
    }

    #[tokio::test]
    async fn completion_enabled_bootstrap_succeeds_with_valid_policy_and_db() {
        let tmp = tempfile::tempdir().unwrap();
        let static_root = tmp.path().join("www");
        write_spa_root(&static_root);
        let mut files = HashMap::new();
        files.insert("affine.md".to_string(), "content".to_string());
        let source = InMemoryLabContentSource::new(files);
        let pubkey = "D75A980182B10AB7D54BFED3C964073A0EE172F3DAA62325AF021A68F707511A";
        let completion_config = tmp.path().join("completion.ron");
        fs::write(
            &completion_config,
            format!(
                r#"CompletionConfiguration(
                  course_run: "2026-autumn",
                  trusted_keys: [(kid: "lab-host-a-2026-01", public_key_hex: "{pubkey}")],
                )"#
            ),
        )
        .unwrap();
        let completion_db = tmp.path().join("claims.sqlite");

        let app = Application::from_raw(
            valid_raw("affine.md"),
            &static_root,
            &source,
            ProcessIdentity::unknown(),
            Some(&CompletionModulePaths {
                config: completion_config,
                database: completion_db,
            }),
            Arc::new(SystemClock),
        )
        .await
        .expect("completion bootstrap");
        assert!(app.completion().is_some());
        assert_eq!(
            app.completion().unwrap().configured_course_run().as_str(),
            "2026-autumn"
        );
    }

    #[tokio::test]
    async fn completion_enabled_bootstrap_fails_on_invalid_policy() {
        let tmp = tempfile::tempdir().unwrap();
        let static_root = tmp.path().join("www");
        write_spa_root(&static_root);
        let mut files = HashMap::new();
        files.insert("affine.md".to_string(), "content".to_string());
        let source = InMemoryLabContentSource::new(files);
        let completion_config = tmp.path().join("completion.ron");
        fs::write(&completion_config, "not-valid").unwrap();
        let completion_db = tmp.path().join("claims.sqlite");

        let err = Application::from_raw(
            valid_raw("affine.md"),
            &static_root,
            &source,
            ProcessIdentity::unknown(),
            Some(&CompletionModulePaths {
                config: completion_config,
                database: completion_db,
            }),
            Arc::new(SystemClock),
        )
        .await
        .err()
        .expect("invalid policy must fail");
        assert!(matches!(err, BootstrapError::CompletionConfig(_)));
    }
}
