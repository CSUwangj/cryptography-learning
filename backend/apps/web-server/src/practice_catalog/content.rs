use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::practice_catalog::error::PracticeCatalogError;

/// Loads Lab Description text by configured resource path.
pub trait LabContentSource {
    fn load(&self, path: &str) -> Result<String, PracticeCatalogError>;
}

/// Filesystem-backed Lab Descriptions; paths are resolved relative to `root`.
#[derive(Debug, Clone)]
pub struct FilesystemLabContentSource {
    root: PathBuf,
}

impl FilesystemLabContentSource {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }
}

impl LabContentSource for FilesystemLabContentSource {
    fn load(&self, path: &str) -> Result<String, PracticeCatalogError> {
        let root = self
            .root
            .canonicalize()
            .map_err(|err| PracticeCatalogError::ContentLoad {
                path: path.to_string(),
                message: format!("content root is unavailable: {err}"),
            })?;
        let full = root.join(Path::new(path));
        let resolved = full
            .canonicalize()
            .map_err(|err| PracticeCatalogError::ContentLoad {
                path: path.to_string(),
                message: err.to_string(),
            })?;
        if !resolved.starts_with(&root) {
            return Err(PracticeCatalogError::ContentLoad {
                path: path.to_string(),
                message: "resolved path escapes the content root".to_string(),
            });
        }
        std::fs::read_to_string(resolved).map_err(|err| PracticeCatalogError::ContentLoad {
            path: path.to_string(),
            message: err.to_string(),
        })
    }
}

/// In-memory Lab Descriptions for tests and injected fixtures.
#[derive(Debug, Clone, Default)]
pub struct InMemoryLabContentSource {
    files: HashMap<String, String>,
}

impl InMemoryLabContentSource {
    pub fn new(files: HashMap<String, String>) -> Self {
        Self { files }
    }
}

impl LabContentSource for InMemoryLabContentSource {
    fn load(&self, path: &str) -> Result<String, PracticeCatalogError> {
        self.files
            .get(path)
            .cloned()
            .ok_or_else(|| PracticeCatalogError::ContentLoad {
                path: path.to_string(),
                message: "missing Lab Description".to_string(),
            })
    }
}
