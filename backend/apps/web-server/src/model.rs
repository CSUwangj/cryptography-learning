use crate::errors::QueryError;
use crate::lesson_catalog::{
    CatalogCategory as LearningCatalogCategory, CatalogLesson,
    CatalogTranslation as LearningTranslation, LessonCatalog, LessonResolveError,
};
use crate::practice_catalog::{
    CatalogCategory, CatalogEndpoint, CatalogLabSummary, CatalogResourceSummary,
    CatalogTranslation, PracticeCatalog, ResolveError, ResolvedLab,
};
use async_graphql::{Context, ErrorExtensions, FieldResult, Object, SimpleObject};

pub struct Query;

#[Object]
impl Query {
    async fn hello(&self) -> String {
        "hello cryptography".to_string()
    }

    async fn practice(&self, ctx: &Context<'_>) -> FieldResult<Practice> {
        let catalog = ctx.data::<PracticeCatalog>()?;
        Ok(Practice::from_catalog(catalog))
    }

    async fn learning(&self, ctx: &Context<'_>) -> FieldResult<Learning> {
        let catalog = ctx.data::<LessonCatalog>()?;
        Ok(Learning::from_catalog(catalog))
    }

    async fn lesson_documents(
        &self,
        ctx: &Context<'_>,
        lesson_id: String,
        language: String,
    ) -> FieldResult<LessonDocuments> {
        let catalog = ctx.data::<LessonCatalog>()?;
        let (lesson, locale) = catalog
            .documents(&lesson_id, &language)
            .map_err(lesson_error_to_field)?;
        Ok(LessonDocuments { lesson, locale })
    }

    async fn lab(
        &self,
        ctx: &Context<'_>,
        category_id: String,
        lab_id: String,
        language: Option<String>,
    ) -> FieldResult<LabInstance> {
        let catalog = ctx.data::<PracticeCatalog>()?;
        let resolved = catalog
            .resolve_lab(&category_id, &lab_id, language.as_deref())
            .map_err(resolve_error_to_field)?;
        Ok(LabInstance::from(resolved))
    }

    async fn completion_board(
        &self,
        ctx: &Context<'_>,
        course_run_id: Option<String>,
    ) -> FieldResult<CompletionBoard> {
        let Some(service) = ctx.data_opt::<crate::completion::CompletionService>() else {
            return Err(QueryError::CompletionNotConfigured.extend());
        };
        match service.board(course_run_id.as_deref()).await {
            Ok((course_run, students)) => Ok(CompletionBoard {
                course_run_id: course_run.to_string(),
                students: students
                    .into_iter()
                    .map(|row| StudentCompletion {
                        student_id: row.student_id,
                        completions: row
                            .completions
                            .into_iter()
                            .map(|completion| CompletionRecord {
                                lab_id: completion.lab_id,
                                completed_at: completion.completed_at,
                            })
                            .collect(),
                    })
                    .collect(),
            }),
            Err(crate::completion::BoardError::InvalidCourseRunId) => {
                Err(QueryError::InvalidCourseRunId.extend())
            }
            Err(crate::completion::BoardError::Unavailable) => {
                Err(QueryError::CompletionUnavailable.extend())
            }
        }
    }
}

fn resolve_error_to_field(err: ResolveError) -> async_graphql::Error {
    match err {
        ResolveError::CategoryNotFound(_) => {
            QueryError::NotFoundError("category".to_string()).extend()
        }
        ResolveError::LabNotFound { .. } => QueryError::NotFoundError("lab".to_string()).extend(),
    }
}

fn lesson_error_to_field(err: LessonResolveError) -> async_graphql::Error {
    match err {
        LessonResolveError::NotFound(_) => QueryError::NotFoundError("lesson".to_string()).extend(),
        LessonResolveError::Unavailable { .. } | LessonResolveError::InvalidPath { .. } => {
            async_graphql::Error::new("Lesson document is unavailable.")
        }
    }
}

#[derive(SimpleObject, Debug, Clone)]
struct Learning {
    lesson_categories: Vec<LearningCategory>,
}

impl Learning {
    fn from_catalog(catalog: &LessonCatalog) -> Self {
        Self {
            lesson_categories: catalog
                .learning()
                .into_iter()
                .map(LearningCategory::from)
                .collect(),
        }
    }
}

#[derive(SimpleObject, Debug, Clone)]
struct LearningCategory {
    id: String,
    name: Vec<Translation>,
    lessons: Vec<Lesson>,
}

impl From<LearningCatalogCategory> for LearningCategory {
    fn from(category: LearningCatalogCategory) -> Self {
        Self {
            id: category.id,
            name: category.name.into_iter().map(Translation::from).collect(),
            lessons: category.lessons.into_iter().map(Lesson::from).collect(),
        }
    }
}

#[derive(SimpleObject, Debug, Clone)]
struct Lesson {
    id: String,
}

impl From<CatalogLesson> for Lesson {
    fn from(lesson: CatalogLesson) -> Self {
        Self { id: lesson.id }
    }
}

#[derive(SimpleObject, Debug, Clone)]
struct LessonDocuments {
    lesson: String,
    locale: Option<String>,
}

#[derive(SimpleObject, Debug, Clone)]
pub struct Practice {
    lab_categories: Vec<LabCategory>,
}

