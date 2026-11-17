//! The app's side of MCP: each `sequill mcp` that connects (one per assistant session) gets
//! its own `SequillServer`, which runs the tools on the app's data folder.

use crate::pipe::{self, Listener};
use crate::server::SequillServer;
use rmcp::ServiceExt;
use std::io;
use std::path::PathBuf;
use tokio::task::JoinSet;

/// Serves assistants until the app quits. Fails at once if another app already serves
/// `data_dir`.
pub async fn serve(data_dir: PathBuf) -> io::Result<()> {
    let listener = Listener::bind(&data_dir)?;
    serve_on(listener, data_dir).await
}

/// `serve` on a listener that is already bound. Stopping it ends every session too.
pub async fn serve_on(mut listener: Listener, data_dir: PathBuf) -> io::Result<()> {
    let mut sessions = JoinSet::new();
    loop {
        let stream = listener.accept().await?;
        while sessions.try_join_next().is_some() {}
        sessions.spawn(session(stream, data_dir.clone()));
    }
}

async fn session(stream: impl pipe::Stream, data_dir: PathBuf) {
    match SequillServer::new(data_dir).serve(stream).await {
        Ok(service) => {
            if let Err(error) = service.waiting().await {
                eprintln!("sequill mcp: an assistant's session stopped: {error}");
            }
        }
        Err(error) => eprintln!("sequill mcp: an assistant could not connect: {error}"),
    }
}
