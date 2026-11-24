//! The SQLite API the web UI calls, one command per method of `SqliteApi`
//! (`src/lib/sqlite/client.ts`). The frontend side is `src/lib/sqlite/desktop.ts`.

use percent_encoding::percent_decode_str;
use sequill_core::dialects::{self, Target};
use sequill_core::store::SavedQuery;
use sequill_core::{
    CellValue, DbInfo, DesignPreview, ImportedSchema, McpActivity, QueryResult, Row, Schema,
    SqlStatement, StatementResult, Store, StoredDesign,
};
use serde::Serialize;
use std::sync::{Arc, Mutex, PoisonError};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

/// Header carrying the imported file's name (percent-encoded), next to its raw bytes.
const NAME_HEADER: &str = "x-sequill-name";
/// Header carrying an imported script's database, such as "postgresql".
const DIALECT_HEADER: &str = "x-sequill-dialect";
/// The file picker's database types; matches `DB_FILE_ACCEPT` in `src/constants/index.ts`.
const DB_EXTENSIONS: &[&str] = &["sqlite", "sqlite3", "db", "db3", "s3db", "sl3"];

pub struct AppState {
    pub store: Arc<Mutex<Store>>,
}

type CmdResult<T> = Result<T, String>;

/// Runs `work` on a blocking thread with the store locked: one call at a time, like the
/// browser build's worker, and never on the UI thread.
async fn with_store<T: Send + 'static>(
    state: &State<'_, AppState>,
    work: impl FnOnce(&mut Store) -> sequill_core::Result<T> + Send + 'static,
) -> CmdResult<T> {
    let store = Arc::clone(&state.store);
    tauri::async_runtime::spawn_blocking(move || {
        let mut store = store.lock().unwrap_or_else(PoisonError::into_inner);
        work(&mut store).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn sqlite_version() -> String {
    sequill_core::sqlite_version().to_owned()
}

#[tauri::command]
pub async fn list_databases(state: State<'_, AppState>) -> CmdResult<Vec<DbInfo>> {
    with_store(&state, |s| s.list()).await
}

#[tauri::command]
pub async fn create_database(
    state: State<'_, AppState>,
    name: String,
    seed_sql: Option<String>,
) -> CmdResult<DbInfo> {
    with_store(&state, move |s| s.create(&name, seed_sql.as_deref())).await
}

/// A new, empty design for another database type (the schema designer's only).
#[tauri::command]
pub async fn create_design(
    state: State<'_, AppState>,
    name: String,
    dialect: String,
) -> CmdResult<DbInfo> {
    with_store(&state, move |s| s.create_design(&name, &dialect)).await
}

/// A percent-encoded header's text, if it is there and not blank.
fn header(request: &Request<'_>, name: &str) -> Option<String> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(|v| percent_decode_str(v).decode_utf8_lossy().into_owned())
        .filter(|v| !v.trim().is_empty())
}

/// A new database with the structure of a SQLite file or a SQL script (raw body), not
/// linked to it. The script's database ("postgresql", "mysql"…) comes in `DIALECT_HEADER`.
#[tauri::command]
pub async fn import_schema(
    state: State<'_, AppState>,
    request: Request<'_>,
) -> CmdResult<ImportedSchema> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected the file's bytes".into());
    };
    let bytes = bytes.clone();
    let name = header(&request, NAME_HEADER).unwrap_or_else(|| "Untitled".into());
    let dialect = header(&request, DIALECT_HEADER).unwrap_or_else(|| "generic".into());
    with_store(&state, move |s| s.import_schema(&name, &dialect, &bytes)).await
}

/// A design's schema (its SQLite statements) as another database's CREATE statements.
#[tauri::command]
pub async fn export_schema(statements: Vec<String>, target: Target) -> CmdResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        dialects::export_schema(&statements, target).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Asks for a database file with the system's file picker and adds it to the list, to be
/// edited where it is (no copy). None when the person cancels. The path comes from the
/// picker itself, never from the page.
#[tauri::command]
pub async fn open_database_file(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CmdResult<Option<DbInfo>> {
    let dialog = app
        .dialog()
        .file()
        .set_title("Open a SQLite database")
        .add_filter("SQLite database", DB_EXTENSIONS)
        .add_filter("All files", &["*"]);
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_file())
        .await
        .map_err(|e| e.to_string())?;
    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    with_store(&state, move |s| s.link(&path)).await.map(Some)
}

/// Returns the file as raw bytes (an ArrayBuffer on the JavaScript side).
#[tauri::command]
pub async fn export_database(state: State<'_, AppState>, id: String) -> CmdResult<Response> {
    with_store(&state, move |s| s.export(&id))
        .await
        .map(Response::new)
}

#[tauri::command]
pub async fn rename_database(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> CmdResult<DbInfo> {
    with_store(&state, move |s| s.rename(&id, &name)).await
}

#[tauri::command]
pub async fn delete_database(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    with_store(&state, move |s| s.delete(&id)).await
}

#[derive(Serialize)]
pub struct Opened {
    info: DbInfo,
    schema: Schema,
}

#[tauri::command]
pub async fn open_database(state: State<'_, AppState>, id: String) -> CmdResult<Opened> {
    with_store(&state, move |s| {
        let schema = s.session(&id)?.schema()?;
        Ok(Opened {
            info: s.info(&id)?,
            schema,
        })
    })
    .await
}

#[tauri::command]
pub async fn schema(state: State<'_, AppState>, id: String) -> CmdResult<Schema> {
    with_store(&state, move |s| s.session(&id)?.schema()).await
}

#[tauri::command]
pub async fn count(
    state: State<'_, AppState>,
    id: String,
    sql: String,
    params: Vec<CellValue>,
) -> CmdResult<i64> {
    with_store(&state, move |s| s.session(&id)?.count(&sql, &params)).await
}

#[tauri::command]
pub async fn query(
    state: State<'_, AppState>,
    id: String,
    sql: String,
    params: Option<Vec<CellValue>>,
    limit: Option<usize>,
) -> CmdResult<QueryResult> {
    with_store(&state, move |s| {
        let result = s
            .session(&id)?
            .query(&sql, &params.unwrap_or_default(), limit)?;
        if result.changes > 0 {
            s.touch()?;
        }
        Ok(result)
    })
    .await
}

#[tauri::command]
pub async fn exec_script(
    state: State<'_, AppState>,
    id: String,
    sql: String,
    row_limit: usize,
) -> CmdResult<Vec<StatementResult>> {
    with_store(&state, move |s| {
        let results = s.session(&id)?.exec_script(&sql, row_limit);
        s.touch()?;
        Ok(results)
    })
    .await
}

#[tauri::command]
pub async fn explain_script(
    state: State<'_, AppState>,
    id: String,
    sql: String,
) -> CmdResult<Vec<StatementResult>> {
    with_store(&state, move |s| Ok(s.session(&id)?.explain_script(&sql))).await
}

#[tauri::command]
pub async fn transaction(
    state: State<'_, AppState>,
    id: String,
    statements: Vec<SqlStatement>,
) -> CmdResult<u64> {
    with_store(&state, move |s| {
        let changes = s.session(&id)?.transaction(&statements)?;
        s.touch()?;
        Ok(changes)
    })
    .await
}

/// Checks a schema design on a structure-only copy; the database itself is not touched.
#[tauri::command]
pub async fn preview_design(
    state: State<'_, AppState>,
    id: Option<String>,
    statements: Vec<String>,
) -> CmdResult<DesignPreview> {
    with_store(&state, move |s| {
        s.preview_design(id.as_deref(), &statements)
    })
    .await
}

#[tauri::command]
pub async fn apply_design(
    state: State<'_, AppState>,
    id: String,
    statements: Vec<String>,
    base: Option<i64>,
) -> CmdResult<()> {
    with_store(&state, move |s| s.apply_design(&id, &statements, base)).await
}

#[tauri::command]
pub async fn insert_many(
    state: State<'_, AppState>,
    id: String,
    sql: String,
    rows: Vec<Row>,
) -> CmdResult<u64> {
    with_store(&state, move |s| {
        let inserted = s.session(&id)?.insert_many(&sql, &rows)?;
        s.touch()?;
        Ok(inserted)
    })
    .await
}

#[tauri::command]
pub async fn dump(state: State<'_, AppState>, id: String) -> CmdResult<String> {
    with_store(&state, move |s| s.session(&id)?.dump()).await
}

/// Saved queries live in the catalog on desktop.
#[tauri::command]
pub async fn list_saved_queries(state: State<'_, AppState>) -> CmdResult<Vec<SavedQuery>> {
    with_store(&state, |s| s.saved_queries()).await
}

#[tauri::command]
pub async fn upsert_saved_query(state: State<'_, AppState>, query: SavedQuery) -> CmdResult<()> {
    with_store(&state, move |s| s.upsert_saved_query(&query)).await
}

#[tauri::command]
pub async fn delete_saved_query(state: State<'_, AppState>, id: String) -> CmdResult<bool> {
    with_store(&state, move |s| s.delete_saved_query(&id)).await
}

#[tauri::command]
pub async fn list_designs(state: State<'_, AppState>) -> CmdResult<Vec<StoredDesign>> {
    with_store(&state, |s| s.designs()).await
}

/// The new version, or None when an assistant saved the design first (nothing is saved).
#[tauri::command]
pub async fn save_design(
    state: State<'_, AppState>,
    key: String,
    draft: serde_json::Value,
    version: i64,
) -> CmdResult<Option<i64>> {
    with_store(&state, move |s| s.save_design(&key, &draft, version)).await
}

/// The MCP switches and how an MCP client starts this app's MCP server.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    enabled: bool,
    allow_changes: bool,
    command: String,
    args: Vec<String>,
    /// A development build: assistants would start a copy that opens a console window and
    /// goes away with the next rebuild, so the app suggests the installed one instead.
    dev_build: bool,
    /// Days the record of what assistants did is kept; None keeps it forever.
    history_days: Option<u32>,
}

fn mcp_status_of(store: &Store) -> sequill_core::Result<McpStatus> {
    let exe = std::env::current_exe()?;
    Ok(McpStatus {
        enabled: store.mcp_enabled()?,
        allow_changes: store.mcp_changes_allowed()?,
        command: exe.to_string_lossy().into_owned(),
        args: vec!["mcp".into()],
        dev_build: cfg!(debug_assertions),
        history_days: store.mcp_history_days()?,
    })
}

#[tauri::command]
pub async fn mcp_status(state: State<'_, AppState>) -> CmdResult<McpStatus> {
    with_store(&state, |s| mcp_status_of(s)).await
}

/// Turns MCP access on or off; the MCP server checks it on every call.
#[tauri::command]
pub async fn set_mcp_enabled(state: State<'_, AppState>, enabled: bool) -> CmdResult<McpStatus> {
    with_store(&state, move |s| {
        s.set_mcp_enabled(enabled)?;
        mcp_status_of(s)
    })
    .await
}

/// What assistants did over MCP, newest first.
#[tauri::command]
pub async fn mcp_activity(state: State<'_, AppState>, limit: usize) -> CmdResult<Vec<McpActivity>> {
    with_store(&state, move |s| s.mcp_activity(limit)).await
}

#[tauri::command]
pub async fn clear_mcp_activity(state: State<'_, AppState>) -> CmdResult<()> {
    with_store(&state, |s| s.clear_mcp_activity()).await
}

/// How long the MCP history is kept (None: forever); forgets what is now too old.
#[tauri::command]
pub async fn set_mcp_history_days(
    state: State<'_, AppState>,
    days: Option<u32>,
) -> CmdResult<McpStatus> {
    with_store(&state, move |s| {
        s.set_mcp_history_days(days)?;
        mcp_status_of(s)
    })
    .await
}

/// Lets assistants change things over MCP, or only read; checked on every call.
#[tauri::command]
pub async fn set_mcp_allow_changes(
    state: State<'_, AppState>,
    allowed: bool,
) -> CmdResult<McpStatus> {
    with_store(&state, move |s| {
        s.set_mcp_changes_allowed(allowed)?;
        mcp_status_of(s)
    })
    .await
}

/// What the window shows, for assistants asking over MCP (`app_info`).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UiState {
    page: &'static str,
    database_id: Option<String>,
}

/// Saves the window's page ("editor" or "schema") and database whenever either changes.
#[tauri::command]
pub async fn set_ui_state(
    state: State<'_, AppState>,
    page: String,
    database_id: Option<String>,
) -> CmdResult<()> {
    let page = match page.as_str() {
        "schema" => "schema",
        _ => "editor",
    };
    let ui = UiState { page, database_id };
    let json = serde_json::to_string(&ui).expect("UI state serializes");
    with_store(&state, move |s| s.set_ui_state(&json)).await
}
