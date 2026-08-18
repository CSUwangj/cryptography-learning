use std::path::PathBuf;

use clap::Parser;
use thiserror::Error;

/// Paths required when the optional Completion module is enabled.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompletionModulePaths {
    pub config: PathBuf,
    pub database: PathBuf,
}

/// Invalid Completion module process-option combinations.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum CompletionOptionsError {
    #[error(
        "Completion requires both --completion-config and --completion-db (or COMPLETION_CONFIG and COMPLETION_DB); exactly one was supplied"
    )]
    IncompletePair,
}

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

    /// Print the SQLite runtime version and exit without bootstrapping the web server.
    #[arg(long)]
    pub print_sqlite_version: bool,

    /// Listen address.
    #[arg(short, long, default_value = "0.0.0.0:8000")]
    pub access_point: String,

    /// Build commit identity logged at startup.
    #[arg(long, env = "BUILD_COMMIT", default_value = "unknown")]
    pub build_commit: String,

    /// Image identity logged at startup.
    #[arg(long, env = "IMAGE_ID", default_value = "unknown")]
    pub image_id: String,

    /// Completion policy RON path. Must be paired with `--completion-db`.
    #[arg(long, env = "COMPLETION_CONFIG")]
    pub completion_config: Option<PathBuf>,

    /// Durable Completion Claims SQLite path. Must be paired with `--completion-config`.
    #[arg(long, env = "COMPLETION_DB")]
    pub completion_db: Option<PathBuf>,
}

impl Opt {
    /// Resolve optional Completion module paths from process options.
    ///
    /// Both absent → Practice-only (`Ok(None)`). Both present → enabled module.
    /// Exactly one is a startup error.
    pub fn completion_module_paths(
        &self,
    ) -> Result<Option<CompletionModulePaths>, CompletionOptionsError> {
        match (&self.completion_config, &self.completion_db) {
            (None, None) => Ok(None),
            (Some(config), Some(database)) => Ok(Some(CompletionModulePaths {
                config: config.clone(),
                database: database.clone(),
            })),
            (Some(_), None) | (None, Some(_)) => Err(CompletionOptionsError::IncompletePair),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    fn parse(args: &[&str]) -> Opt {
        Opt::try_parse_from(args).expect("CLI should parse")
    }

    #[test]
    fn practice_only_when_both_completion_options_absent() {
        let opt = parse(&["cryptography-learning", "--static", "/www"]);
        assert_eq!(opt.completion_module_paths(), Ok(None));
    }

    #[test]
    fn accepts_sqlite_version_diagnostic() {
        let opt = parse(&[
            "cryptography-learning",
            "--static",
            "/www",
            "--print-sqlite-version",
        ]);
        assert!(opt.print_sqlite_version);
    }

    #[test]
    fn rejects_exactly_one_completion_option() {
        let config_only = parse(&[
            "cryptography-learning",
            "--static",
            "/www",
            "--completion-config",
            "/etc/completion.ron",
        ]);
        assert_eq!(
            config_only.completion_module_paths(),
            Err(CompletionOptionsError::IncompletePair)
        );

        let db_only = parse(&[
            "cryptography-learning",
            "--static",
            "/www",
            "--completion-db",
            "/var/completion.sqlite",
        ]);
        assert_eq!(
            db_only.completion_module_paths(),
            Err(CompletionOptionsError::IncompletePair)
        );
    }

    #[test]
    fn accepts_paired_completion_options() {
        let opt = parse(&[
            "cryptography-learning",
            "--static",
            "/www",
            "--completion-config",
            "/etc/completion.ron",
            "--completion-db",
            "/var/completion.sqlite",
        ]);
        assert_eq!(
            opt.completion_module_paths(),
            Ok(Some(CompletionModulePaths {
                config: PathBuf::from("/etc/completion.ron"),
                database: PathBuf::from("/var/completion.sqlite"),
            }))
        );
    }
}
