use serde::{Deserialize, Serialize};

/// Root RON document consumed at process startup.
///
/// Host-generated manifests continue to use the `Configuration(...)` RON form.
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename = "Configuration")]
#[serde(deny_unknown_fields)]
pub struct RawConfiguration {
    pub schema_version: u32,
    pub practice: RawPractice,
}

impl RawConfiguration {
    pub const SUPPORTED_SCHEMA_VERSION: u32 = 1;

    pub fn validate_schema_version(&self) -> Result<(), (u32, u32)> {
        if self.schema_version == Self::SUPPORTED_SCHEMA_VERSION {
            Ok(())
        } else {
            Err((Self::SUPPORTED_SCHEMA_VERSION, self.schema_version))
        }
    }
}

/// Parsed raw Practice configuration (RON / serde), before semantic validation.
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct RawPractice {
    pub lab_categories: Vec<RawLabCategory>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct RawLabCategory {
    pub id: String,
    pub name: Vec<RawTranslation>,
    pub labs: Vec<RawLab>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct RawLab {
    pub id: String,
    pub ws_endpoints: Vec<RawEndpoint>,
    pub tcp_endpoints: Vec<RawEndpoint>,
    pub resources: Vec<RawResource>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct RawEndpoint {
    pub host: String,
    pub port: i32,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct RawTranslation {
    #[serde(rename = "language")]
    pub lang: String,
    pub text: String,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct RawResource {
    #[serde(rename = "language")]
    pub lang: String,
    pub name: String,
    pub resource: String,
}
