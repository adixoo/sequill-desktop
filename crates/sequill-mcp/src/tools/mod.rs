//! What each MCP tool does, as plain functions over the data directory, so they can be
//! tested without a client. `server.rs` exposes them over MCP.
//!
//! - this file: shared helpers, reading the schema, SQL queries and scripts
//! - `data.rs`: finding, adding, changing and deleting rows
//! - `schema.rs`: tables, columns, indexes, triggers and views
//! - `app.rs`: databases, saved queries, and showing things in the app

pub mod app;
pub mod data;
pub mod schema;

use rusqlite::limits::Limit;
use sequill_core::schema::{RelationInfo, SchemaObject};
use sequill_core::{CellValue, DbInfo, Error, Result, Session, Store};
use serde_json::{Value, json};
use std::path::Path;

/// Rows a query returns unless the caller asks for fewer or more.
pub const DEFAULT_MAX_ROWS: usize = 200;
/// The most rows a single call returns, to keep answers within a model's context.
pub const MAX_ROWS_LIMIT: usize = 5_000;

/// Shown to the assistant while the switch in the app is off.
pub const MCP_OFF_MESSAGE: &str = "MCP access is turned off in Sequill. Ask the user to turn it on with the MCP button in the app.";

/// Shown to the assistant when it tries to change something while the user allows only reading.
pub const CHANGES_OFF_MESSAGE: &str = "Changes are turned off in Sequill, so you can only read and show things. Ask the user to switch on \"Allow changes\" in Sequill (MCP button in the top bar), then try again.";

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
    /// notices the write itself and refreshes what's on screen.
    fn record_write(&self) -> Result<()> {
        self.store
            .record_write(&self.info.id, self.session.size_bytes()?)
    }

    fn database(&self) -> Value {
        json!({ "id": self.info.id, "name": self.info.name })
    }
}

