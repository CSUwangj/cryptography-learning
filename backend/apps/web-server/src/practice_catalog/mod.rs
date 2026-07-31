//! Practice Catalog: load, validate, and resolve Labs behind one small interface.
//!
//! # Semantic validation (construction)
//!
//! [`PracticeCatalog::try_from_raw`] accepts **parsed raw** Practice configuration
//! (not a prevalidated domain model) plus an injected [`LabContentSource`].
//! Construction succeeds only when all of the following hold:
//!
//! 1. Every lab category `id` is non-empty.
//! 2. Lab category `id`s are unique within the Practice catalog.
//! 3. Every lab category has at least one display name whose `language` and
//!    `text` are both non-empty.
//! 4. Display-name `language`s are unique within a category.
//! 5. Every Lab `id` is non-empty.
//! 6. Lab `id`s are unique within their category.
//! 7. Every Lab has at least one resource.
//! 8. Every resource `language`, `name`, and path is non-empty.
//! 9. Resource `language`s are unique within a Lab.
//! 10. Every resource path loads successfully from the Lab-content source
//!     (missing or unreadable content fails construction).
//!
//! Category, Lab, name, resource, and endpoint **ordering** is preserved exactly
//! as configured.
//!
//! # Resolution
//!
//! - [`PracticeCatalog::practice`] returns the ordered catalog without description
//!   bodies or filesystem paths.
//! - [`PracticeCatalog::resolve_lab`]:
//!   - unknown category or Lab → not-found error;
//!   - if `language` is `Some` and a matching resource exists, use it; otherwise
//!     use the first resource (including when the requested language is absent).
//!
//! After construction, request-time operations perform no file or environment
//! access.

mod content;
mod error;
mod raw;

pub use content::{FilesystemLabContentSource, InMemoryLabContentSource, LabContentSource};
pub use error::{PracticeCatalogError, ResolveError};
pub use raw::{
    RawConfiguration, RawEndpoint, RawLab, RawLabCategory, RawPractice, RawResource, RawTranslation,
};

/// Ordered Practice catalog ready for browsing and Lab resolution.
#[derive(Debug, Clone)]
pub struct PracticeCatalog {
    categories: Vec<StoredCategory>,
}

/// One Lab category as exposed by the catalog (no filesystem paths).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogCategory {
    pub id: String,
    pub name: Vec<CatalogTranslation>,
    pub labs: Vec<CatalogLabSummary>,
}

/// Localized display text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogTranslation {
    pub lang: String,
    pub text: String,
}

/// Lab metadata for the Practice listing (descriptions resolved separately).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogLabSummary {
    pub id: String,
    pub ws_endpoints: Vec<CatalogEndpoint>,
    pub tcp_endpoints: Vec<CatalogEndpoint>,
    pub resources: Vec<CatalogResourceSummary>,
}

/// Challenge connection endpoint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogEndpoint {
    pub host: String,
    pub port: i32,
}

/// Localized Lab title without description body or path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogResourceSummary {
    pub lang: String,
    pub name: String,
}

/// Fully resolved Lab Description plus endpoints.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedLab {
    pub lang: String,
    pub name: String,
    pub content: String,
    pub ws_endpoints: Vec<CatalogEndpoint>,
    pub tcp_endpoints: Vec<CatalogEndpoint>,
}

#[derive(Debug, Clone)]
struct StoredCategory {
    id: String,
    name: Vec<CatalogTranslation>,
    labs: Vec<StoredLab>,
}

#[derive(Debug, Clone)]
struct StoredLab {
    id: String,
    ws_endpoints: Vec<CatalogEndpoint>,
    tcp_endpoints: Vec<CatalogEndpoint>,
    resources: Vec<StoredResource>,
}

#[derive(Debug, Clone)]
struct StoredResource {
    lang: String,
    name: String,
    content: String,
}

