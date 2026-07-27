use crate::errors::QueryError;
use async_graphql::{Context, ErrorExtensions, FieldResult, Object, SimpleObject};
use dashmap::DashMap;
use log::debug;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::fs::File;
use tokio::io::AsyncReadExt;

pub struct Query;
pub type Storage = DashMap<String, String>;

#[Object]
impl Query {
    async fn hello(&self) -> String {
        "hello cryptography".to_string()
    }

    async fn practice<'ctx>(&self, ctx: &'ctx Context<'_>) -> FieldResult<&'ctx Practice> {
        match ctx.data::<Configuration>() {
            Ok(configuration) => Ok(&configuration.practice),
            Err(e) => Err(e),
        }
    }

    async fn lab<'ctx>(
        &self,
        ctx: &'ctx Context<'_>,
        category_id: String,
        lab_id: String,
        language: Option<String>,
    ) -> FieldResult<LabInstance> {
        let categories = &ctx.data::<Configuration>()?.practice.lab_categories;

        let labs = &categories
            .iter()
            .find(|category| category.id == category_id)
            .ok_or(QueryError::NotFoundError("category".to_string()).extend())?
            .labs;

        let lab = labs
            .iter()
            .find(|lab| lab.id == lab_id)
            .ok_or(QueryError::NotFoundError("lab".to_string()).extend())?;

        let resource = language
            .map(|lang| lab.resources.iter().find(|resource| resource.lang == lang))
            .flatten()
            .or(lab.resources.first())
            .ok_or(QueryError::NotFoundError("resource".to_string()).extend())?;

        let mut result: LabInstance = LabInstance {
            lang: resource.lang.clone(),
            name: resource.name.clone(),
            ws_endpoints: lab.ws_endpoints.clone(),
            tcp_endpoints: lab.tcp_endpoints.clone(),
            content: String::new(),
        };

        let storage = ctx.data::<Storage>()?;
        // not writing code in the way above is because aysnc clousure is not stable
        match storage.get(&resource.resource) {
            Some(content) => result.content = content.clone(),
            None => {
                File::open(&resource.resource)
                    .await
                    .map_err(|err| {
                        debug!("{}", &format!("{:?}", err));
                        QueryError::ServerError("open internal error".to_string()).extend()
                    })?
                    .read_to_string(&mut result.content)
                    .await
                    .map_err(|_| QueryError::ServerError("internal error".to_string()).extend())?;
                storage.insert(resource.resource.clone(), result.content.clone());
            }
        };

        Ok(result)
    }
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Configuration {
    practice: Practice,
}

impl Configuration {
    pub async fn from_file(path: PathBuf) -> Configuration {
        let mut config_file = File::open(path).await.expect("Error occurred opening file");
        let mut config_string = String::new();
        config_file
            .read_to_string(&mut config_string)
            .await
            .expect("Error Reading file");
        ron::from_str(&config_string).expect("Error parsing file")
    }
}

#[derive(Deserialize, Serialize, SimpleObject, Debug, Clone)]
struct Endpoint {
    host: String,
    port: i32,
}

#[derive(Deserialize, Serialize, SimpleObject, Debug, Clone)]
struct Lab {
    id: String,
    ws_endpoints: Vec<Endpoint>,
    tcp_endpoints: Vec<Endpoint>,
    resources: Vec<ResourceWithTranslation>,
}

#[derive(Deserialize, Serialize, SimpleObject, Debug, Clone)]
struct LabInstance {
    lang: String,
    name: String,
    content: String,
    ws_endpoints: Vec<Endpoint>,
    tcp_endpoints: Vec<Endpoint>,
}

#[derive(Deserialize, Serialize, SimpleObject, Debug, Clone)]
struct LabCategory {
    id: String,
    name: Vec<Translation>,
    labs: Vec<Lab>,
}

#[derive(Deserialize, Serialize, SimpleObject, Debug, Clone)]
struct Practice {
    lab_categories: Vec<LabCategory>,
}

#[derive(Deserialize, Serialize, SimpleObject, Debug, Clone)]
struct Translation {
    #[serde(rename(deserialize = "language", serialize = "language"))]
    lang: String,
    text: String,
}

#[derive(Deserialize, Serialize, SimpleObject, Debug, Clone)]
struct ResourceWithTranslation {
    #[serde(rename(deserialize = "language", serialize = "language"))]
    lang: String,
    name: String,
    #[graphql(skip)]
    resource: String,
}
