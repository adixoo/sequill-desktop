//! What each MCP tool does, as plain functions over the data directory, so they can be
//! tested without a client. `server.rs` exposes them over MCP.
//!
//! - this file: shared helpers, the permission checks, `query` and `execute`
//! - `app.rs`: the app, databases, the schema designer, and showing things in the window

pub mod app;

use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
use rusqlite::limits::Limit;
use sequill_core::split::split_statements;
use sequill_core::{CellValue, DbInfo, Error, NewMcpActivity, Result, Session, Store};
use serde::Serialize;
use serde_json::{Value, json};
use std::path::Path;
use std::sync::{Arc, Mutex};

/// Rows a query returns unless the caller asks for fewer or more.
pub const DEFAULT_MAX_ROWS: usize = 200;
/// The most rows a single call returns, to keep answers within a model's context.
pub const MAX_ROWS_LIMIT: usize = 5_000;

/// Shown to the assistant while the switch in the app is off.
pub const MCP_OFF_MESSAGE: &str = "MCP access is turned off in Sequill. Ask the user to turn it on with the MCP button in the app.";

/// Shown to the assistant when it tries to change something while the user allows only reading.
pub const CHANGES_OFF_MESSAGE: &str = "Changes are turned off in Sequill, so you can only read and show things. Ask the user to switch on \"Allow changes\" in Sequill (MCP button in the top bar), then try again.";

/// Shown when `query` is given a statement that would change something.
pub const QUERY_WRITES_MESSAGE: &str =
    "query only reads, and this statement would change something. Use execute for changes.";

/// The store, if the user has turned MCP access on in the app. Checked on every call,
/// so switching it off takes effect at once, even for a server that is already running.
fn open_store(dir: &Path) -> Result<Store> {
    let store = Store::open_shared(dir)?;
    if !store.mcp_enabled()? {
        return Err(Error::msg(MCP_OFF_MESSAGE));
    }
    Ok(store)
}

/// The store for a call that changes something: also needs "Allow changes" in the app,
/// checked on every call like the MCP switch.
fn open_store_for_changes(dir: &Path) -> Result<Store> {
    let store = open_store(dir)?;
    if !store.mcp_changes_allowed()? {
        return Err(Error::msg(CHANGES_OFF_MESSAGE));
    }
    Ok(store)
}

/// One database opened for one call.
struct Opened {
    store: Store,
    info: DbInfo,
    session: Session,
}

impl Opened {
    /// Keeps the app's list (size, last change) current after a write; the app also
    /// notices the write itself and refreshes what's on screen. The write is already saved,
    /// so a failure here (such as a lock held by a long write) is only logged: reported as a
    /// failed call, the assistant would retry and make the change twice.
    fn record_write(&self) {
        let recorded = self
            .session
            .size_bytes()
            .and_then(|size| self.store.record_write(&self.info.id, size));
        if let Err(error) = recorded {
            eprintln!(
                "sequill mcp: could not update the size of {}: {error}",
                self.info.name
            );
        }
    }

    fn database(&self) -> Value {
        json!({ "id": self.info.id, "name": self.info.name })
    }
}

/// Opens a database by id or name, read-only: SQLite itself then refuses writes. ATTACH is
/// turned off so a call can't reach other files.
fn open_db(dir: &Path, database: &str) -> Result<Opened> {
    let store = open_store(dir)?;
    let info = store.resolve(database)?;
    open_session(store, info, false)
}

/// Opens a database, or a design of another database, read-only: for the tools that read
/// a schema or work on the schema designer's draft.
fn open_design(dir: &Path, database: &str) -> Result<Opened> {
    let store = open_store(dir)?;
    let info = store.resolve_any(database)?;
    open_session(store, info, false)
}

fn open_session(store: Store, info: DbInfo, writable: bool) -> Result<Opened> {
    let path = store.path(&info.id)?;
    let session = if writable {
        Session::open_existing(&path)?
    } else {
        Session::open_read_only(&path)?
    };
    session
        .connection()
        .set_limit(Limit::SQLITE_LIMIT_ATTACHED, 0)?;
    Ok(Opened {
        store,
        info,
        session,
    })
}