impl Practice {
    fn from_catalog(catalog: &PracticeCatalog) -> Self {
        Self {
            lab_categories: catalog
                .practice()
                .into_iter()
                .map(LabCategory::from)
                .collect(),
        }
    }
}

#[derive(SimpleObject, Debug, Clone)]
struct LabCategory {
    id: String,
    name: Vec<Translation>,
    labs: Vec<Lab>,
}

impl From<CatalogCategory> for LabCategory {
    fn from(category: CatalogCategory) -> Self {
        Self {
            id: category.id,
            name: category.name.into_iter().map(Translation::from).collect(),
            labs: category.labs.into_iter().map(Lab::from).collect(),
        }
    }
}

#[derive(SimpleObject, Debug, Clone)]
struct Lab {
    id: String,
    ws_endpoints: Vec<Endpoint>,
    tcp_endpoints: Vec<Endpoint>,
    resources: Vec<ResourceWithTranslation>,
}

impl From<CatalogLabSummary> for Lab {
    fn from(lab: CatalogLabSummary) -> Self {
        Self {
            id: lab.id,
            ws_endpoints: lab.ws_endpoints.into_iter().map(Endpoint::from).collect(),
            tcp_endpoints: lab.tcp_endpoints.into_iter().map(Endpoint::from).collect(),
            resources: lab
                .resources
                .into_iter()
                .map(ResourceWithTranslation::from)
                .collect(),
        }
    }
}

#[derive(SimpleObject, Debug, Clone)]
struct LabInstance {
    lang: String,
    name: String,
    content: String,
    ws_endpoints: Vec<Endpoint>,
    tcp_endpoints: Vec<Endpoint>,
}

impl From<ResolvedLab> for LabInstance {
    fn from(lab: ResolvedLab) -> Self {
        Self {
            lang: lab.lang,
            name: lab.name,
            content: lab.content,
            ws_endpoints: lab.ws_endpoints.into_iter().map(Endpoint::from).collect(),
            tcp_endpoints: lab.tcp_endpoints.into_iter().map(Endpoint::from).collect(),
        }
    }
}

#[derive(SimpleObject, Debug, Clone)]
struct Endpoint {
    host: String,
    port: i32,
}

impl From<CatalogEndpoint> for Endpoint {
    fn from(endpoint: CatalogEndpoint) -> Self {
        Self {
            host: endpoint.host,
            port: endpoint.port,
        }
    }
}

#[derive(SimpleObject, Debug, Clone)]
struct Translation {
    lang: String,
    text: String,
}

impl From<CatalogTranslation> for Translation {
    fn from(translation: CatalogTranslation) -> Self {
        Self {
            lang: translation.lang,
            text: translation.text,
        }
    }
}

impl From<LearningTranslation> for Translation {
    fn from(translation: LearningTranslation) -> Self {
        Self {
            lang: translation.lang,
            text: translation.text,
        }
    }
}

#[derive(SimpleObject, Debug, Clone)]
struct ResourceWithTranslation {
    lang: String,
    name: String,
}

impl From<CatalogResourceSummary> for ResourceWithTranslation {
    fn from(resource: CatalogResourceSummary) -> Self {
        Self {
            lang: resource.lang,
            name: resource.name,
        }
    }
}

#[derive(SimpleObject, Debug, Clone)]
pub struct CompletionBoard {
    course_run_id: String,
    students: Vec<StudentCompletion>,
}

#[derive(SimpleObject, Debug, Clone)]
pub struct StudentCompletion {
    student_id: String,
    completions: Vec<CompletionRecord>,
}

#[derive(SimpleObject, Debug, Clone)]
pub struct CompletionRecord {
    lab_id: String,
    completed_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lesson_catalog::{RawLearning, RawLesson, RawLessonCategory};
    use async_graphql::{EmptyMutation, EmptySubscription, Schema};

    #[tokio::test]
    async fn exposes_ordered_catalog_and_nullable_missing_locale() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(directory.path().join("locales")).unwrap();
        std::fs::write(directory.path().join("lesson.yaml"), "version: 1").unwrap();
        std::fs::write(directory.path().join("locales/en-US.yaml"), "title: XOR").unwrap();
        let catalog = LessonCatalog::try_from_raw(RawLearning {
            lesson_categories: vec![RawLessonCategory {
                id: "fundamentals".into(),
                name: vec![crate::practice_catalog::RawTranslation {
                    lang: "en-US".into(),
                    text: "Fundamentals".into(),
                }],
                lessons: vec![RawLesson {
                    id: "xor-intro".into(),
                    directory: directory.path().display().to_string(),
                }],
            }],
        })
        .unwrap();
        let schema = Schema::build(Query, EmptyMutation, EmptySubscription)
            .data(catalog)
            .finish();
        let response = schema.execute(
            "{ learning { lessonCategories { id lessons { id } } } lessonDocuments(lessonId: \"xor-intro\", language: \"zh-CN\") { lesson locale } }",
        ).await;

        assert!(response.errors.is_empty());
        assert_eq!(
            response.data.into_json().unwrap(),
            serde_json::json!({
                "learning": {"lessonCategories": [{"id": "fundamentals", "lessons": [{"id": "xor-intro"}]}]},
                "lessonDocuments": {"lesson": "version: 1", "locale": null},
            }),
        );
    }
}