impl PracticeCatalog {
    /// Validate raw Practice configuration, load all Lab Descriptions, and build
    /// an immutable catalog handle.
    pub fn try_from_raw(
        raw: RawPractice,
        content_source: &dyn LabContentSource,
    ) -> Result<Self, PracticeCatalogError> {
        use std::collections::HashSet;

        let mut categories = Vec::with_capacity(raw.lab_categories.len());
        let mut seen_category_ids = HashSet::new();

        for (category_index, raw_category) in raw.lab_categories.into_iter().enumerate() {
            if raw_category.id.is_empty() {
                return Err(PracticeCatalogError::EmptyCategoryId);
            }
            if !seen_category_ids.insert(raw_category.id.clone()) {
                return Err(PracticeCatalogError::DuplicateCategoryId(raw_category.id));
            }
            if raw_category.name.is_empty() {
                return Err(PracticeCatalogError::EmptyCategoryNames {
                    category_id: raw_category.id,
                });
            }

            let mut seen_name_langs = HashSet::new();
            let mut names = Vec::with_capacity(raw_category.name.len());
            for name in raw_category.name {
                if name.lang.is_empty() {
                    return Err(PracticeCatalogError::EmptyCategoryNameLanguage {
                        category_id: raw_category.id,
                    });
                }
                if name.text.is_empty() {
                    return Err(PracticeCatalogError::EmptyCategoryNameText {
                        category_id: raw_category.id,
                    });
                }
                if !seen_name_langs.insert(name.lang.clone()) {
                    return Err(PracticeCatalogError::DuplicateCategoryNameLanguage {
                        category_id: raw_category.id,
                        language: name.lang,
                    });
                }
                names.push(CatalogTranslation {
                    lang: name.lang,
                    text: name.text,
                });
            }

            let mut seen_lab_ids = HashSet::new();
            let mut labs = Vec::with_capacity(raw_category.labs.len());
            for (lab_index, raw_lab) in raw_category.labs.into_iter().enumerate() {
                if raw_lab.id.is_empty() {
                    return Err(PracticeCatalogError::EmptyLabId {
                        category_id: raw_category.id,
                    });
                }
                if !seen_lab_ids.insert(raw_lab.id.clone()) {
                    return Err(PracticeCatalogError::DuplicateLabId {
                        category_id: raw_category.id,
                        lab_id: raw_lab.id,
                    });
                }
                if raw_lab.resources.is_empty() {
                    return Err(PracticeCatalogError::EmptyLabResources {
                        category_id: raw_category.id,
                        lab_id: raw_lab.id,
                    });
                }

                validate_endpoints(
                    &raw_lab.ws_endpoints,
                    &format!(
                        "practice.lab_categories[{category_index}].labs[{lab_index}].ws_endpoints"
                    ),
                )?;
                validate_endpoints(
                    &raw_lab.tcp_endpoints,
                    &format!(
                        "practice.lab_categories[{category_index}].labs[{lab_index}].tcp_endpoints"
                    ),
                )?;

                let mut seen_resource_langs = HashSet::new();
                let mut resources = Vec::with_capacity(raw_lab.resources.len());
                for (resource_index, raw_resource) in raw_lab.resources.into_iter().enumerate() {
                    if raw_resource.lang.is_empty() {
                        return Err(PracticeCatalogError::EmptyResourceLanguage {
                            category_id: raw_category.id,
                            lab_id: raw_lab.id,
                        });
                    }
                    if raw_resource.name.is_empty() {
                        return Err(PracticeCatalogError::EmptyResourceName {
                            category_id: raw_category.id,
                            lab_id: raw_lab.id,
                        });
                    }
                    if raw_resource.resource.is_empty() {
                        return Err(PracticeCatalogError::EmptyResourcePath {
                            category_id: raw_category.id,
                            lab_id: raw_lab.id,
                        });
                    }
                    let resource_path = format!(
                        "practice.lab_categories[{category_index}].labs[{lab_index}].resources[{resource_index}].resource"
                    );
                    if !is_safe_resource_path(&raw_resource.resource) {
                        return Err(PracticeCatalogError::InvalidResourcePath {
                            path: resource_path,
                        });
                    }
                    if !seen_resource_langs.insert(raw_resource.lang.clone()) {
                        return Err(PracticeCatalogError::DuplicateResourceLanguage {
                            category_id: raw_category.id,
                            lab_id: raw_lab.id,
                            language: raw_resource.lang,
                        });
                    }
                    let content = content_source.load(&raw_resource.resource)?;
                    resources.push(StoredResource {
                        lang: raw_resource.lang,
                        name: raw_resource.name,
                        content,
                    });
                }

                labs.push(StoredLab {
                    id: raw_lab.id,
                    ws_endpoints: map_endpoints(raw_lab.ws_endpoints),
                    tcp_endpoints: map_endpoints(raw_lab.tcp_endpoints),
                    resources,
                });
            }

            categories.push(StoredCategory {
                id: raw_category.id,
                name: names,
                labs,
            });
        }

        Ok(Self { categories })
    }

