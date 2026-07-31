use cryptography_learning_backend::practice_catalog::RawConfiguration;

#[derive(serde::Deserialize)]
struct PreviousPractice {
    lab_categories: Vec<PreviousCategory>,
}

#[derive(serde::Deserialize)]
struct PreviousCategory {
    id: String,
    name: Vec<PreviousTranslation>,
    labs: Vec<PreviousLab>,
}

#[derive(serde::Deserialize)]
struct PreviousTranslation {
    #[serde(rename = "language")]
    lang: String,
    text: String,
}

#[derive(serde::Deserialize)]
struct PreviousLab {
    id: String,
    ws_endpoints: Vec<PreviousEndpoint>,
    tcp_endpoints: Vec<PreviousEndpoint>,
    resources: Vec<PreviousResource>,
}

#[derive(serde::Deserialize)]
struct PreviousEndpoint {
    host: String,
    port: i32,
}

#[derive(serde::Deserialize)]
struct PreviousResource {
    #[serde(rename = "language")]
    lang: String,
    name: String,
    resource: String,
}

// This models the previous backend's additive-compatible root: it did not
// know schema_version, but its Practice shape is unchanged.
#[derive(serde::Deserialize)]
#[serde(rename = "Configuration")]
struct PreviousConfiguration {
    practice: PreviousPractice,
}

#[test]
fn previous_backend_can_read_the_versioned_manifest() {
    let manifest = include_str!("fixtures/versioned-manifest.ron");
    let previous: PreviousConfiguration = ron::from_str(manifest).expect("rollback fixture");
    let category = &previous.practice.lab_categories[0];
    assert_eq!(category.id, "classical");
    assert_eq!(category.name[0].lang, "en-US");
    assert_eq!(category.name[0].text, "Classical");
    let lab = &category.labs[0];
    assert_eq!(lab.id, "affine");
    assert_eq!(lab.ws_endpoints[0].host, "127.0.0.1");
    assert_eq!(lab.ws_endpoints[0].port, 19020);
    assert_eq!(lab.tcp_endpoints[0].port, 19000);
    assert_eq!(lab.resources[0].lang, "en-US");
    assert_eq!(lab.resources[0].name, "Affine Cipher");
    assert_eq!(
        lab.resources[0].resource,
        "practice/classical/affine/en-US.md"
    );
    let current: RawConfiguration = ron::from_str(manifest).expect("current fixture");
    assert_eq!(
        current.schema_version,
        RawConfiguration::SUPPORTED_SCHEMA_VERSION
    );
}
