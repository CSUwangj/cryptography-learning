//! `completion-relay` operator CLI.

mod key;

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use completion_relay::config;
use completion_relay::serve::{self, init_tracing};
use tokio::net::TcpListener;
use tokio::signal::unix::{SignalKind, signal};

#[derive(Debug, Parser)]
#[command(name = "completion-relay", about = "Host Completion Relay")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Load immutable configuration, bind loopback, and serve Challenge intake.
    Serve {
        /// Path to the RelayConfiguration RON file.
        #[arg(long)]
        config: PathBuf,
    },
    /// Host signing-key operator commands.
    Key {
        #[command(subcommand)]
        command: KeyCommand,
    },
}

#[derive(Debug, Subcommand)]
enum KeyCommand {
    /// Generate a new Ed25519 Host signing key and emit a backend RON registration entry.
    Generate {
        /// Signing key identifier (`kid`).
        #[arg(long)]
        kid: String,
        /// Destination path for the unencrypted PKCS#8 PEM private key.
        #[arg(long)]
        private_key: PathBuf,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli.command {
        Command::Serve { config } => {
            init_tracing();
            match serve_main(config) {
                Ok(()) => ExitCode::SUCCESS,
                Err(err) => {
                    eprintln!("completion-relay serve: {err}");
                    ExitCode::FAILURE
                }
            }
        }
        Command::Key { command } => match command {
            KeyCommand::Generate { kid, private_key } => match key::generate(&kid, &private_key) {
                Ok(ron) => {
                    print!("{ron}");
                    ExitCode::SUCCESS
                }
                Err(err) => {
                    eprintln!("completion-relay key generate: {err}");
                    ExitCode::FAILURE
                }
            },
        },
    }
}

#[tokio::main]
async fn serve_main(config_path: PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let loaded = config::load(&config_path)?;
    let listener = TcpListener::bind(loaded.bind_addr()).await?;
    let local = listener.local_addr()?;
    tracing::info!(%local, "completion-relay listening");

    serve::serve_until_shutdown(loaded, listener, shutdown_signal()).await?;
    Ok(())
}

async fn shutdown_signal() {
    let mut sigterm = signal(SignalKind::terminate()).expect("install SIGTERM handler");
    let mut sigint = signal(SignalKind::interrupt()).expect("install SIGINT handler");
    tokio::select! {
        _ = sigterm.recv() => {
            tracing::info!(signal = "SIGTERM", "shutdown signal received");
        }
        _ = sigint.recv() => {
            tracing::info!(signal = "SIGINT", "shutdown signal received");
        }
    }
}
