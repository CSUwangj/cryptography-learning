use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::practice_catalog::RawTranslation;

/// Parsed Learning configuration. Lesson documents remain opaque to Rust.
#[derive(Deserialize, Serialize, Debug, Clone, Default)]
#[serde(deny_unknown_fields)]
pub struct RawLearning {
    #[serde(default)]
    pub lesson_categories: Vec<RawLessonCategory>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct RawLessonCategory {
    pub id: String,
    pub name: Vec<RawTranslation>,
    pub lessons: Vec<RawLesson>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct RawLesson {
    pub id: String,
    pub directory: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum LessonCatalogError {
    #[error("Learning category ID is empty")]
    EmptyCategoryId,
    #[error("Learning category ID is duplicated: {0}")]
    DuplicateCategoryId(String),
    #[error("Learning category `{category_id}` has no names")]
    EmptyCategoryNames { category_id: String },
    #[error("Learning category `{category_id}` has invalid name")]
    InvalidCategoryName { category_id: String },
    #[error("Learning category `{category_id}` has duplicate name language `{language}`")]
    DuplicateCategoryNameLanguage {
        category_id: String,
        language: String,
    },
    #[error("Learning Lesson ID is empty in category `{category_id}`")]
    EmptyLessonId { category_id: String },
    #[error("Learning Lesson ID is duplicated: {0}")]
    DuplicateLessonId(String),
    #[error("Learning Lesson `{lesson_id}` has no configured directory")]
    EmptyLessonDirectory { lesson_id: String },
    #[error("Learning Lesson `{lesson_id}` directory is invalid: {message}")]
    Directory { lesson_id: String, message: String },
    #[error("Learning Lesson `{lesson_id}` has no lesson.yaml: {message}")]
    MissingLessonDocument { lesson_id: String, message: String },
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum LessonResolveError {
    #[error("Lesson `{0}` was not found")]
    NotFound(String),
    #[error("Lesson `{lesson_id}` document `{path}` is unavailable: {message}")]
    Unavailable {
        lesson_id: String,
        path: String,
        message: String,
    },
    #[error("Lesson `{lesson_id}` document path `{path}` is invalid")]
    InvalidPath { lesson_id: String, path: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogCategory {
    pub id: String,
    pub name: Vec<CatalogTranslation>,
    pub lessons: Vec<CatalogLesson>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogTranslation {
    pub lang: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogLesson {
    pub id: String,
}

#[derive(Debug, Clone)]
struct StoredLesson {
    id: String,
    directory: PathBuf,
}

#[derive(Debug, Clone)]
struct StoredCategory {
    id: String,
    name: Vec<CatalogTranslation>,
    lessons: Vec<StoredLesson>,
}

/// Immutable configured Lesson directory catalog. Content is read at request time
/// so document changes after startup are isolated to the selected Lesson.
#[derive(Debug, Clone, Default)]
pub struct LessonCatalog {
    categories: Vec<StoredCategory>,
    lessons: HashMap<String, StoredLesson>,
}

impl LessonCatalog {
    pub fn try_from_raw(raw: RawLearning) -> Result<Self, LessonCatalogError> {
        let mut categories = Vec::with_capacity(raw.lesson_categories.len());
        let mut lessons = HashMap::new();
        let mut category_ids = HashSet::new();

        for category in raw.lesson_categories {
            if category.id.is_empty() {
                return Err(LessonCatalogError::EmptyCategoryId);
            }
            if !category_ids.insert(category.id.clone()) {
                return Err(LessonCatalogError::DuplicateCategoryId(category.id));
            }
            if category.name.is_empty() {
                return Err(LessonCatalogError::EmptyCategoryNames {
                    category_id: category.id,
                });
            }
            let mut languages = HashSet::new();
            let mut names = Vec::with_capacity(category.name.len());
            for name in category.name {
                if name.lang.is_empty() || name.text.is_empty() {
                    return Err(LessonCatalogError::InvalidCategoryName {
                        category_id: category.id,
                    });
                }
                if !languages.insert(name.lang.clone()) {
                    return Err(LessonCatalogError::DuplicateCategoryNameLanguage {
                        category_id: category.id,
                        language: name.lang,
                    });
                }
                names.push(CatalogTranslation {
                    lang: name.lang,
                    text: name.text,
                });
            }

            let mut category_lessons = Vec::with_capacity(category.lessons.len());
            for lesson in category.lessons {
                if lesson.id.is_empty() {
                    return Err(LessonCatalogError::EmptyLessonId {
                        category_id: category.id,
                    });
                }
                if lessons.contains_key(&lesson.id) {
                    return Err(LessonCatalogError::DuplicateLessonId(lesson.id));
                }
                if lesson.directory.is_empty() {
                    return Err(LessonCatalogError::EmptyLessonDirectory {
                        lesson_id: lesson.id,
                    });
                }
                let directory = Path::new(&lesson.directory).canonicalize().map_err(|err| {
                    LessonCatalogError::Directory {
                        lesson_id: lesson.id.clone(),
                        message: err.to_string(),
                    }
                })?;
                if !directory.is_dir() {
                    return Err(LessonCatalogError::Directory {
                        lesson_id: lesson.id,
                        message: "not a directory".to_string(),
                    });
                }
                let lesson_document =
                    directory
                        .join("lesson.yaml")
                        .canonicalize()
                        .map_err(|err| LessonCatalogError::MissingLessonDocument {
                            lesson_id: lesson.id.clone(),
                            message: err.to_string(),
                        })?;
                if !lesson_document.starts_with(&directory) || !lesson_document.is_file() {
                    return Err(LessonCatalogError::MissingLessonDocument {
                        lesson_id: lesson.id,
                        message: "path escapes configured Lesson directory".to_string(),
                    });
                }
                let stored = StoredLesson {
                    id: lesson.id.clone(),
                    directory,
                };
                lessons.insert(lesson.id, stored.clone());
                category_lessons.push(stored);
            }
            categories.push(StoredCategory {
                id: category.id,
                name: names,
                lessons: category_lessons,
            });
        }
        Ok(Self {
            categories,
            lessons,
        })
    }

    pub fn learning(&self) -> Vec<CatalogCategory> {
        self.categories
            .iter()
            .map(|category| CatalogCategory {
                id: category.id.clone(),
                name: category.name.clone(),
                lessons: category
                    .lessons
                    .iter()
                    .map(|lesson| CatalogLesson {
                        id: lesson.id.clone(),
                    })
                    .collect(),
            })
            .collect()
    }

    pub fn documents(
        &self,
        lesson_id: &str,
        language: &str,
    ) -> Result<(String, Option<String>), LessonResolveError> {
        let lesson = self.lesson(lesson_id)?;
        let lesson_document = self.read_text(lesson, Path::new("lesson.yaml"), false)?;
        let locale_path = PathBuf::from("locales").join(format!("{language}.yaml"));
        let locale_document = self.read_text(lesson, &locale_path, true)?;
        Ok((
            lesson_document.expect("lesson.yaml validated at startup"),
            locale_document,
        ))
    }

    pub fn asset(&self, lesson_id: &str, path: &str) -> Result<Vec<u8>, LessonResolveError> {
        let lesson = self.lesson(lesson_id)?;
        let relative = PathBuf::from("assets").join(path);
        if !safe_relative(Path::new(path)) {
            return Err(LessonResolveError::InvalidPath {
                lesson_id: lesson_id.to_string(),
                path: path.to_string(),
            });
        }
        let assets = lesson
            .directory
            .join("assets")
            .canonicalize()
            .map_err(|err| LessonResolveError::Unavailable {
                lesson_id: lesson_id.to_string(),
                path: "assets".to_string(),
                message: err.to_string(),
            })?;
        let resolved = lesson
            .directory
            .join(&relative)
            .canonicalize()
            .map_err(|err| LessonResolveError::Unavailable {
                lesson_id: lesson_id.to_string(),
                path: relative.display().to_string(),
                message: err.to_string(),
            })?;
        if !assets.is_dir()
            || !assets.starts_with(&lesson.directory)
            || !resolved.starts_with(&assets)
            || !resolved.is_file()
        {
            return Err(LessonResolveError::InvalidPath {
                lesson_id: lesson_id.to_string(),
                path: path.to_string(),
            });
        }
        std::fs::read(resolved).map_err(|err| LessonResolveError::Unavailable {
            lesson_id: lesson_id.to_string(),
            path: path.to_string(),
            message: err.to_string(),
        })
    }

    fn lesson(&self, id: &str) -> Result<&StoredLesson, LessonResolveError> {
        self.lessons
            .get(id)
            .ok_or_else(|| LessonResolveError::NotFound(id.to_string()))
    }

    fn read_text(
        &self,
        lesson: &StoredLesson,
        path: &Path,
        absent_is_none: bool,
    ) -> Result<Option<String>, LessonResolveError> {
        if !safe_relative(path) {
            return Err(LessonResolveError::InvalidPath {
                lesson_id: lesson.id.clone(),
                path: path.display().to_string(),
            });
        }
        let candidate = lesson.directory.join(path);
        let resolved = match candidate.canonicalize() {
            Ok(path) => path,
            Err(err) if absent_is_none && err.kind() == std::io::ErrorKind::NotFound => {
                return Ok(None);
            }
            Err(err) => {
                return Err(LessonResolveError::Unavailable {
                    lesson_id: lesson.id.clone(),
                    path: path.display().to_string(),
                    message: err.to_string(),
                });
            }
        };
        if !resolved.starts_with(&lesson.directory) || !resolved.is_file() {
            return Err(LessonResolveError::InvalidPath {
                lesson_id: lesson.id.clone(),
                path: path.display().to_string(),
            });
        }
        std::fs::read_to_string(resolved)
            .map(Some)
            .map_err(|err| LessonResolveError::Unavailable {
                lesson_id: lesson.id.clone(),
                path: path.display().to_string(),
                message: err.to_string(),
            })
    }
}

fn safe_relative(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn learning(directory: &Path) -> RawLearning {
        RawLearning {
            lesson_categories: vec![RawLessonCategory {
                id: "fundamentals".into(),
                name: vec![RawTranslation {
                    lang: "en-US".into(),
                    text: "Fundamentals".into(),
                }],
                lessons: vec![RawLesson {
                    id: "xor-intro".into(),
                    directory: directory.display().to_string(),
                }],
            }],
        }
    }

    #[test]
    fn serves_opaque_documents_and_preserves_catalog_order() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(root.path().join("locales")).unwrap();
        std::fs::write(root.path().join("lesson.yaml"), "invalid: [ Lesson YAML").unwrap();
        std::fs::write(root.path().join("locales/en-US.yaml"), "title: XOR").unwrap();
        let catalog = LessonCatalog::try_from_raw(learning(root.path())).unwrap();

        assert_eq!(catalog.learning()[0].lessons[0].id, "xor-intro");
        assert_eq!(
            catalog.documents("xor-intro", "en-US").unwrap(),
            ("invalid: [ Lesson YAML".into(), Some("title: XOR".into()))
        );
        assert_eq!(catalog.documents("xor-intro", "zh-CN").unwrap().1, None);
    }

    #[test]
    fn rejects_duplicate_ids_missing_documents_and_asset_escapes() {
        let root = tempfile::tempdir().unwrap();
        let error = LessonCatalog::try_from_raw(learning(root.path())).unwrap_err();
        assert!(matches!(
            error,
            LessonCatalogError::MissingLessonDocument { .. }
        ));

        std::fs::write(root.path().join("lesson.yaml"), "version: 1").unwrap();
        let mut raw = learning(root.path());
        raw.lesson_categories.push(raw.lesson_categories[0].clone());
        let error = LessonCatalog::try_from_raw(raw).unwrap_err();
        assert!(matches!(error, LessonCatalogError::DuplicateCategoryId(_)));

        let catalog = LessonCatalog::try_from_raw(learning(root.path())).unwrap();
        assert!(matches!(
            catalog.asset("xor-intro", "../secret"),
            Err(LessonResolveError::InvalidPath { .. })
        ));
        std::fs::create_dir(root.path().join("assets")).unwrap();
        let secret = root.path().parent().unwrap().join("lesson-catalog-secret");
        std::fs::write(&secret, "secret").unwrap();
        std::os::unix::fs::symlink(&secret, root.path().join("assets/escape")).unwrap();
        assert!(matches!(
            catalog.asset("xor-intro", "escape"),
            Err(LessonResolveError::InvalidPath { .. })
        ));
        let _ = std::fs::remove_file(secret);

        let symlinked_root = tempfile::tempdir().unwrap();
        let external_assets = tempfile::tempdir().unwrap();
        std::fs::write(symlinked_root.path().join("lesson.yaml"), "version: 1").unwrap();
        std::fs::write(external_assets.path().join("image.txt"), "external").unwrap();
        std::os::unix::fs::symlink(external_assets.path(), symlinked_root.path().join("assets"))
            .unwrap();
        let catalog = LessonCatalog::try_from_raw(learning(symlinked_root.path())).unwrap();
        assert!(matches!(
            catalog.asset("xor-intro", "image.txt"),
            Err(LessonResolveError::InvalidPath { .. })
        ));
    }
}