/// Adds one call to the history the app lists, whatever the switches say: refused calls are
/// worth seeing too. The database is named as the user knows it when it can be found.
pub fn record_call(
    dir: &Path,
    tool: &str,
    args: &serde_json::Map<String, Value>,
    ok: bool,
    message: Option<String>,
) -> Result<()> {
    let store = Store::open_shared(dir)?;
    let named = args.get("database").and_then(Value::as_str);
    let found = named.and_then(|name| store.resolve_any(name).ok());
    let mut rest = args.clone();
    rest.remove("database");
    let sql = rest
        .remove("sql")
        .and_then(|v| v.as_str().map(str::to_owned));
    store.record_mcp_activity(&NewMcpActivity {
        tool: tool.to_owned(),
        database_id: found.as_ref().map(|d| d.id.clone()),
        database_name: found.map(|d| d.name).or_else(|| named.map(str::to_owned)),
        sql,
        details: (!rest.is_empty()).then(|| Value::Object(rest).to_string()),
        ok,
        message,
    })
}

fn to_json<T: serde::Serialize>(value: T) -> Value {
    serde_json::to_value(value).expect("tool results serialize")
}

/// Runs one read-only statement. SQLite refuses writes on this connection, and a statement
/// that would write anyway (such as VACUUM INTO, which writes a new file) is refused first.
pub fn query(
    dir: &Path,
    database: &str,
    sql: &str,
    params: &[CellValue],
    max_rows: Option<usize>,
) -> Result<Value> {
    let db = open_db(dir, database)?;
    if !db.session.connection().prepare(sql)?.readonly() {
        return Err(Error::msg(QUERY_WRITES_MESSAGE));
    }
    let limit = max_rows.unwrap_or(DEFAULT_MAX_ROWS).min(MAX_ROWS_LIMIT);
    Ok(to_json(db.session.query(sql, params, Some(limit))?))
}

/// What a statement changes, as SQLite reports it while preparing the statement.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Insert,
    Update,
    Delete,
    Create,
    Alter,
    Drop,
    /// A PRAGMA that sets something, such as `PRAGMA user_version = 2`.
    Setting,
    /// ANALYZE or REINDEX.
    Maintain,
}

/// One change a statement makes: its kind and the table, index, view, trigger or pragma.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Action {
    pub kind: Kind,
    pub on: String,
}

impl Action {
    fn describe(&self) -> String {
        let on = &self.on;
        match self.kind {
            Kind::Insert => format!("add rows to {on}"),
            Kind::Update => format!("change rows in {on}"),
            Kind::Delete => format!("delete rows from {on}"),
            Kind::Create => format!("create {on}"),
            Kind::Alter => format!("alter {on}"),
            Kind::Drop => format!("drop {on}"),
            Kind::Setting => format!("set PRAGMA {on}"),
            Kind::Maintain => format!("rebuild the statistics or indexes of {on}"),
        }
    }
}

