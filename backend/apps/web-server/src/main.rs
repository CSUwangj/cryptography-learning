use async_graphql::http::{playground_source, GraphQLPlaygroundConfig};
use async_graphql::{EmptyMutation, EmptySubscription, Schema};
use async_graphql_warp::GraphQLResponse;
use cryptography_learning_backend::model::Query;
use cryptography_learning_backend::opts::Opt;
use cryptography_learning_backend::practice_catalog::{
    FilesystemLabContentSource, PracticeCatalog, RawConfiguration,
};
use dotenv::dotenv;
use log::debug;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::path::Path;
use structopt::StructOpt;
use warp::{http::Response as HttpResponse, Filter};

#[tokio::main]
async fn main() {
    dotenv().ok();
    let opt = Opt::from_args();
    std::env::set_var("RUST_LOG", "trace");
    match opt.log_level {
        0 => std::env::set_var("RUST_LOG", "error"),
        1 => std::env::set_var("RUST_LOG", "warn"),
        2 => std::env::set_var("RUST_LOG", "info"),
        3 => std::env::set_var("RUST_LOG", "debug"),
        _ => std::env::set_var("RUST_LOG", "trace"),
    }
    pretty_env_logger::init();

    debug!("{:?}", opt);

    let raw_config = load_raw_configuration(&opt.config);
    debug!("{:?}", raw_config);

    // Lab Description paths in the RON are resolved relative to the process
    // working directory (Hosts `cd` into the content mount before start).
    let content_source = FilesystemLabContentSource::new(".");
    let practice_catalog = PracticeCatalog::try_from_raw(raw_config.practice, &content_source)
        .expect("Invalid Practice catalog");

    println!("Playground: http://{}/playground", opt.access_point);

    let schema = Schema::build(Query, EmptyMutation, EmptySubscription)
        .data(practice_catalog)
        .finish();

    let graphql_post = warp::path("query")
        .and(async_graphql_warp::graphql(schema))
        .and_then(
            |(schema, request): (
                Schema<Query, EmptyMutation, EmptySubscription>,
                async_graphql::Request,
            )| async move {
                Ok::<_, Infallible>(GraphQLResponse::from(schema.execute(request).await))
            },
        );

    let graphql_playground = warp::path("playground").map(|| {
        HttpResponse::builder()
            .header("content-type", "text/html")
            .body(playground_source(GraphQLPlaygroundConfig::new("/query")))
    });

    let static_files = warp::get().and(warp::fs::dir(opt.static_file_path.clone()));
    let path = Path::new(&opt.static_file_path).join("index.html");
    let fallback = warp::fs::file(path);

    let routes = graphql_playground
        .or(graphql_post)
        .or(static_files)
        .or(fallback);

    let socket_addr: SocketAddr = opt
        .access_point
        .parse()
        .expect("Unable to parse host address");
    warp::serve(routes).run(socket_addr).await;
}

fn load_raw_configuration(path: &Path) -> RawConfiguration {
    let config_string =
        std::fs::read_to_string(path).expect("Error occurred opening or reading config file");
    ron::from_str(&config_string).expect("Error parsing config file")
}
