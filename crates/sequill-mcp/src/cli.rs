//! Command line for the MCP server, shared by the `sequill-mcp` binary and `sequill mcp`.

use crate::relay::Relay;
use rmcp::ServiceExt;
use std::path::PathBuf;

pub const USAGE: &str = "Usage: sequill mcp [--data-dir <path>]

Connects an AI assistant (over MCP on stdio) to the Sequill app, which runs every tool on the
databases it has, so Sequill must be open. Whether assistants may use them, and whether they
may also change them, is set with the MCP button in the app.

  --data-dir <path>   The data folder of the app to reach (default: the app's own).";

#[derive(Debug, PartialEq)]
pub struct Options {
    pub data_dir: PathBuf,
}

#[derive(Debug, PartialEq)]
pub enum Command {
    Serve(Options),
    Help,
}

pub fn parse(args: &[String]) -> Result<Command, String> {
    let mut data_dir = None;
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            // Settings made by older versions pass it; "Allow changes" in the app decides now.
            "--allow-writes" => {}
            "--data-dir" => {
                let dir = args.next().ok_or("--data-dir needs a path")?;
                data_dir = Some(PathBuf::from(dir));
            }
            "-h" | "--help" => return Ok(Command::Help),
            other => return Err(format!("Unknown option {other}")),
        }
    }
    let data_dir = match data_dir {
        Some(dir) => dir,
        None => sequill_core::default_data_dir()
            .ok_or("Could not find the app's data folder; pass --data-dir")?,
    };
    Ok(Command::Serve(Options { data_dir }))
}

/// Relays the assistant's calls until it disconnects. Logs go to stderr; stdout is the protocol.
pub fn main(args: &[String]) -> i32 {
    let options = match parse(args) {
        Ok(Command::Serve(options)) => options,
        Ok(Command::Help) => {
            eprintln!("{USAGE}");
            return 0;
        }
        Err(error) => {
            eprintln!("{error}\n\n{USAGE}");
            return 2;
        }
    };
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            eprintln!("sequill mcp: could not start: {error}");
            return 1;
        }
    };
    match runtime.block_on(serve(options)) {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("sequill mcp: {error}");
            1
        }
    }
}

pub async fn serve(options: Options) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let service = Relay::new(options.data_dir)
        .serve(rmcp::transport::stdio())
        .await?;
    service.waiting().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).to_owned()).collect()
    }

    #[test]
    fn parses_options() {
        assert_eq!(
            parse(&args(&["--data-dir", "x"])).unwrap(),
            Command::Serve(Options {
                data_dir: PathBuf::from("x"),
            })
        );
        assert_eq!(parse(&args(&["--help"])).unwrap(), Command::Help);
        assert!(parse(&args(&["--data-dir"])).is_err());
        assert!(parse(&args(&["--write"])).is_err());
    }

    #[test]
    fn still_accepts_the_flag_older_settings_pass() {
        assert_eq!(
            parse(&args(&["--allow-writes", "--data-dir", "x"])).unwrap(),
            parse(&args(&["--data-dir", "x"])).unwrap()
        );
    }
}
