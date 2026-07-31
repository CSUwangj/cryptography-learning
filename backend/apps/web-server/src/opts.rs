use std::path::PathBuf;

use clap::Parser;

#[derive(Debug, Parser)]
#[command(
    name = "Cryptography Learning",
    about = "Using for cryptography learning"
)]
pub struct Opt {
    /// Logging level by number of `v`; default is error.
    /// 1, 2, 3, 4 correspond to warn, info, debug, trace respectively.
    #[arg(short = 'v', action = clap::ArgAction::Count)]
    pub log_level: u8,

    /// Configuration file path.
    #[arg(short, long, default_value = "config.ron", env = "CONFIG")]
    pub config: PathBuf,

    /// Static file path to serve.
    #[arg(short, long = "static", env = "STATIC")]
    pub static_file_path: PathBuf,

    /// Listen address.
    #[arg(short, long, default_value = "0.0.0.0:8000")]
    pub access_point: String,

    /// Build commit identity logged at startup.
    #[arg(long, env = "BUILD_COMMIT", default_value = "unknown")]
    pub build_commit: String,

    /// Image identity logged at startup.
    #[arg(long, env = "IMAGE_ID", default_value = "unknown")]
    pub image_id: String,
}