    /// Ordered Practice catalog (categories and Labs) without description bodies.
    pub fn practice(&self) -> Vec<CatalogCategory> {
        self.categories
            .iter()
            .map(|category| CatalogCategory {
                id: category.id.clone(),
                name: category.name.clone(),
                labs: category
                    .labs
                    .iter()
                    .map(|lab| CatalogLabSummary {
                        id: lab.id.clone(),
                        ws_endpoints: lab.ws_endpoints.clone(),
                        tcp_endpoints: lab.tcp_endpoints.clone(),
                        resources: lab
                            .resources
                            .iter()
                            .map(|resource| CatalogResourceSummary {
                                lang: resource.lang.clone(),
                                name: resource.name.clone(),
                            })
                            .collect(),
                    })
                    .collect(),
            })
            .collect()
    }

    /// Resolve a Lab Description by category, Lab id, and optional language.
    pub fn resolve_lab(
        &self,
        category_id: &str,
        lab_id: &str,
        language: Option<&str>,
    ) -> Result<ResolvedLab, ResolveError> {
        let category = self
            .categories
            .iter()
            .find(|category| category.id == category_id)
            .ok_or_else(|| ResolveError::CategoryNotFound(category_id.to_string()))?;
        let lab = category
            .labs
            .iter()
            .find(|lab| lab.id == lab_id)
            .ok_or_else(|| ResolveError::LabNotFound {
                category_id: category_id.to_string(),
                lab_id: lab_id.to_string(),
            })?;

        let resource = language
            .and_then(|lang| lab.resources.iter().find(|resource| resource.lang == lang))
            .or_else(|| lab.resources.first())
            .expect("validated Labs always have at least one resource");

        Ok(ResolvedLab {
            lang: resource.lang.clone(),
            name: resource.name.clone(),
            content: resource.content.clone(),
            ws_endpoints: lab.ws_endpoints.clone(),
            tcp_endpoints: lab.tcp_endpoints.clone(),
        })
    }
}

fn map_endpoints(endpoints: Vec<RawEndpoint>) -> Vec<CatalogEndpoint> {
    endpoints
        .into_iter()
        .map(|endpoint| CatalogEndpoint {
            host: endpoint.host,
            port: endpoint.port,
        })
        .collect()
}

fn validate_endpoints(
    endpoints: &[RawEndpoint],
    collection_path: &str,
) -> Result<(), PracticeCatalogError> {
    for (index, endpoint) in endpoints.iter().enumerate() {
        let path = format!("{collection_path}[{index}]");
        if endpoint.host.is_empty() {
            return Err(PracticeCatalogError::EmptyEndpointHost { path });
        }
        if endpoint.host.chars().any(char::is_whitespace)
            || endpoint.host.contains('/')
            || endpoint.host.contains('\\')
            || endpoint.host.starts_with('.')
            || endpoint.host.ends_with('.')
        {
            return Err(PracticeCatalogError::InvalidEndpointHost {
                path,
                host: endpoint.host.clone(),
            });
        }
        if !(1..=65_535).contains(&endpoint.port) {
            return Err(PracticeCatalogError::InvalidEndpointPort {
                path,
                port: endpoint.port,
            });
        }
    }
    Ok(())
}