/// How `execute` treats one thing a statement does.
enum Check {
    Read,
    Change(Action),
    /// Refused even with changes allowed; says why.
    Never(&'static str),
}

/// PRAGMAs that only report, even when given an argument such as a table name.
const READ_PRAGMAS: [&str; 16] = [
    "collation_list",
    "compile_options",
    "database_list",
    "foreign_key_check",
    "foreign_key_list",
    "function_list",
    "index_info",
    "index_list",
    "index_xinfo",
    "integrity_check",
    "module_list",
    "pragma_list",
    "quick_check",
    "table_info",
    "table_list",
    "table_xinfo",
];

fn check(action: AuthAction<'_>) -> Check {
    use AuthAction as A;
    let change = |kind, on: &str| {
        Check::Change(Action {
            kind,
            on: on.to_owned(),
        })
    };
    match action {
        A::Select | A::Read { .. } | A::Function { .. } | A::Recursive | A::Savepoint { .. } => {
            Check::Read
        }
        A::Pragma {
            pragma_name,
            pragma_value,
        } => {
            let name = pragma_name.to_ascii_lowercase();
            if name == "writable_schema" && pragma_value.is_some() {
                Check::Never(
                    "PRAGMA writable_schema, which lets SQL damage the database's structure",
                )
            } else if pragma_value.is_none() || READ_PRAGMAS.contains(&name.as_str()) {
                Check::Read
            } else {
                change(Kind::Setting, &name)
            }
        }
        A::Insert { table_name } => change(Kind::Insert, table_name),
        A::Update { table_name, .. } => change(Kind::Update, table_name),
        A::Delete { table_name } => change(Kind::Delete, table_name),
        A::CreateTable { table_name }
        | A::CreateTempTable { table_name }
        | A::CreateVtable { table_name, .. } => change(Kind::Create, table_name),
        A::CreateIndex { index_name, .. } | A::CreateTempIndex { index_name, .. } => {
            change(Kind::Create, index_name)
        }
        A::CreateTrigger { trigger_name, .. } | A::CreateTempTrigger { trigger_name, .. } => {
            change(Kind::Create, trigger_name)
        }
        A::CreateView { view_name } | A::CreateTempView { view_name } => {
            change(Kind::Create, view_name)
        }
        A::AlterTable { table_name, .. } => change(Kind::Alter, table_name),
        A::DropTable { table_name }
        | A::DropTempTable { table_name }
        | A::DropVtable { table_name, .. } => change(Kind::Drop, table_name),
        A::DropIndex { index_name, .. } | A::DropTempIndex { index_name, .. } => {
            change(Kind::Drop, index_name)
        }
        A::DropTrigger { trigger_name, .. } | A::DropTempTrigger { trigger_name, .. } => {
            change(Kind::Drop, trigger_name)
        }
        A::DropView { view_name } | A::DropTempView { view_name } => change(Kind::Drop, view_name),
        A::Analyze { table_name } => change(Kind::Maintain, table_name),
        A::Reindex { index_name } => change(Kind::Maintain, index_name),
        A::Transaction { .. } => Check::Never(
            "BEGIN, COMMIT or ROLLBACK, which aren't needed: execute runs the whole script as one transaction",
        ),
        A::Attach { .. } | A::Detach { .. } => {
            Check::Never("ATTACH or DETACH, which would reach files outside Sequill")
        }
        _ => Check::Never("something Sequill doesn't recognize"),
    }
}

/// SQLite's own bookkeeping when a table, index or view is created or dropped.
fn is_internal(name: &str) -> bool {
    [
        "sqlite_master",
        "sqlite_schema",
        "sqlite_temp_master",
        "sqlite_temp_schema",
    ]
    .contains(&name.to_ascii_lowercase().as_str())
}

/// What the authorizer saw while one statement was prepared.
#[derive(Default)]
struct Seen {
    actions: Vec<Action>,
    /// Why the statement was refused, if it was.
    refused: Option<String>,
}

/// Runs a script as one transaction: all of it, or none of it. While each statement is
/// prepared, SQLite reports what it would do (add rows, drop a table…, including what
/// triggers would do); anything that changes something needs "Allow changes", and a few
/// things are never allowed. A refused or failing statement rolls the whole script back.
pub fn execute(dir: &Path, database: &str, script: &str) -> Result<Value> {
    let store = open_store(dir)?;
    let changes_allowed = store.mcp_changes_allowed()?;
    let info = store.resolve(database)?;
    // With changes off the file is opened read-only too, so SQLite refuses writes as well.
    let mut db = open_session(store, info, changes_allowed)?;
    let seen = Arc::new(Mutex::new(Seen::default()));

    db.session.connection().execute_batch("BEGIN")?;
    let watcher = Arc::clone(&seen);
    db.session
        .connection_mut()
        .authorizer(Some(move |context: AuthContext<'_>| {
            let mut seen = watcher.lock().expect("authorizer state");
            match check(context.action) {
                // SQLite's own bookkeeping comes before the CREATE or DROP it belongs to,
                // which is checked next; SQLite refuses direct writes to it anyway.
                Check::Read => Authorization::Allow,
                Check::Change(action) if is_internal(&action.on) => Authorization::Allow,
                Check::Change(action) if changes_allowed => {
                    if !seen.actions.contains(&action) {
                        seen.actions.push(action);
                    }
                    Authorization::Allow
                }
                Check::Change(action) => {
                    seen.refused.get_or_insert(format!(
                        "it would {}, and {CHANGES_OFF_MESSAGE}",
                        action.describe()
                    ));
                    Authorization::Deny
                }
                Check::Never(what) => {
                    seen.refused
                        .get_or_insert(format!("it uses {what}. That is never allowed over MCP."));
                    Authorization::Deny
                }
            }
        }))?;

