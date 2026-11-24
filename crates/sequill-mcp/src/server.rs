//! The MCP server: the tools in `tools/`, described for AI assistants.

use crate::tools::{self, app};
use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::tool::ToolCallContext;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{
    CallToolRequestParams, CallToolResponse, Implementation, ServerCapabilities, ServerConfig, Tool,
};
use rmcp::service::RequestContext;
use rmcp::{ErrorData, RoleServer, ServerHandler, tool, tool_handler, tool_router};
use schemars::JsonSchema;
use sequill_core::CellValue;
use sequill_core::design::Draft;
use sequill_core::filter::{Filter, FilterMatch};
use sequill_core::rows::Sort;
use serde::Deserialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Arc;

const INSTRUCTIONS: &str = "Sequill keeps the user's SQLite databases. Start with app_info: \
the app's version, whether its window is open, the page it shows (editor or schema) and the \
database there, and every database. Read with query (one read-only statement: SELECT, WITH, \
PRAGMA or EXPLAIN; use ? and params); read the schema with SQL too, such as \
SELECT name, type, sql FROM sqlite_schema or PRAGMA table_info(t). Change data or schema with \
execute: the whole script runs as one transaction, all or nothing, and the result says what \
each statement did. Reading works whenever MCP access is on; changes (execute's writes, \
creating, renaming or deleting databases, set_design) only while the user allows changes in \
Sequill: say what you will change before calling them. If a tool says MCP access or changes \
are off, ask the user to turn them on with the MCP button in Sequill; never work around it. \
Use show_in_app to switch the window between the editor and the schema page, or to show a \
table (with filters) or a query. get_schema is for the schema designer: it reads the schema \
and the unsaved design, which set_design changes for the user to review and save. \
app_info also lists designs of other databases (PostgreSQL, MySQL…): only get_schema, \
set_design and show_in_app's schema page work on those.";

