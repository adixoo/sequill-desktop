//! The MCP server: the tools in `tools/`, described for AI assistants.

use crate::tools::{self, app, data, schema};
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
use sequill_core::ddl::{ColumnSpec, IndexSpec, ObjectKind, TableSpec, TriggerSpec};
use sequill_core::design::Draft;
use sequill_core::filter::{Filter, FilterMatch};
use sequill_core::rows::Sort;
use serde::Deserialize;
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;

const INSTRUCTIONS: &str = "Sequill keeps the user's SQLite databases; these tools do what its \
editor does, and work whether or not the Sequill app is open (show_in_app needs it open). \
Start with list_databases, then \
get_schema or describe_table. Read rows with find_rows (filters, search, sort, paging) or \
query (one read-only SELECT; use ? and params). Use show_in_app to put a table (with filters), a query or the schema diagram on the user's \
screen. Tools that change things (rows, tables, indexes, triggers, views, databases, saved \
queries) work only while the user allows changes in Sequill: say what you will change before \
calling them. If a tool says MCP access or changes are off, ask the user to turn them on with \
the MCP button in Sequill. To propose schema changes for the user to review instead of making \
them, read the schema designer's draft with get_design and write it back with set_design; the \
user saves it to the database.";

/// Tools that change data, schema, databases or saved queries; they need "Allow changes"
/// in the app, checked on every call.
pub const WRITE_TOOLS: [&str; 16] = [
    "execute",
    "insert_rows",
    "update_rows",
    "delete_rows",
    "create_table",
    "alter_table",
    "create_index",
    "create_trigger",
    "create_view",
    "drop_object",
    "create_database",
    "rename_database",
    "delete_database",
    "save_query",
    "delete_saved_query",
    "set_design",
];

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DatabaseArgs {
    /// The database's id, or its exact name, from list_databases.
    pub database: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TableArgs {
    /// The database's id, or its exact name, from list_databases.
    pub database: String,
    /// The table or view.
    pub table: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct QueryArgs {
    /// The database's id, or its exact name, from list_databases.
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
    /// The database's id, or its exact name, from list_databases.
    pub database: String,
    /// One or more SQL statements separated by semicolons.
    pub sql: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct FindRowsArgs {
    /// The database's id, or its exact name, from list_databases.
    pub database: String,
    /// The table or view.
    pub table: String,
    /// Conditions on columns, as in the editor's filter builder.
    #[serde(default)]
    pub filters: Vec<Filter>,
    /// "all" filters must match (default) or "any" one.
    #[serde(default, rename = "match")]
    pub matching: FilterMatch,
    /// Text to look for in every column.
    pub search: Option<String>,
    #[serde(default)]
    pub sort: Vec<Sort>,
    /// Most rows to return (default 200, at most 5000).
    pub limit: Option<usize>,
    /// Rows to skip, for the next page.
    pub offset: Option<usize>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct InsertRowsArgs {
    /// The database's id, or its exact name, from list_databases.
    pub database: String,
    pub table: String,
    /// Rows as {"column": value} objects; missing columns get their defaults.
    /// Blobs as {"$blob": base64}. All rows are added, or none.
    pub rows: Vec<Map<String, Value>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct UpdateRowsArgs {
    /// The database's id, or its exact name, from list_databases.
    pub database: String,
    pub table: String,
    /// New values as {"column": value}.
    pub set: Map<String, Value>,
    /// Which rows to change. Required unless all_rows is true.
    #[serde(default)]
    pub filters: Vec<Filter>,
    #[serde(default, rename = "match")]
    pub matching: FilterMatch,
    /// Change every row of the table (only when no filters are given).
    #[serde(default)]
    pub all_rows: bool,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DeleteRowsArgs {
    /// The database's id, or its exact name, from list_databases.
    pub database: String,
    pub table: String,
    /// Which rows to delete. Required unless all_rows is true.
    #[serde(default)]
    pub filters: Vec<Filter>,
    #[serde(default, rename = "match")]
    pub matching: FilterMatch,
    /// Delete every row of the table (only when no filters are given).
    #[serde(default)]
    pub all_rows: bool,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateTableArgs {
    /// The database's id, or its exact name, from list_databases.
    pub database: String,
    pub table: TableSpec,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct AlterTableArgs {
    /// The database's id, or its exact name, from list_databases.
    pub database: String,
    pub table: String,
    pub action: schema::AlterAction,
    /// The column to rename or drop.
    pub column: Option<String>,
    /// The new name, for rename_column and rename_table.
    pub new_name: Option<String>,
    /// The column to add, for add_column.
    pub definition: Option<ColumnSpec>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateIndexArgs {
    /// The database's id, or its exact name, from list_databases.
    pub database: String,
    pub index: IndexSpec,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateTriggerArgs {
    /// The database's id, or its exact name, from list_databases.
    pub database: String,
    pub trigger: TriggerSpec,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateViewArgs {
    /// The database's id, or its exact name, from list_databases.
    pub database: String,
    pub name: String,
    /// The SELECT the view shows.
    pub select: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DropObjectArgs {
    /// The database's id, or its exact name, from list_databases.
    pub database: String,
    pub kind: ObjectKind,
    pub name: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateDatabaseArgs {
    pub name: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RenameDatabaseArgs {
    /// The database's id, or its exact name, from list_databases.
    pub database: String,
    /// The new name.
    pub name: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SaveQueryArgs {
    pub name: String,
    pub sql: String,
    /// Updates this saved query (from list_saved_queries). Without it, a query with the
    /// same name is updated, or a new one is added.
    pub id: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SavedQueryIdArgs {
    /// The saved query's id, from list_saved_queries.
    pub id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SetDesignArgs {
    /// The database's id, or its exact name, from list_databases.
    pub database: String,
    /// The version get_design returned; the save is refused if the design changed since.
    pub version: i64,
    /// The whole design: what get_design returned, with your changes. It replaces the
    /// stored one. Name existing tables and columns as they are in the database now.
    pub draft: Draft,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ShowArgs {
    /// The database's id, or its exact name, from list_databases.
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
    tool_router: ToolRouter<Self>,
}

impl SequillServer {
    /// A server over the databases in `data_dir`. Every tool is offered; the switches in the
    /// app decide on each call whether assistants may read, and whether they may change things.
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir: Arc::new(data_dir),
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

    /// Lists the user's Sequill databases with their ids, names, sizes and last change times.
    #[tool(annotations(title = "List databases", read_only_hint = true))]
    async fn list_databases(&self) -> Result<String, String> {
        self.run(tools::list_databases).await
    }

    /// Shows a database's tables, views, indexes and triggers with the SQL that defines them.
    #[tool(annotations(title = "Get schema", read_only_hint = true))]
    async fn get_schema(&self, Parameters(a): Parameters<DatabaseArgs>) -> Result<String, String> {
        self.run(move |dir| tools::get_schema(dir, &a.database))
            .await
    }

    /// One table or view in detail: columns (types, keys, defaults), foreign keys, indexes,
    /// triggers and its row count.
    #[tool(annotations(title = "Describe table", read_only_hint = true))]
    async fn describe_table(&self, Parameters(a): Parameters<TableArgs>) -> Result<String, String> {
        self.run(move |dir| tools::describe_table(dir, &a.database, &a.table))
            .await
    }

    /// Reads rows of a table or view like the editor's table view: filters (eq, neq,
    /// contains, not_contains, starts, ends, gt, gte, lt, lte, between, in, empty, null,
    /// not_null), a text search over every column, sorting and paging. Returns the matching
    /// total too.
    #[tool(annotations(title = "Find rows", read_only_hint = true))]
    async fn find_rows(&self, Parameters(a): Parameters<FindRowsArgs>) -> Result<String, String> {
        self.run(move |dir| {
            data::find_rows(
                dir,
                &a.database,
                &a.table,
                a.filters,
                a.matching,
                a.search,
                a.sort,
                a.limit,
                a.offset,
            )
        })
        .await
    }

    /// Runs one read-only SQL statement and returns its columns and rows.
    /// Blobs come back as {"$blob": base64} and very large integers as {"$bigint": "…"}.
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

    /// Shows how SQLite would run each statement (EXPLAIN QUERY PLAN), without running it.
    /// Use it to check whether a query uses an index.
    #[tool(annotations(title = "Explain query", read_only_hint = true))]
    async fn explain_query(&self, Parameters(a): Parameters<SqlArgs>) -> Result<String, String> {
        self.run(move |dir| tools::explain_query(dir, &a.database, &a.sql))
            .await
    }

    /// Lists the user's saved queries (shared by every database) with their ids and SQL.
    #[tool(annotations(title = "List saved queries", read_only_hint = true))]
    async fn list_saved_queries(&self) -> Result<String, String> {
        self.run(app::list_saved_queries).await
    }

    /// Reads the database's unsaved schema design: the changes the user (or an assistant)
    /// planned in Sequill's schema designer but hasn't saved to the database yet, with its
    /// version. The database itself is unchanged until the user saves the design there.
    #[tool(annotations(title = "Get design", read_only_hint = true))]
    async fn get_design(&self, Parameters(a): Parameters<DatabaseArgs>) -> Result<String, String> {
        self.run(move |dir| app::get_design(dir, &a.database)).await
    }

    /// Shows something in the open Sequill window: a table with filters, search and sort
    /// ("table"), a new query tab with SQL in it ("query", not run), or the schema diagram
    /// ("schema"). Fails if Sequill isn't open.
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

    // ---- Changing data -------------------------------------------------------------------

    /// Runs SQL that changes data or schema (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP).
    /// Each statement commits on its own; reports every statement up to the first error.
    #[tool(annotations(title = "Execute SQL", read_only_hint = false, destructive_hint = true))]
    async fn execute(&self, Parameters(a): Parameters<SqlArgs>) -> Result<String, String> {
        self.run(move |dir| tools::execute(dir, &a.database, &a.sql))
            .await
    }

    /// Adds rows to a table, all or none.
    #[tool(annotations(
        title = "Insert rows",
        read_only_hint = false,
        destructive_hint = false
    ))]
    async fn insert_rows(
        &self,
        Parameters(a): Parameters<InsertRowsArgs>,
    ) -> Result<String, String> {
        self.run(move |dir| data::insert_rows(dir, &a.database, &a.table, &a.rows))
            .await
    }

    /// Sets columns to new values on the rows that match the filters.
    #[tool(annotations(title = "Update rows", read_only_hint = false, destructive_hint = true))]
    async fn update_rows(
        &self,
        Parameters(a): Parameters<UpdateRowsArgs>,
    ) -> Result<String, String> {
        self.run(move |dir| {
            data::update_rows(
                dir,
                &a.database,
                &a.table,
                &a.set,
                &a.filters,
                a.matching,
                a.all_rows,
            )
        })
        .await
    }

    /// Deletes the rows that match the filters.
    #[tool(annotations(title = "Delete rows", read_only_hint = false, destructive_hint = true))]
    async fn delete_rows(
        &self,
        Parameters(a): Parameters<DeleteRowsArgs>,
    ) -> Result<String, String> {
        self.run(move |dir| {
            data::delete_rows(
                dir,
                &a.database,
                &a.table,
                &a.filters,
                a.matching,
                a.all_rows,
            )
        })
        .await
    }

    // ---- Changing the schema -------------------------------------------------------------

    /// Creates a table from column definitions (types, primary key, NOT NULL, UNIQUE,
    /// defaults, foreign keys), optionally STRICT or WITHOUT ROWID. Returns the SQL it ran.
    #[tool(annotations(
        title = "Create table",
        read_only_hint = false,
        destructive_hint = false
    ))]
    async fn create_table(
        &self,
        Parameters(a): Parameters<CreateTableArgs>,
    ) -> Result<String, String> {
        self.run(move |dir| schema::create_table(dir, &a.database, &a.table))
            .await
    }

    /// Changes a table: add_column (with definition), rename_column, drop_column or
    /// rename_table. Returns the SQL it ran.
    #[tool(annotations(title = "Alter table", read_only_hint = false, destructive_hint = true))]
    async fn alter_table(
        &self,
        Parameters(a): Parameters<AlterTableArgs>,
    ) -> Result<String, String> {
        self.run(move |dir| {
            schema::alter_table(
                dir,
                &a.database,
                &a.table,
                a.action,
                &a.column,
                &a.new_name,
                a.definition.as_ref(),
            )
        })
        .await
    }

    /// Creates an index on one or more columns (each optionally descending), optionally
    /// UNIQUE or partial (where). Returns the SQL it ran.
    #[tool(annotations(
        title = "Create index",
        read_only_hint = false,
        destructive_hint = false
    ))]
    async fn create_index(
        &self,
        Parameters(a): Parameters<CreateIndexArgs>,
    ) -> Result<String, String> {
        self.run(move |dir| schema::create_index(dir, &a.database, &a.index))
            .await
    }

    /// Creates a trigger that runs SQL before or after an insert, update or delete
    /// (instead_of on views). The body and condition may use NEW. and OLD.
    #[tool(annotations(
        title = "Create trigger",
        read_only_hint = false,
        destructive_hint = false
    ))]
    async fn create_trigger(
        &self,
        Parameters(a): Parameters<CreateTriggerArgs>,
    ) -> Result<String, String> {
        self.run(move |dir| schema::create_trigger(dir, &a.database, &a.trigger))
            .await
    }

    /// Creates a view from a SELECT.
    #[tool(annotations(
        title = "Create view",
        read_only_hint = false,
        destructive_hint = false
    ))]
    async fn create_view(
        &self,
        Parameters(a): Parameters<CreateViewArgs>,
    ) -> Result<String, String> {
        self.run(move |dir| schema::create_view(dir, &a.database, &a.name, &a.select))
            .await
    }

    /// Drops a table, view, index or trigger. Dropping a table deletes its rows.
    #[tool(annotations(title = "Drop object", read_only_hint = false, destructive_hint = true))]
    async fn drop_object(
        &self,
        Parameters(a): Parameters<DropObjectArgs>,
    ) -> Result<String, String> {
        self.run(move |dir| schema::drop_object(dir, &a.database, a.kind, &a.name))
            .await
    }

    // ---- Databases and saved queries -----------------------------------------------------

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

    /// Saves SQL as a named query in the editor's saved queries, or updates one.
    #[tool(annotations(title = "Save query", read_only_hint = false, destructive_hint = true))]
    async fn save_query(&self, Parameters(a): Parameters<SaveQueryArgs>) -> Result<String, String> {
        self.run(move |dir| app::save_query(dir, &a.name, &a.sql, a.id.as_deref()))
            .await
    }

    /// Replaces the database's unsaved schema design (from get_design, with your changes)
    /// for the user to review in Sequill's schema designer. The database itself doesn't
    /// change: the user saves the design there, and sees any error then.
    #[tool(annotations(title = "Set design", read_only_hint = false, destructive_hint = true))]
    async fn set_design(&self, Parameters(a): Parameters<SetDesignArgs>) -> Result<String, String> {
        self.run(move |dir| app::set_design(dir, &a.database, a.version, &a.draft))
            .await
    }

    /// Removes a saved query.
    #[tool(annotations(
        title = "Delete saved query",
        read_only_hint = false,
        destructive_hint = true
    ))]
    async fn delete_saved_query(
        &self,
        Parameters(a): Parameters<SavedQueryIdArgs>,
    ) -> Result<String, String> {
        self.run(move |dir| app::delete_saved_query(dir, &a.id))
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

    const READ_TOOLS: [&str; 9] = [
        "describe_table",
        "explain_query",
        "find_rows",
        "get_design",
        "get_schema",
        "list_databases",
        "list_saved_queries",
        "query",
        "show_in_app",
    ];

    #[test]
    fn offers_every_tool_so_the_app_switch_alone_decides() {
        let server = SequillServer::new(PathBuf::from("."));
        let mut all: Vec<&str> = READ_TOOLS.iter().chain(&WRITE_TOOLS).copied().collect();
        all.sort();
        assert_eq!(tool_names(&server), all);
        assert!(server.get_tool("delete_rows").is_some());
    }

    #[test]
    fn hints_say_which_tools_change_things() {
        let server = SequillServer::new(PathBuf::from("."));
        for tool in server.tool_router.list_all() {
            let hints = tool.annotations.expect("every tool is annotated");
            let changes_nothing =
                READ_TOOLS.contains(&tool.name.as_ref()) && tool.name != "show_in_app";
            assert_eq!(hints.read_only_hint, Some(changes_nothing), "{}", tool.name);
        }
    }

    #[test]
    fn every_input_schema_is_an_object() {
        let server = SequillServer::new(PathBuf::from("."));
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