    let mut statements = Vec::new();
    let mut failure = None;
    for (number, sql) in split_statements(script).into_iter().enumerate() {
        *seen.lock().expect("authorizer state") = Seen::default();
        let ran = db.session.query(&sql, &[], Some(DEFAULT_MAX_ROWS));
        let seen = std::mem::take(&mut *seen.lock().expect("authorizer state"));
        match ran {
            Ok(result) => {
                let mut statement = to_json(result);
                statement["sql"] = json!(sql);
                statement["does"] = to_json(&seen.actions);
                statements.push(statement);
            }
            Err(error) => {
                let why = seen.refused.unwrap_or_else(|| error.to_string());
                failure = Some(format!(
                    "Nothing was changed. Statement {} ({sql}) was refused or failed: {why}",
                    number + 1
                ));
                break;
            }
        }
    }

    db.session
        .connection_mut()
        .authorizer(None::<fn(AuthContext<'_>) -> Authorization>)?;
    if let Some(failure) = failure {
        db.session.connection().execute_batch("ROLLBACK")?;
        return Err(Error::msg(failure));
    }
    db.session.connection().execute_batch("COMMIT")?;
    let changed = statements
        .iter()
        .any(|s| s["does"].as_array().is_some_and(|a| !a.is_empty()));
    if changed {
        db.record_write();
    }
    Ok(json!({ "database": db.database(), "statements": statements }))
}

#[cfg(test)]
pub(crate) mod test_support {
    use sequill_core::Store;

    /// A data folder with MCP and changes turned on and one "Shop" database; returns the
    /// folder and its id.
    pub fn store_with_shop() -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path()).unwrap();
        store.set_mcp_enabled(true).unwrap();
        store.set_mcp_changes_allowed(true).unwrap();
        let shop = store
            .create(
                "Shop",
                Some(
                    "CREATE TABLE customer (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT);
                     INSERT INTO customer (name, city) VALUES ('Asha', 'Delhi'), ('Ravi', 'Pune'), ('Meera', 'Delhi');",
                ),
            )
            .unwrap();
        (dir, shop.id)
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::store_with_shop;
    use super::*;

    fn count(dir: &Path, id: &str) -> Value {
        query(dir, id, "SELECT count(*) FROM customer", &[], None).unwrap()["rows"].clone()
    }

    #[test]
    fn query_returns_rows_with_a_limit_and_bound_parameters() {
        let (dir, id) = store_with_shop();
        let all = query(
            dir.path(),
            &id,
            "SELECT name FROM customer ORDER BY id",
            &[],
            Some(2),
        )
        .unwrap();
        assert_eq!(all["rows"], json!([["Asha"], ["Ravi"]]));
        assert_eq!(all["truncated"], true);

        let one = query(
            dir.path(),
            &id,
            "SELECT name FROM customer WHERE id = ?",
            &[CellValue::Integer(3)],
            None,
        )
        .unwrap();
        assert_eq!(one["rows"], json!([["Meera"]]));
        let columns = query(dir.path(), &id, "PRAGMA table_info(customer)", &[], None).unwrap();
        assert_eq!(columns["rows"][1][1], "name");
    }

    #[test]
    fn query_cannot_write_attach_vacuum_or_run_several_statements() {
        let (dir, id) = store_with_shop();
        let refused = |sql: &str| {
            query(dir.path(), &id, sql, &[], None)
                .unwrap_err()
                .to_string()
        };
        assert_eq!(refused("DELETE FROM customer"), QUERY_WRITES_MESSAGE);
        assert_eq!(refused("DROP TABLE customer"), QUERY_WRITES_MESSAGE);
        let copy = dir.path().join("copy.db");
        refused(&format!("VACUUM INTO '{}'", copy.display()));
        assert!(!copy.exists(), "VACUUM INTO wrote a file");
        refused("SELECT 1; DELETE FROM customer");
        refused("ATTACH 'other.db' AS other");
        assert_eq!(count(dir.path(), &id), json!([[3]]));
    }

    #[test]
    fn execute_runs_a_script_and_reports_what_each_statement_did() {
        let (dir, id) = store_with_shop();
        let result = execute(
            dir.path(),
            &id,
            "INSERT INTO customer (name) VALUES ('Kiran');
             CREATE TABLE note (body TEXT);
             SELECT count(*) AS n FROM customer;",
        )
        .unwrap();
        let s = &result["statements"];
        assert_eq!(s[0]["changes"], 1);
        assert_eq!(
            s[0]["does"],
            json!([{ "kind": "insert", "on": "customer" }])
        );
        assert_eq!(
            s[1]["does"],
            json!([{ "kind": "create", "on": "note" }]),
            "no bookkeeping"
        );
        assert_eq!(s[2]["does"], json!([]));
        assert_eq!(s[2]["rows"], json!([[4]]));
    }

    #[test]
    fn execute_is_all_or_nothing() {
        let (dir, id) = store_with_shop();
        let error = execute(
            dir.path(),
            &id,
            "DELETE FROM customer; INSERT INTO nope VALUES (1);",
        )
        .unwrap_err()
        .to_string();
        assert!(
            error.starts_with("Nothing was changed. Statement 2"),
            "{error}"
        );
        assert_eq!(
            count(dir.path(), &id),
            json!([[3]]),
            "the delete was rolled back"
        );
    }

    #[test]
    fn execute_reads_but_refuses_every_change_while_changes_are_off() {
        let (dir, id) = store_with_shop();
        let store = Store::open_shared(dir.path()).unwrap();
        store.set_mcp_changes_allowed(false).unwrap();

        let read = execute(dir.path(), &id, "SELECT name FROM customer WHERE id = 1").unwrap();
        assert_eq!(read["statements"][0]["rows"], json!([["Asha"]]));

        for (sql, does) in [
            (
                "UPDATE customer SET city = 'Agra'",
                "change rows in customer",
            ),
            (
                "WITH gone AS (SELECT 1) DELETE FROM customer",
                "delete rows from customer",
            ),
            ("CREATE INDEX by_city ON customer (city)", "create by_city"),
            (
                "ALTER TABLE customer ADD COLUMN email TEXT",
                "alter customer",
            ),
            ("DROP TABLE customer", "drop customer"),
            ("PRAGMA user_version = 2", "set PRAGMA user_version"),
        ] {
            let error = execute(dir.path(), &id, sql).unwrap_err().to_string();
            assert!(error.contains(does), "{sql}: {error}");
            assert!(error.contains(CHANGES_OFF_MESSAGE), "{sql}: {error}");
        }
        assert_eq!(count(dir.path(), &id), json!([[3]]));
    }

    #[test]
    fn execute_sees_what_triggers_would_do() {
        let (dir, id) = store_with_shop();
        execute(
            dir.path(),
            &id,
            "CREATE TABLE log (name TEXT);
             CREATE TRIGGER keep AFTER INSERT ON customer BEGIN INSERT INTO log VALUES (NEW.name); END;",
        )
        .unwrap();
        let result = execute(
            dir.path(),
            &id,
            "INSERT INTO customer (name) VALUES ('Kiran')",
        )
        .unwrap();
        let does = &result["statements"][0]["does"];
        assert!(
            does.as_array()
                .unwrap()
                .contains(&json!({ "kind": "insert", "on": "log" })),
            "{does}"
        );
    }

    #[test]
    fn execute_never_attaches_vacuums_into_or_takes_over_the_transaction() {
        let (dir, id) = store_with_shop();
        let copy = dir.path().join("copy.db");
        for sql in [
            "ATTACH 'other.db' AS other".to_owned(),
            format!("VACUUM INTO '{}'", copy.display()),
            "COMMIT".to_owned(),
            "PRAGMA writable_schema = ON".to_owned(),
            "DELETE FROM customer; BEGIN".to_owned(),
        ] {
            assert!(execute(dir.path(), &id, &sql).is_err(), "{sql}");
        }
        assert!(!copy.exists(), "VACUUM INTO wrote a file");
        assert_eq!(count(dir.path(), &id), json!([[3]]));
    }

    #[test]
    fn a_saved_write_is_reported_as_saved_even_if_the_bookkeeping_after_it_fails() {
        let (dir, _) = store_with_shop();
        // The app's list can't be updated (here: read-only; in real use: locked by a long write).
        let catalog = dir.path().join("catalog.sqlite3");
        let original = std::fs::metadata(&catalog).unwrap().permissions();
        let mut readonly = original.clone();
        readonly.set_readonly(true);
        std::fs::set_permissions(&catalog, readonly).unwrap();

        let result = execute(
            dir.path(),
            "Shop",
            "INSERT INTO customer (name) VALUES ('Kiran')",
        );

        std::fs::set_permissions(&catalog, original).unwrap();
        // Reported as failed, an assistant would retry and add the row twice.
        assert_eq!(result.unwrap()["statements"][0]["changes"], 1);
        assert_eq!(count(dir.path(), "Shop"), json!([[4]]));
    }

    #[test]
    fn every_tool_is_refused_while_access_is_off() {
        let (dir, id) = store_with_shop();
        Store::open_shared(dir.path())
            .unwrap()
            .set_mcp_enabled(false)
            .unwrap();
        let off = |r: Result<Value>| assert_eq!(r.unwrap_err().to_string(), MCP_OFF_MESSAGE);
        off(app::app_info(dir.path(), true));
        off(app::get_schema(dir.path(), &id));
        off(query(dir.path(), &id, "SELECT 1", &[], None));
        off(execute(dir.path(), &id, "DELETE FROM customer"));

        Store::open_shared(dir.path())
            .unwrap()
            .set_mcp_enabled(true)
            .unwrap();
        assert_eq!(
            count(dir.path(), &id),
            json!([[3]]),
            "nothing was deleted while off"
        );
    }

    #[test]
    fn records_each_call_for_the_app_even_when_refused() {
        let (dir, id) = store_with_shop();
        let args = |v: Value| v.as_object().unwrap().clone();
        record_call(
            dir.path(),
            "query",
            &args(json!({ "database": "shop", "sql": "SELECT 1", "max_rows": 5 })),
            true,
            None,
        )
        .unwrap();
        record_call(
            dir.path(),
            "app_info",
            &args(json!({})),
            false,
            Some(MCP_OFF_MESSAGE.into()),
        )
        .unwrap();

        let store = Store::open_shared(dir.path()).unwrap();
        let history = store.mcp_activity(10).unwrap();
        assert_eq!(history[0].tool, "app_info");
        assert!(!history[0].ok);
        assert_eq!(history[0].message.as_deref(), Some(MCP_OFF_MESSAGE));
        assert_eq!(history[0].details, None);
        let query = &history[1];
        assert_eq!(query.database_id.as_deref(), Some(id.as_str()));
        assert_eq!(
            query.database_name.as_deref(),
            Some("Shop"),
            "named as the app shows it"
        );
        assert_eq!(query.sql.as_deref(), Some("SELECT 1"));
        assert_eq!(query.details.as_deref(), Some(r#"{"max_rows":5}"#));

        record_call(
            dir.path(),
            "get_schema",
            &args(json!({ "database": "Missing" })),
            false,
            None,
        )
        .unwrap();
        let missing = store.mcp_activity(1).unwrap().remove(0);
        assert_eq!(missing.database_id, None);
        assert_eq!(missing.database_name.as_deref(), Some("Missing"));
    }

    #[test]
    fn unknown_databases_are_reported_by_name() {
        let (dir, _) = store_with_shop();
        let error = query(dir.path(), "Missing", "SELECT 1", &[], None)
            .unwrap_err()
            .to_string();
        assert_eq!(error, "No database is called \"Missing\"");
    }
}