/// Opens a database by id or name. Read-only unless `writable` (which needs "Allow changes");
/// SQLite itself then refuses writes. ATTACH is turned off so a call can't reach other files.
fn open_db(dir: &Path, database: &str, writable: bool) -> Result<Opened> {
    let store = if writable {
        open_store_for_changes(dir)?
    } else {
        open_store(dir)?
    };
    let info = store.resolve(database)?;
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

fn to_json<T: serde::Serialize>(value: T) -> Value {
    serde_json::to_value(value).expect("tool results serialize")
}

pub fn list_databases(dir: &Path) -> Result<Value> {
    let store = open_store(dir)?;
    let databases: Vec<Value> = store
        .list()?
        .into_iter()
        .map(|d| {
            let mut entry = json!({ "id": d.id, "name": d.name, "sizeBytes": d.size_bytes, "updatedAt": d.updated_at });
            // A file the user opened from their computer: changes are made to that file.
            if let Some(path) = d.path {
                entry["file"] = json!(path);
            }
            entry
        })
        .collect();
    Ok(json!({ "databases": databases }))
}

pub fn get_schema(dir: &Path, database: &str) -> Result<Value> {
    let db = open_db(dir, database, false)?;
    let schema = db.session.schema()?;
    let relations = |list: &[RelationInfo]| -> Vec<Value> {
        list.iter()
            .map(|r| json!({ "name": r.name, "kind": r.kind, "sql": r.sql }))
            .collect()
    };
    let objects = |list: &[SchemaObject]| -> Vec<Value> {
        list.iter()
            .map(|o| json!({ "name": o.name, "table": o.table, "sql": o.sql }))
            .collect()
    };
    Ok(json!({
        "database": db.database(),
        "tables": relations(&schema.tables),
        "views": relations(&schema.views),
        "indexes": objects(&schema.indexes),
        "triggers": objects(&schema.triggers),
    }))
}

/// One table or view in detail: columns, keys, indexes, triggers and its row count.
pub fn describe_table(dir: &Path, database: &str, table: &str) -> Result<Value> {
    let db = open_db(dir, database, false)?;
    let schema = db.session.schema()?;
    let relation = schema
        .tables
        .iter()
        .chain(&schema.views)
        .find(|r| r.name == table)
        .ok_or_else(|| Error::msg(format!("No table or view is called \"{table}\"")))?;
    let triggers: Vec<&SchemaObject> = schema
        .triggers
        .iter()
        .filter(|t| t.table == table)
        .collect();
    let rows = db.session.count(
        &format!(
            "SELECT count(*) FROM {}",
            sequill_core::dump::quote_ident(table)
        ),
        &[],
    )?;
    Ok(json!({
        "database": db.database(),
        "table": to_json(relation),
        "triggers": to_json(triggers),
        "rowCount": rows,
    }))
}

/// Runs one read-only statement; SQLite itself refuses writes on this connection.
pub fn query(
    dir: &Path,
    database: &str,
    sql: &str,
    params: &[CellValue],
    max_rows: Option<usize>,
) -> Result<Value> {
    let db = open_db(dir, database, false)?;
    let limit = max_rows.unwrap_or(DEFAULT_MAX_ROWS).min(MAX_ROWS_LIMIT);
    Ok(to_json(db.session.query(sql, params, Some(limit))?))
}

/// EXPLAIN QUERY PLAN for each statement of a script; nothing runs.
pub fn explain_query(dir: &Path, database: &str, sql: &str) -> Result<Value> {
    let db = open_db(dir, database, false)?;
    Ok(json!({ "plans": db.session.explain_script(sql) }))
}

/// Runs a script of one or more statements that may change data or schema.
pub fn execute(dir: &Path, database: &str, sql: &str) -> Result<Value> {
    let db = open_db(dir, database, true)?;
    let results = db.session.exec_script(sql, DEFAULT_MAX_ROWS);
    db.record_write()?;
    let failed = results.iter().any(|r| r.error.is_some());
    Ok(json!({ "ok": !failed, "statements": results }))
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

    #[test]
    fn lists_databases_and_reads_schema_by_name() {
        let (dir, id) = store_with_shop();
        let list = list_databases(dir.path()).unwrap();
        assert_eq!(list["databases"][0]["id"], id.as_str());

        let schema = get_schema(dir.path(), "shop").unwrap();
        assert_eq!(schema["tables"][0]["name"], "customer");
        assert!(
            schema["tables"][0]["sql"]
                .as_str()
                .unwrap()
                .starts_with("CREATE TABLE customer")
        );
    }

    #[test]
    fn describes_one_table() {
        let (dir, id) = store_with_shop();
        let d = describe_table(dir.path(), &id, "customer").unwrap();
        assert_eq!(d["rowCount"], 3);
        assert_eq!(d["table"]["columns"][1]["name"], "name");
        assert_eq!(d["table"]["columns"][1]["notNull"], true);
        assert!(describe_table(dir.path(), &id, "nope").is_err());
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
    }

    #[test]
    fn query_cannot_write_attach_or_run_several_statements() {
        let (dir, id) = store_with_shop();
        assert!(query(dir.path(), &id, "DELETE FROM customer", &[], None).is_err());
        assert!(query(dir.path(), &id, "SELECT 1; DELETE FROM customer", &[], None).is_err());
        assert!(query(dir.path(), &id, "ATTACH 'other.db' AS other", &[], None).is_err());
        let count = query(dir.path(), &id, "SELECT count(*) FROM customer", &[], None).unwrap();
        assert_eq!(count["rows"], json!([[3]]));
    }

    #[test]
    fn explains_without_running() {
        let (dir, id) = store_with_shop();
        let plan = explain_query(dir.path(), &id, "DELETE FROM customer").unwrap();
        assert!(plan["plans"][0]["columns"].to_string().contains("detail"));
        let count = query(dir.path(), &id, "SELECT count(*) FROM customer", &[], None).unwrap();
        assert_eq!(count["rows"], json!([[3]]));
    }

    #[test]
    fn execute_writes_and_reports_each_statement() {
        let (dir, id) = store_with_shop();
        let result = execute(
            dir.path(),
            &id,
            "INSERT INTO customer (name) VALUES ('Kiran'); SELECT count(*) AS n FROM customer;",
        )
        .unwrap();
        assert_eq!(result["ok"], true);
        assert_eq!(result["statements"][0]["changes"], 1);
        assert_eq!(result["statements"][1]["rows"], json!([[4]]));

        let failed = execute(dir.path(), &id, "INSERT INTO nope VALUES (1); SELECT 1;").unwrap();
        assert_eq!(failed["ok"], false);
        assert_eq!(failed["statements"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn every_tool_is_refused_while_access_is_off() {
        let (dir, id) = store_with_shop();
        Store::open_shared(dir.path())
            .unwrap()
            .set_mcp_enabled(false)
            .unwrap();
        let off = |r: Result<Value>| assert_eq!(r.unwrap_err().to_string(), MCP_OFF_MESSAGE);
        off(list_databases(dir.path()));
        off(get_schema(dir.path(), &id));
        off(query(dir.path(), &id, "SELECT 1", &[], None));
        off(execute(dir.path(), &id, "DELETE FROM customer"));
        off(app::list_saved_queries(dir.path()));
        off(data::delete_rows(
            dir.path(),
            &id,
            "customer",
            &[],
            Default::default(),
            true,
        ));

        Store::open_shared(dir.path())
            .unwrap()
            .set_mcp_enabled(true)
            .unwrap();
        let count = query(dir.path(), &id, "SELECT count(*) FROM customer", &[], None).unwrap();
        assert_eq!(count["rows"], json!([[3]]), "nothing was deleted while off");
    }

    #[test]
    fn changes_are_refused_until_allowed_but_reading_works() {
        let (dir, id) = store_with_shop();
        let store = Store::open_shared(dir.path()).unwrap();
        store.set_mcp_changes_allowed(false).unwrap();
        let refused =
            |r: Result<Value>| assert_eq!(r.unwrap_err().to_string(), CHANGES_OFF_MESSAGE);
        refused(execute(dir.path(), &id, "DELETE FROM customer"));
        refused(data::delete_rows(
            dir.path(),
            &id,
            "customer",
            &[],
            Default::default(),
            true,
        ));
        refused(app::create_database(dir.path(), "New"));
        refused(app::rename_database(dir.path(), &id, "Renamed"));
        refused(app::delete_database(dir.path(), &id));
        refused(app::save_query(dir.path(), "q", "SELECT 1", None));
        let count = query(dir.path(), &id, "SELECT count(*) FROM customer", &[], None).unwrap();
        assert_eq!(
            count["rows"],
            json!([[3]]),
            "reading still works, nothing changed"
        );

        store.set_mcp_changes_allowed(true).unwrap();
        execute(dir.path(), &id, "DELETE FROM customer WHERE name = 'Ravi'").unwrap();
    }

    #[test]
    fn unknown_databases_are_reported_by_name() {
        let (dir, _) = store_with_shop();
        let error = get_schema(dir.path(), "Missing").unwrap_err().to_string();
        assert_eq!(error, "No database is called \"Missing\"");
    }
}