/// Tools that change data, schema or databases; they need "Allow changes" in the app,
/// checked on every call (execute checks each statement, so it still reads without it).
pub const WRITE_TOOLS: [&str; 5] = [
    "execute",
    "create_database",
    "rename_database",
    "delete_database",
    "set_design",
];

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DatabaseArgs {
    /// The database's id, or its exact name, from app_info.
    pub database: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct QueryArgs {
    /// The database's id, or its exact name, from app_info.
    pub database: String,
    /// One read-only SQL statement (SELECT, WITH, PRAGMA or EXPLAIN). Use ? for values.
    pub sql: String,
    /// Values for the ? placeholders, in order: numbers, strings or null.
    #[serde(default)]
    pub params: Vec<Value>,
    /// Most rows to return (default 200, at most 5000).
    pub max_rows: Option<usize>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SqlArgs {
    /// The database's id, or its exact name, from app_info.
    pub database: String,
    /// One or more SQL statements separated by semicolons.
    pub sql: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateDatabaseArgs {
    pub name: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RenameDatabaseArgs {
    /// The database's id, or its exact name, from app_info.
    pub database: String,
    /// The new name.
    pub name: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SetDesignArgs {
    /// The database's id, or its exact name, from app_info.
    pub database: String,
    /// The design's version from get_schema; the save is refused if the design changed since.
    pub version: i64,
    /// The whole design: get_schema's design.draft, with your changes. It replaces the
    /// stored one. Name existing tables and columns as they are in the database now.
    pub draft: Draft,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ShowArgs {
    /// The database's id, or its exact name, from app_info.
    pub database: String,
    pub view: app::ShowView,
    /// The table or view, for view "table".
    pub table: Option<String>,
    /// For view "table": the editor's filters.
    #[serde(default)]
    pub filters: Vec<Filter>,
    #[serde(default, rename = "match")]
    pub matching: FilterMatch,
    /// For view "table": text to look for in every column.
    pub search: Option<String>,
    /// For view "table".
    #[serde(default)]
    pub sort: Vec<Sort>,
    /// For view "query": the SQL to put in a new query tab (it isn't run).
    pub sql: Option<String>,
}

#[derive(Clone)]
pub struct SequillServer {
    data_dir: Arc<PathBuf>,
    /// Runs inside the app, so its window is open (the relay runs one itself when it isn't).
    in_app: bool,
    tool_router: ToolRouter<Self>,
}

impl SequillServer {
    /// A server over the databases in `data_dir`. Every tool is offered; the switches in the
    /// app decide on each call whether assistants may read, and whether they may change things.
    pub fn new(data_dir: PathBuf, in_app: bool) -> Self {
        Self {
            data_dir: Arc::new(data_dir),
            in_app,
            tool_router: Self::tool_router(),
        }
    }

    /// Every tool with its description and input schema.
    pub fn tools() -> Vec<Tool> {
        Self::tool_router().list_all()
    }

    /// Runs a tool off the async runtime (SQLite calls block) and returns its JSON as text.
    async fn run(
        &self,
        work: impl FnOnce(&Path) -> sequill_core::Result<Value> + Send + 'static,
    ) -> Result<String, String> {
        let dir = Arc::clone(&self.data_dir);
        match tokio::task::spawn_blocking(move || work(&dir)).await {
            Ok(Ok(value)) => Ok(value.to_string()),
            Ok(Err(error)) => Err(error.to_string()),
            Err(error) => Err(format!("The call stopped unexpectedly: {error}")),
        }
    }
}

#[tool_router]
impl SequillServer {
    // ---- Reading -------------------------------------------------------------------------

    /// Where things stand: the app's version, whether its window is open, the page it shows
    /// ("editor" or "schema") and the database there, whether changes are allowed, and every
    /// database (ids, names, sizes, last change) and design of another database.
    #[tool(annotations(title = "App info", read_only_hint = true))]
    async fn app_info(&self) -> Result<String, String> {
        let in_app = self.in_app;
        self.run(move |dir| app::app_info(dir, in_app)).await
    }

    /// Runs one read-only SQL statement and returns its columns and rows. Read the schema
    /// with it too: SELECT name, type, sql FROM sqlite_schema, PRAGMA table_info(t),
    /// PRAGMA foreign_key_list(t), EXPLAIN QUERY PLAN … Statements that would change
    /// anything are refused. Blobs come back as {"$blob": base64} and very large integers
    /// as {"$bigint": "…"}.
    #[tool(annotations(title = "Query", read_only_hint = true))]
    async fn query(&self, Parameters(a): Parameters<QueryArgs>) -> Result<String, String> {
        let params = a
            .params
            .into_iter()
            .map(serde_json::from_value::<CellValue>)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("A parameter is not a SQLite value: {e}"))?;
        self.run(move |dir| tools::query(dir, &a.database, &a.sql, &params, a.max_rows))
            .await
    }

    /// For the schema designer: the schema as its diagram shows it (tables, views, indexes
    /// and triggers with their SQL), and the unsaved design ("design": version and draft,
    /// the changes planned in the designer). Works for designs of other databases too, with
    /// their type ("dialect") and "objects" (enums, functions… that set_design's "objects"
    /// changes by "kind:name"). To read rows, use query.
    #[tool(annotations(title = "Get schema", read_only_hint = true))]
    async fn get_schema(&self, Parameters(a): Parameters<DatabaseArgs>) -> Result<String, String> {
        self.run(move |dir| app::get_schema(dir, &a.database)).await
    }

    /// Switches the open Sequill window and shows something there: the editor page
    /// ("editor"), the schema page ("schema"), a table with filters, search and sort
    /// ("table"), or a new query tab with SQL in it ("query", not run). Fails if Sequill
    /// isn't open.
    #[tool(annotations(
        title = "Show in Sequill",
        read_only_hint = false,
        destructive_hint = false
    ))]
    async fn show_in_app(&self, Parameters(a): Parameters<ShowArgs>) -> Result<String, String> {
        self.run(move |dir| {
            app::show_in_app(
                dir,
                &a.database,
                a.view,
                a.table.as_deref(),
                &a.filters,
                a.matching,
                a.search.as_deref(),
                &a.sort,
                a.sql.as_deref(),
                app::SHOW_WAIT,
            )
        })
        .await
    }

    // ---- Changing --------------------------------------------------------------------------

    /// Runs SQL that changes data or schema: INSERT, UPDATE, DELETE, CREATE, ALTER, DROP…
    /// The whole script is one transaction: if any statement fails or is refused, nothing
    /// changes. Each statement's result says what it did ("does": insert, update, delete,
    /// create, alter, drop, setting or maintain, and on what). Changes need "Allow changes"
    /// in Sequill; ATTACH, DETACH, BEGIN/COMMIT and PRAGMA writable_schema are never allowed.
    #[tool(annotations(title = "Execute SQL", read_only_hint = false, destructive_hint = true))]
    async fn execute(&self, Parameters(a): Parameters<SqlArgs>) -> Result<String, String> {
        self.run(move |dir| tools::execute(dir, &a.database, &a.sql))
            .await
    }

    /// Creates a new, empty database in Sequill.
    #[tool(annotations(
        title = "Create database",
        read_only_hint = false,
        destructive_hint = false
    ))]
    async fn create_database(
        &self,
        Parameters(a): Parameters<CreateDatabaseArgs>,
    ) -> Result<String, String> {
        self.run(move |dir| app::create_database(dir, &a.name))
            .await
    }

    /// Renames a database (its display name in Sequill).
    #[tool(annotations(
        title = "Rename database",
        read_only_hint = false,
        destructive_hint = false
    ))]
    async fn rename_database(
        &self,
        Parameters(a): Parameters<RenameDatabaseArgs>,
    ) -> Result<String, String> {
        self.run(move |dir| app::rename_database(dir, &a.database, &a.name))
            .await
    }

    /// Deletes a database Sequill keeps and its file for good; it can't be undone. A database
    /// the user opened from a file on their computer is only removed from the list, and the
    /// file stays where it is.
    #[tool(annotations(
        title = "Delete database",
        read_only_hint = false,
        destructive_hint = true
    ))]
    async fn delete_database(
        &self,
        Parameters(a): Parameters<DatabaseArgs>,
    ) -> Result<String, String> {
        self.run(move |dir| app::delete_database(dir, &a.database))
            .await
    }

    /// Replaces the database's unsaved schema design (get_schema's design.draft, with your
    /// changes) for the user to review in Sequill's schema designer. The database itself
    /// doesn't change: the user saves the design there, and sees any error then.
    #[tool(annotations(title = "Set design", read_only_hint = false, destructive_hint = true))]
    async fn set_design(&self, Parameters(a): Parameters<SetDesignArgs>) -> Result<String, String> {
        self.run(move |dir| app::set_design(dir, &a.database, a.version, &a.draft))
            .await
    }
}

