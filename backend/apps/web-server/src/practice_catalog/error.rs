use thiserror::Error;

/// Errors raised while validating raw Practice configuration or loading content.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum PracticeCatalogError {
    #[error("lab category id must be non-empty")]
    EmptyCategoryId,

    #[error("duplicate lab category id `{0}`")]
    DuplicateCategoryId(String),

    #[error("lab category `{category_id}` must have at least one display name")]
    EmptyCategoryNames { category_id: String },

    #[error("lab category `{category_id}` has an empty display-name language")]
    EmptyCategoryNameLanguage { category_id: String },

    #[error("lab category `{category_id}` has an empty display-name text")]
    EmptyCategoryNameText { category_id: String },

    #[error("lab category `{category_id}` has duplicate display-name language `{language}`")]
    DuplicateCategoryNameLanguage {
        category_id: String,
        language: String,
    },

    #[error("lab id must be non-empty (category `{category_id}`)")]
    EmptyLabId { category_id: String },

    #[error("duplicate lab id `{lab_id}` in category `{category_id}`")]
    DuplicateLabId { category_id: String, lab_id: String },

    #[error("lab `{category_id}/{lab_id}` must have at least one resource")]
    EmptyLabResources { category_id: String, lab_id: String },

    #[error("lab `{category_id}/{lab_id}` has an empty resource language")]
    EmptyResourceLanguage { category_id: String, lab_id: String },

    #[error("lab `{category_id}/{lab_id}` has an empty resource name")]
    EmptyResourceName { category_id: String, lab_id: String },

    #[error("lab `{category_id}/{lab_id}` has an empty resource path")]
    EmptyResourcePath { category_id: String, lab_id: String },

    #[error("lab `{category_id}/{lab_id}` has duplicate resource language `{language}`")]
    DuplicateResourceLanguage {
        category_id: String,
        lab_id: String,
        language: String,
    },

    #[error("failed to load Lab Description at `{path}`: {message}")]
    ContentLoad { path: String, message: String },
}

/// Errors raised when resolving a Lab from a constructed catalog.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum ResolveError {
    #[error("category `{0}` not found")]
    CategoryNotFound(String),

    #[error("lab `{lab_id}` not found in category `{category_id}`")]
    LabNotFound { category_id: String, lab_id: String },
}
