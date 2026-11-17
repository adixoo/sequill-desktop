//! What `sequill mcp` runs for an assistant: an MCP server that passes every tool call on to
//! the running app (`host.rs`), which runs it on the databases it has. It never opens the
//! data folder itself. While Sequill is closed each call says so; once the user opens it,
//! the next call reaches it, without restarting the assistant.

use crate::pipe;
use crate::server::{self, SequillServer};
use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, ListToolsResult,
    PaginatedRequestParams, ServerConfig, Tool,
};
use rmcp::service::{Peer, RequestContext, RunningService};
use rmcp::{ErrorData, RoleClient, RoleServer, ServerHandler, ServiceError, ServiceExt};
use std::path::PathBuf;
use tokio::sync::Mutex;

pub const APP_CLOSED_MESSAGE: &str = "Sequill isn't open, and the tools run in the app. Ask the user to open Sequill, then try again.";

/// The app went away mid-call, so a change may or may not have been made.
pub const CLOSED_DURING_CALL_MESSAGE: &str = "Sequill closed during the call, so it may or may not have finished. Ask the user to open Sequill, then check before trying again.";

pub struct Relay {
    data_dir: PathBuf,
    tools: Vec<Tool>,
    /// The connection to the app, made on the first call and again after the app restarts.
    app: Mutex<Option<RunningService<RoleClient, ()>>>,
}

fn error_result(message: &str) -> CallToolResponse {
    CallToolResult::error(vec![ContentBlock::text(message)]).into()
}

fn unreachable_app(error: impl std::fmt::Display) -> ErrorData {
    ErrorData::internal_error(format!("Could not reach Sequill: {error}"), None)
}

impl Relay {
    /// A relay to the app serving `data_dir`.
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            tools: SequillServer::tools(),
            app: Mutex::new(None),
        }
    }

    /// The app, connecting if there is no open connection; None while the app is closed.
    async fn app(&self) -> Result<Option<Peer<RoleClient>>, ErrorData> {
        let mut app = self.app.lock().await;
        // `is_closed` only sees a close from this side; the transport shows the app hung up.
        let open =
            |s: &&RunningService<RoleClient, ()>| !s.is_closed() && !s.peer().is_transport_closed();
        if let Some(session) = app.as_ref().filter(open) {
            return Ok(Some(session.peer().clone()));
        }
        *app = None;
        let stream = match pipe::connect(&self.data_dir).await {
            Ok(stream) => stream,
            Err(error) if pipe::app_not_running(&error) => return Ok(None),
            Err(error) => return Err(unreachable_app(error)),
        };
        let session = ().serve(stream).await.map_err(unreachable_app)?;
        let peer = session.peer().clone();
        *app = Some(session);
        Ok(Some(peer))
    }
}

impl ServerHandler for Relay {
    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let Some(app) = self.app().await? else {
            return Ok(error_result(APP_CLOSED_MESSAGE));
        };
        match app.call_tool_once(request).await {
            Ok(response) => Ok(response),
            Err(ServiceError::McpError(error)) => Err(error),
            Err(ServiceError::TransportClosed | ServiceError::TransportSend(_)) => {
                Ok(error_result(CLOSED_DURING_CALL_MESSAGE))
            }
            Err(error) => Err(unreachable_app(error)),
        }
    }

    /// The app's tools, listed even while it is closed so the assistant knows what it can ask.
    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        Ok(ListToolsResult::with_all_items(self.tools.clone()))
    }

    fn get_tool(&self, name: &str) -> Option<Tool> {
        self.tools.iter().find(|t| t.name == name).cloned()
    }

    fn get_info(&self) -> ServerConfig {
        server::info()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host;
    use crate::tools::test_support::store_with_shop;
    use rmcp::model::CallToolRequestParams;
    use sequill_core::Store;
    use serde_json::{Value, json};
    use std::path::Path;

    /// An assistant connected to a relay for `dir`, over an in-memory pipe.
    async fn assistant(dir: &Path) -> RunningService<RoleClient, ()> {
        let (assistant_end, relay_end) = tokio::io::duplex(64 * 1024);
        let relay = Relay::new(dir.to_owned());
        tokio::spawn(async move {
            relay
                .serve(relay_end)
                .await
                .unwrap()
                .waiting()
                .await
                .unwrap();
        });
        ().serve(assistant_end).await.unwrap()
    }

    fn call(tool: &str, args: Value) -> CallToolRequestParams {
        CallToolRequestParams::new(tool.to_owned())
            .with_arguments(args.as_object().unwrap().clone())
    }

    fn text(result: &CallToolResult) -> String {
        result.content[0].as_text().unwrap().text.clone()
    }

    /// Starts an app serving `dir`, once the pipe of one stopped just before has closed.
    async fn open_app(dir: &Path) -> tokio::task::JoinHandle<()> {
        let dir = dir.to_owned();
        let mut tries = 0;
        let listener = loop {
            match crate::pipe::Listener::bind(&dir) {
                Ok(listener) => break listener,
                Err(_) if tries < 100 => {
                    tries += 1;
                    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
                }
                Err(error) => panic!("the app could not start: {error}"),
            }
        };
        tokio::spawn(async move {
            host::serve_on(listener, dir).await.unwrap();
        })
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn calls_run_in_the_app_and_show_in_its_history() {
        let (dir, _) = store_with_shop();
        let app = open_app(dir.path()).await;
        let assistant = assistant(dir.path()).await;

        let result = assistant
            .call_tool(call(
                "query",
                json!({ "database": "Shop", "sql": "SELECT count(*) FROM customer" }),
            ))
            .await
            .unwrap();
        assert_ne!(result.is_error, Some(true), "{}", text(&result));
        let rows: Value = serde_json::from_str(&text(&result)).unwrap();
        assert_eq!(rows["rows"], json!([[3]]));

        let history = Store::open_shared(dir.path())
            .unwrap()
            .mcp_activity(10)
            .unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].tool, "query");
        app.abort();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn lists_every_tool_and_says_when_the_app_is_closed() {
        let (dir, _) = store_with_shop();
        let assistant = assistant(dir.path()).await;

        let tools = assistant.list_all_tools().await.unwrap();
        assert_eq!(tools.len(), SequillServer::tools().len());

        let result = assistant
            .call_tool(call("list_databases", json!({})))
            .await
            .unwrap();
        assert_eq!(result.is_error, Some(true));
        assert_eq!(text(&result), APP_CLOSED_MESSAGE);
        let history = Store::open_shared(dir.path())
            .unwrap()
            .mcp_activity(10)
            .unwrap();
        assert!(
            history.is_empty(),
            "the relay never touches the data folder"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn reaches_the_app_once_it_opens_and_again_after_a_restart() {
        let (dir, id) = store_with_shop();
        let assistant = assistant(dir.path()).await;
        let list = || assistant.call_tool(call("list_databases", json!({})));

        assert_eq!(text(&list().await.unwrap()), APP_CLOSED_MESSAGE);

        let app = open_app(dir.path()).await;
        let opened = list().await.unwrap();
        assert!(text(&opened).contains(&id), "{}", text(&opened));

        app.abort();
        let _ = app.await;
        let app = open_app(dir.path()).await;
        // The old connection may still look open for a moment after the app went away.
        let mut reopened = list().await.unwrap();
        if text(&reopened) == CLOSED_DURING_CALL_MESSAGE {
            reopened = list().await.unwrap();
        }
        assert!(text(&reopened).contains(&id), "{}", text(&reopened));
        app.abort();
    }
}