// The default router is rebuilt per call (`Self::tool_router()`), which would bring back
// the write tools on a read-only server; route through the field instead.
/// Whether a call worked, and why not if it didn't.
fn outcome(response: &Result<CallToolResponse, ErrorData>) -> (bool, Option<String>) {
    match response {
        Ok(CallToolResponse::Complete(result)) if result.is_error == Some(true) => (
            false,
            result
                .content
                .iter()
                .find_map(|c| c.as_text().map(|t| t.text.clone())),
        ),
        Ok(_) => (true, None),
        Err(error) => (false, Some(error.message.to_string())),
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for SequillServer {
    /// Runs the tool, then adds the call to the history the app shows ("Assistant" in the
    /// editor's sidebar). A history that can't be written never fails the call.
    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let tool = request.name.to_string();
        let args = request.arguments.clone().unwrap_or_default();
        let response = self
            .tool_router
            .call(ToolCallContext::new(self, request, context))
            .await;
        let (ok, message) = outcome(&response);
        let dir = Arc::clone(&self.data_dir);
        let recorded = tokio::task::spawn_blocking(move || {
            tools::record_call(&dir, &tool, &args, ok, message)
        })
        .await;
        match recorded {
            Ok(Ok(())) => {}
            Ok(Err(error)) => eprintln!("sequill mcp: could not record the call: {error}"),
            Err(error) => eprintln!("sequill mcp: could not record the call: {error}"),
        }
        response
    }

    fn get_info(&self) -> ServerConfig {
        info()
    }
}

/// How the server introduces itself, the same in the app and in the relay that reaches it.
pub fn info() -> ServerConfig {
    ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
        .with_server_info(
            Implementation::new("sequill", env!("CARGO_PKG_VERSION")).with_title("Sequill"),
        )
        .with_instructions(INSTRUCTIONS)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tool_names(server: &SequillServer) -> Vec<String> {
        let mut names: Vec<String> = server
            .tool_router
            .list_all()
            .into_iter()
            .map(|t| t.name.into_owned())
            .collect();
        names.sort();
        names
    }

    const READ_TOOLS: [&str; 4] = ["app_info", "get_schema", "query", "show_in_app"];

    #[test]
    fn offers_every_tool_so_the_app_switch_alone_decides() {
        let server = SequillServer::new(PathBuf::from("."), false);
        let mut all: Vec<&str> = READ_TOOLS.iter().chain(&WRITE_TOOLS).copied().collect();
        all.sort();
        assert_eq!(tool_names(&server), all);
        assert!(server.get_tool("execute").is_some());
    }

    #[test]
    fn hints_say_which_tools_change_things() {
        let server = SequillServer::new(PathBuf::from("."), false);
        for tool in server.tool_router.list_all() {
            let hints = tool.annotations.expect("every tool is annotated");
            let changes_nothing =
                READ_TOOLS.contains(&tool.name.as_ref()) && tool.name != "show_in_app";
            assert_eq!(hints.read_only_hint, Some(changes_nothing), "{}", tool.name);
        }
    }

    #[test]
    fn every_input_schema_is_an_object() {
        let server = SequillServer::new(PathBuf::from("."), false);
        for tool in server.tool_router.list_all() {
            assert_eq!(
                tool.input_schema.get("type"),
                Some(&Value::from("object")),
                "{}",
                tool.name
            );
        }
    }
}
