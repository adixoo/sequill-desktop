//! Command line for the MCP server, shared by the `sequill-mcp` binary and `sequill mcp`.

use crate::server::SequillServer;
use rmcp::ServiceExt;
use std::path::PathBuf;

pub const USAGE: &str = "Usage: sequill mcp [--allow-writes] [--data-dir <path>]

Serves Sequill's databases to an AI assistant over MCP (stdio).

  --allow-writes      Also offer the `execute` tool, which can change data and schema.
                      Without it the server is read-only.
  --data-dir <path>   Where Sequill keeps its databases (default: the app's data folder).";

#[derive(Debug, PartialEq)]
pub struct Options {
    pub data_dir: PathBuf,
    pub allow_writes: bool,
}

#[derive(Debug, PartialEq)]
pub enum Command {
    Serve(Options),
    Help,
}

pub fn parse(args: &[String]) -> Result<Command, String> {
    let mut data_dir = None;
    let mut allow_writes = false;
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--allow-writes" => allow_writes = true,
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
    Ok(Command::Serve(Options {
        data_dir,
        allow_writes,
    }))
}

/// Runs the server until the client disconnects. Logs go to stderr; stdout is the protocol.
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
    let server = SequillServer::new(options.data_dir, options.allow_writes);
    let service = server.serve(rmcp::transport::stdio()).await?;
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
            parse(&args(&["--data-dir", "x", "--allow-writes"])).unwrap(),
            Command::Serve(Options {
                data_dir: PathBuf::from("x"),
                allow_writes: true
            })
        );
        assert_eq!(parse(&args(&["--help"])).unwrap(), Command::Help);
        assert!(parse(&args(&["--data-dir"])).is_err());
        assert!(parse(&args(&["--write"])).is_err());
    }

    #[test]
    fn is_read_only_unless_asked() {
        let Command::Serve(options) = parse(&args(&["--data-dir", "x"])).unwrap() else {
            panic!()
        };
        assert!(!options.allow_writes);
    }
}
