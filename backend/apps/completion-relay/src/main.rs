//! `completion-relay` operator CLI.

use std::net::TcpListener;
use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use completion_relay::config;

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
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli.command {
        Command::Serve { config } => match serve(config) {
            Ok(()) => ExitCode::SUCCESS,
            Err(err) => {
                eprintln!("completion-relay serve: {err}");
                ExitCode::FAILURE
            }
        },
    }
}

fn serve(config_path: PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let loaded = config::load(&config_path)?;
    let listener = TcpListener::bind(loaded.bind_addr())?;
    let local = listener.local_addr()?;
    eprintln!("completion-relay listening on {local}");

    // #39 validates configuration and bind only. Intake arrives in #43.
    // Hold the listener until the process is stopped.
    let _listener = listener;
    loop {
        std::thread::park();
    }
}
