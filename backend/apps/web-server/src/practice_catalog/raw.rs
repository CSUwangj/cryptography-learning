use serde::{Deserialize, Serialize};

/// Root RON document consumed at process startup.
///
/// Host-generated manifests continue to use the `Configuration(...)` RON form.
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename = "Configuration")]
pub struct RawConfiguration {
    pub practice: RawPractice,
}

/// Parsed raw Practice configuration (RON / serde), before semantic validation.
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct RawPractice {
    pub lab_categories: Vec<RawLabCategory>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct RawLabCategory {
    pub id: String,
    pub name: Vec<RawTranslation>,
    pub labs: Vec<RawLab>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct RawLab {
    pub id: String,
    pub ws_endpoints: Vec<RawEndpoint>,
    pub tcp_endpoints: Vec<RawEndpoint>,
    pub resources: Vec<RawResource>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct RawEndpoint {
    pub host: String,
    pub port: i32,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct RawTranslation {
    #[serde(rename = "language")]
    pub lang: String,
    pub text: String,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct RawResource {
    #[serde(rename = "language")]
    pub lang: String,
    pub name: String,
    pub resource: String,
}