fn is_safe_resource_path(path: &str) -> bool {
    let path = std::path::Path::new(path);
    !path.is_absolute()
        && path.components().all(|component| {
            matches!(
                component,
                std::path::Component::Normal(_) | std::path::Component::CurDir
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

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

    fn endpoint(host: &str, port: i32) -> RawEndpoint {
        RawEndpoint {
            host: host.to_string(),
            port,
        }
    }

    fn minimal_practice() -> (RawPractice, InMemoryLabContentSource) {
        let mut files = HashMap::new();
        files.insert(
            "practice/classical/affine/zh-CN.md".to_string(),
            "affine-zh".to_string(),
        );
        files.insert(
            "practice/classical/affine/en-US.md".to_string(),
            "affine-en".to_string(),
        );
        let raw = RawPractice {
            lab_categories: vec![RawLabCategory {
                id: "classical".to_string(),
                name: vec![
                    translation("en-US", "Classical"),
                    translation("zh-CN", "古典密码学"),
                ],
                labs: vec![RawLab {
                    id: "affine".to_string(),
                    ws_endpoints: vec![endpoint("127.0.0.1", 19020)],
                    tcp_endpoints: vec![endpoint("127.0.0.1", 19000)],
                    resources: vec![
                        resource("zh-CN", "仿射加密", "practice/classical/affine/zh-CN.md"),
                        resource(
                            "en-US",
                            "Affine Cipher",
                            "practice/classical/affine/en-US.md",
                        ),
                    ],
                }],
            }],
        };
        (raw, InMemoryLabContentSource::new(files))
    }

    #[test]
    fn parses_host_configuration_ron_root_name() {
        let text = r#"Configuration(
            schema_version: 1,
            practice: (
                lab_categories: []
            )
        )"#;
        let raw: RawConfiguration = ron::from_str(text).expect("parse Configuration root");
        assert!(raw.practice.lab_categories.is_empty());
        let catalog =
            PracticeCatalog::try_from_raw(raw.practice, &InMemoryLabContentSource::default())
                .expect("empty Practice is valid");
        assert!(catalog.practice().is_empty());
    }

    #[test]
    fn rejects_unknown_manifest_fields_and_unsupported_versions() {
        let unknown =
            r#"Configuration(schema_version: 1, unexpected: true, practice: (lab_categories: []))"#;
        assert!(ron::from_str::<RawConfiguration>(unknown).is_err());

        let unsupported = RawConfiguration {
            schema_version: 2,
            practice: RawPractice {
                lab_categories: vec![],
            },
        };
        assert_eq!(
            unsupported.validate_schema_version(),
            Err((RawConfiguration::SUPPORTED_SCHEMA_VERSION, 2))
        );
    }

    #[test]
    fn rejects_malformed_endpoints_and_unsafe_resource_paths() {
        let raw = RawPractice {
            lab_categories: vec![RawLabCategory {
                id: "classical".into(),
                name: vec![translation("en-US", "Classical")],
                labs: vec![RawLab {
                    id: "affine".into(),
                    ws_endpoints: vec![endpoint("", 19020)],
                    tcp_endpoints: vec![],
                    resources: vec![resource("en-US", "Affine", "../secret.md")],
                }],
            }],
        };
        let err = PracticeCatalog::try_from_raw(raw, &InMemoryLabContentSource::default())
            .expect_err("malformed endpoint");
        assert!(matches!(
            err,
            PracticeCatalogError::EmptyEndpointHost { .. }
        ));

        let raw = RawPractice {
            lab_categories: vec![RawLabCategory {
                id: "classical".into(),
                name: vec![translation("en-US", "Classical")],
                labs: vec![RawLab {
                    id: "affine".into(),
                    ws_endpoints: vec![],
                    tcp_endpoints: vec![],
                    resources: vec![resource("en-US", "Affine", "../secret.md")],
                }],
            }],
        };
        let err = PracticeCatalog::try_from_raw(raw, &InMemoryLabContentSource::default())
            .expect_err("unsafe resource path");
        assert!(matches!(
            err,
            PracticeCatalogError::InvalidResourcePath { .. }
        ));
    }

    #[test]
    fn constructs_ordered_practice_catalog_from_raw_config() {
        let (raw, source) = minimal_practice();
        let catalog = PracticeCatalog::try_from_raw(raw, &source).expect("valid catalog");
        let practice = catalog.practice();
        assert_eq!(practice.len(), 1);
        assert_eq!(practice[0].id, "classical");
        assert_eq!(
            practice[0].name,
            vec![
                CatalogTranslation {
                    lang: "en-US".into(),
                    text: "Classical".into(),
                },
                CatalogTranslation {
                    lang: "zh-CN".into(),
                    text: "古典密码学".into(),
                },
            ]
        );
        assert_eq!(practice[0].labs.len(), 1);
        let lab = &practice[0].labs[0];
        assert_eq!(lab.id, "affine");
        assert_eq!(
            lab.ws_endpoints,
            vec![CatalogEndpoint {
                host: "127.0.0.1".into(),
                port: 19020,
            }]
        );
        assert_eq!(
            lab.resources,
            vec![
                CatalogResourceSummary {
                    lang: "zh-CN".into(),
                    name: "仿射加密".into(),
                },
                CatalogResourceSummary {
                    lang: "en-US".into(),
                    name: "Affine Cipher".into(),
                },
            ]
        );
    }

    #[test]
    fn preserves_configured_category_and_lab_ordering() {
        let mut files = HashMap::new();
        files.insert("a.md".to_string(), "A".to_string());
        files.insert("b.md".to_string(), "B".to_string());
        files.insert("c.md".to_string(), "C".to_string());
        let raw = RawPractice {
            lab_categories: vec![
                RawLabCategory {
                    id: "classical".to_string(),
                    name: vec![translation("en-US", "Classical")],
                    labs: vec![
                        RawLab {
                            id: "affine".to_string(),
                            ws_endpoints: vec![],
                            tcp_endpoints: vec![],
                            resources: vec![resource("en-US", "Affine", "a.md")],
                        },
                        RawLab {
                            id: "caesar".to_string(),
                            ws_endpoints: vec![],
                            tcp_endpoints: vec![],
                            resources: vec![resource("en-US", "Caesar", "b.md")],
                        },
                    ],
                },
                RawLabCategory {
                    id: "modern".to_string(),
                    name: vec![translation("en-US", "Modern")],
                    labs: vec![RawLab {
                        id: "rsa-factor".to_string(),
                        ws_endpoints: vec![],
                        tcp_endpoints: vec![],
                        resources: vec![resource("en-US", "RSA", "c.md")],
                    }],
                },
            ],
        };
        let catalog =
            PracticeCatalog::try_from_raw(raw, &InMemoryLabContentSource::new(files)).unwrap();
        let practice = catalog.practice();
        assert_eq!(
            practice
                .iter()
                .map(|category| category.id.as_str())
                .collect::<Vec<_>>(),
            vec!["classical", "modern"]
        );
        assert_eq!(
            practice[0]
                .labs
                .iter()
                .map(|lab| lab.id.as_str())
                .collect::<Vec<_>>(),
            vec!["affine", "caesar"]
        );
    }

    #[test]
    fn rejects_duplicate_category_ids() {
        let mut files = HashMap::new();
        files.insert("a.md".to_string(), "A".to_string());
        let raw = RawPractice {
            lab_categories: vec![
                RawLabCategory {
                    id: "classical".to_string(),
                    name: vec![translation("en-US", "Classical")],
                    labs: vec![RawLab {
                        id: "affine".to_string(),
                        ws_endpoints: vec![],
                        tcp_endpoints: vec![],
                        resources: vec![resource("en-US", "Affine", "a.md")],
                    }],
                },
                RawLabCategory {
                    id: "classical".to_string(),
                    name: vec![translation("en-US", "Also Classical")],
                    labs: vec![RawLab {
                        id: "caesar".to_string(),
                        ws_endpoints: vec![],
                        tcp_endpoints: vec![],
                        resources: vec![resource("en-US", "Caesar", "a.md")],
                    }],
                },
            ],
        };
        let err = PracticeCatalog::try_from_raw(raw, &InMemoryLabContentSource::new(files))
            .expect_err("duplicate category");
        assert_eq!(
            err,
            PracticeCatalogError::DuplicateCategoryId("classical".into())
        );
    }

    #[test]
    fn rejects_duplicate_lab_ids_within_category() {
        let mut files = HashMap::new();
        files.insert("a.md".to_string(), "A".to_string());
        let raw = RawPractice {
            lab_categories: vec![RawLabCategory {
                id: "classical".to_string(),
                name: vec![translation("en-US", "Classical")],
                labs: vec![
                    RawLab {
                        id: "affine".to_string(),
                        ws_endpoints: vec![],
                        tcp_endpoints: vec![],
                        resources: vec![resource("en-US", "Affine", "a.md")],
                    },
                    RawLab {
                        id: "affine".to_string(),
                        ws_endpoints: vec![],
                        tcp_endpoints: vec![],
                        resources: vec![resource("en-US", "Also Affine", "a.md")],
                    },
                ],
            }],
        };
        let err = PracticeCatalog::try_from_raw(raw, &InMemoryLabContentSource::new(files))
            .expect_err("duplicate lab");
        assert_eq!(
            err,
            PracticeCatalogError::DuplicateLabId {
                category_id: "classical".into(),
                lab_id: "affine".into(),
            }
        );
    }

    #[test]
    fn rejects_duplicate_resource_languages_within_lab() {
        let mut files = HashMap::new();
        files.insert("a.md".to_string(), "A".to_string());
        let raw = RawPractice {
            lab_categories: vec![RawLabCategory {
                id: "classical".to_string(),
                name: vec![translation("en-US", "Classical")],
                labs: vec![RawLab {
                    id: "affine".to_string(),
                    ws_endpoints: vec![],
                    tcp_endpoints: vec![],
                    resources: vec![
                        resource("en-US", "Affine", "a.md"),
                        resource("en-US", "Affine again", "a.md"),
                    ],
                }],
            }],
        };
        let err = PracticeCatalog::try_from_raw(raw, &InMemoryLabContentSource::new(files))
            .expect_err("duplicate language");
        assert_eq!(
            err,
            PracticeCatalogError::DuplicateResourceLanguage {
                category_id: "classical".into(),
                lab_id: "affine".into(),
                language: "en-US".into(),
            }
        );
    }

    #[test]
    fn rejects_empty_category_id() {
        let raw = RawPractice {
            lab_categories: vec![RawLabCategory {
                id: String::new(),
                name: vec![translation("en-US", "Classical")],
                labs: vec![],
            }],
        };
        let err = PracticeCatalog::try_from_raw(raw, &InMemoryLabContentSource::default())
            .expect_err("empty category id");
        assert_eq!(err, PracticeCatalogError::EmptyCategoryId);
    }

    #[test]
    fn rejects_lab_without_resources() {
        let raw = RawPractice {
            lab_categories: vec![RawLabCategory {
                id: "classical".to_string(),
                name: vec![translation("en-US", "Classical")],
                labs: vec![RawLab {
                    id: "affine".to_string(),
                    ws_endpoints: vec![],
                    tcp_endpoints: vec![],
                    resources: vec![],
                }],
            }],
        };
        let err = PracticeCatalog::try_from_raw(raw, &InMemoryLabContentSource::default())
            .expect_err("empty resources");
        assert_eq!(
            err,
            PracticeCatalogError::EmptyLabResources {
                category_id: "classical".into(),
                lab_id: "affine".into(),
            }
        );
    }

    #[test]
    fn rejects_missing_lab_description_content() {
        let raw = RawPractice {
            lab_categories: vec![RawLabCategory {
                id: "classical".to_string(),
                name: vec![translation("en-US", "Classical")],
                labs: vec![RawLab {
                    id: "affine".to_string(),
                    ws_endpoints: vec![],
                    tcp_endpoints: vec![],
                    resources: vec![resource("en-US", "Affine", "missing.md")],
                }],
            }],
        };
        let err = PracticeCatalog::try_from_raw(raw, &InMemoryLabContentSource::default())
            .expect_err("missing content");
        match err {
            PracticeCatalogError::ContentLoad { path, .. } => assert_eq!(path, "missing.md"),
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn resolve_lab_uses_requested_language_and_falls_back_to_first_resource() {
        let (raw, source) = minimal_practice();
        let catalog = PracticeCatalog::try_from_raw(raw, &source).unwrap();

        let zh = catalog
            .resolve_lab("classical", "affine", Some("zh-CN"))
            .unwrap();
        assert_eq!(zh.lang, "zh-CN");
        assert_eq!(zh.name, "仿射加密");
        assert_eq!(zh.content, "affine-zh");

        let en = catalog
            .resolve_lab("classical", "affine", Some("en-US"))
            .unwrap();
        assert_eq!(en.lang, "en-US");
        assert_eq!(en.content, "affine-en");

        let fallback = catalog.resolve_lab("classical", "affine", None).unwrap();
        assert_eq!(fallback.lang, "zh-CN");
        assert_eq!(fallback.content, "affine-zh");

        let unknown_lang = catalog
            .resolve_lab("classical", "affine", Some("fr-FR"))
            .unwrap();
        assert_eq!(unknown_lang.lang, "zh-CN");
        assert_eq!(unknown_lang.content, "affine-zh");
    }

    #[test]
    fn resolve_lab_reports_missing_category_or_lab() {
        let (raw, source) = minimal_practice();
        let catalog = PracticeCatalog::try_from_raw(raw, &source).unwrap();
        assert_eq!(
            catalog.resolve_lab("missing", "affine", None).unwrap_err(),
            ResolveError::CategoryNotFound("missing".into())
        );
        assert_eq!(
            catalog
                .resolve_lab("classical", "missing", None)
                .unwrap_err(),
            ResolveError::LabNotFound {
                category_id: "classical".into(),
                lab_id: "missing".into(),
            }
        );
    }

    #[test]
    fn filesystem_adapter_loads_descriptions_relative_to_root() {
        let dir = std::env::temp_dir().join(format!("practice-catalog-fs-{}", std::process::id()));
        let nested = dir.join("practice/classical/affine");
        std::fs::create_dir_all(&nested).unwrap();
        let path = nested.join("en-US.md");
        std::fs::write(&path, "from-fs").unwrap();

        let raw = RawPractice {
            lab_categories: vec![RawLabCategory {
                id: "classical".to_string(),
                name: vec![translation("en-US", "Classical")],
                labs: vec![RawLab {
                    id: "affine".to_string(),
                    ws_endpoints: vec![],
                    tcp_endpoints: vec![],
                    resources: vec![resource(
                        "en-US",
                        "Affine",
                        "practice/classical/affine/en-US.md",
                    )],
                }],
            }],
        };
        let source = FilesystemLabContentSource::new(&dir);
        let catalog = PracticeCatalog::try_from_raw(raw, &source).unwrap();
        let lab = catalog
            .resolve_lab("classical", "affine", Some("en-US"))
            .unwrap();
        assert_eq!(lab.content, "from-fs");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
