use crate::errors::QueryError;
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
}

fn resolve_error_to_field(err: ResolveError) -> async_graphql::Error {
    match err {
        ResolveError::CategoryNotFound(_) => {
            QueryError::NotFoundError("category".to_string()).extend()
        }
        ResolveError::LabNotFound { .. } => QueryError::NotFoundError("lab".to_string()).extend(),
    }
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
