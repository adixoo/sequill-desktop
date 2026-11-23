//! The app around the databases: creating, renaming and deleting databases, saved queries,
//! and asking the open app to show a table, a query or the schema.

use super::{open_db, open_store, open_store_for_changes, to_json};
use schemars::JsonSchema;
use sequill_core::filter::{Filter, FilterMatch, build_where};
use sequill_core::rows::{Sort, table_columns};
use sequill_core::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};

/// How long `show_in_app` waits for the app to pick a request up (it checks every second).
pub const SHOW_WAIT: Duration = Duration::from_secs(4);
const NOT_OPEN: &str =
    "Sequill isn't open, so nothing was shown. Ask the user to open Sequill, then try again.";

pub fn create_database(dir: &Path, name: &str) -> Result<Value> {
    let mut store = open_store_for_changes(dir)?;
    let name = name.trim();
    if name.is_empty() {
        return Err(Error::msg("The name is empty"));
    }
    Ok(json!({ "database": to_json(store.create(name, None)?) }))
}

pub fn rename_database(dir: &Path, database: &str, name: &str) -> Result<Value> {
    let mut store = open_store_for_changes(dir)?;
    let info = store.resolve(database)?;
    Ok(json!({ "database": to_json(store.rename(&info.id, name)?) }))
}

pub fn delete_database(dir: &Path, database: &str) -> Result<Value> {
    let mut store = open_store_for_changes(dir)?;
    let info = store.resolve(database)?;
    store.delete(&info.id)?;
    // A file the user opened from their computer is only taken off the list; it still exists.
    match info.path {
        Some(path) => Ok(
            json!({ "removedFromList": { "id": info.id, "name": info.name, "fileKeptAt": path } }),
        ),
        None => Ok(json!({ "deleted": { "id": info.id, "name": info.name } })),
    }
}

pub fn list_saved_queries(dir: &Path) -> Result<Value> {
    Ok(json!({ "queries": to_json(open_store(dir)?.saved_queries()?) }))
}

pub fn save_query(dir: &Path, name: &str, sql: &str, id: Option<&str>) -> Result<Value> {
    Ok(json!({ "query": to_json(open_store_for_changes(dir)?.save_query(name, sql, id)?) }))
}

pub fn delete_saved_query(dir: &Path, id: &str) -> Result<Value> {
    if !open_store_for_changes(dir)?.delete_saved_query(id)? {
        return Err(Error::msg(format!("No saved query has the id {id}")));
    }
    Ok(json!({ "deleted": id }))
}

/// What to show in the app.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ShowView {
    /// A table or view in the editor, with optional filters, search and sort.
    Table,
    /// A new query tab in the editor with `sql` in it (not run).
    Query,
    /// The schema diagram.
    Schema,
}

/// The request the app receives (`src/components/organisms/mcp-requests.tsx` reads it).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShowRequest<'a> {
    database_id: &'a str,
    view: ShowView,
    #[serde(skip_serializing_if = "Option::is_none")]
    table: Option<&'a str>,
    filters: &'a [Filter],
    #[serde(rename = "match")]
    matching: FilterMatch,
    search: &'a str,
    sort: &'a [Sort],
    #[serde(skip_serializing_if = "Option::is_none")]
    sql: Option<&'a str>,
}

/// Asks the open app to show something, after checking it exists. Waits up to `wait` for
/// the app to take the request, so the assistant learns whether anything was shown.
#[allow(clippy::too_many_arguments)]
pub fn show_in_app(
    dir: &Path,
    database: &str,
    view: ShowView,
    table: Option<&str>,
    filters: &[Filter],
    matching: FilterMatch,
    search: Option<&str>,
    sort: &[Sort],
    sql: Option<&str>,
    wait: Duration,
) -> Result<Value> {
    let db = open_db(dir, database, false)?;
    match view {
        ShowView::Table => {
            let table = table.ok_or_else(|| Error::msg("view table needs a table"))?;
            let columns = table_columns(&db.session, table)?;
            build_where(&columns, filters, matching, search.unwrap_or(""))?;
            if let Some(bad) = sort.iter().find(|s| !columns.contains(&s.column)) {
                return Err(Error::msg(format!("Unknown column: {}", bad.column)));
            }
        }
        ShowView::Query if sql.is_none_or(|s| s.trim().is_empty()) => {
            return Err(Error::msg("view query needs sql"));
        }
        ShowView::Query | ShowView::Schema => {}
    }
    let request = ShowRequest {
        database_id: &db.info.id,
        view,
        table: (view == ShowView::Table).then_some(table).flatten(),
        filters: if view == ShowView::Table {
            filters
        } else {
            &[]
        },
        matching,
        search: search.unwrap_or(""),
        sort: if view == ShowView::Table { sort } else { &[] },
        sql: (view == ShowView::Query).then_some(sql).flatten(),
    };
    let payload = serde_json::to_string(&request).map_err(|e| Error::msg(e.to_string()))?;
    let id = db.store.push_ui_request(&payload)?;

    let started = Instant::now();
    while db.store.ui_request_pending(id)? {
        if started.elapsed() >= wait {
            db.store.cancel_ui_request(id)?;
            return Err(Error::msg(NOT_OPEN));
        }
        thread::sleep(Duration::from_millis(100));
    }
    Ok(json!({ "shown": true, "database": db.database(), "view": view }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::test_support::store_with_shop;
    use sequill_core::Store;
    use sequill_core::filter::FilterOp;

    #[test]
    fn creates_renames_and_deletes_databases() {
        let (dir, _) = store_with_shop();
        let created = create_database(dir.path(), "Notes").unwrap();
        let id = created["database"]["id"].as_str().unwrap().to_owned();
        let renamed = rename_database(dir.path(), "notes", "Journal").unwrap();
        assert_eq!(renamed["database"]["name"], "Journal");
        delete_database(dir.path(), &id).unwrap();
        assert!(delete_database(dir.path(), "Journal").is_err());
    }

    #[test]
    fn deleting_a_file_the_user_opened_only_removes_it_from_the_list() {
        let (dir, _) = store_with_shop();
        let outside = tempfile::tempdir().unwrap();
        let file = outside.path().join("mine.db");
        sequill_core::Session::open(&file)
            .unwrap()
            .connection()
            .execute_batch("CREATE TABLE t(a)")
            .unwrap();
        Store::open(dir.path()).unwrap().link(&file).unwrap();
        let result = delete_database(dir.path(), "mine").unwrap();
        assert!(result["removedFromList"]["fileKeptAt"].is_string());
        assert!(file.exists());
        assert!(delete_database(dir.path(), "mine").is_err());
    }

    #[test]
    fn saves_lists_and_deletes_queries() {
        let (dir, _) = store_with_shop();
        let saved = save_query(
            dir.path(),
            "Delhi customers",
            "SELECT * FROM customer",
            None,
        )
        .unwrap();
        let id = saved["query"]["id"].as_str().unwrap().to_owned();
        save_query(
            dir.path(),
            "Delhi customers",
            "SELECT name FROM customer",
            None,
        )
        .unwrap();
        let list = list_saved_queries(dir.path()).unwrap();
        assert_eq!(list["queries"].as_array().unwrap().len(), 1);
        assert_eq!(list["queries"][0]["sql"], "SELECT name FROM customer");
        delete_saved_query(dir.path(), &id).unwrap();
        assert!(delete_saved_query(dir.path(), &id).is_err());
    }

    fn delhi() -> Vec<Filter> {
        vec![Filter {
            column: "city".into(),
            op: FilterOp::Eq,
            value: Some(json!("Delhi")),
            value2: None,
        }]
    }

    #[test]
    fn show_reports_when_the_app_is_not_open() {
        let (dir, id) = store_with_shop();
        let error = show_in_app(
            dir.path(),
            &id,
            ShowView::Schema,
            None,
            &[],
            FilterMatch::All,
            None,
            &[],
            None,
            Duration::from_millis(300),
        );
        assert_eq!(error.unwrap_err().to_string(), NOT_OPEN);
        assert!(
            Store::open_shared(dir.path())
                .unwrap()
                .take_ui_requests()
                .unwrap()
                .is_empty(),
            "withdrawn"
        );
    }

    #[test]
    fn show_hands_a_checked_request_to_the_app() {
        let (dir, id) = store_with_shop();
        let app_dir = dir.path().to_owned();
        let app = thread::spawn(move || {
            thread::sleep(Duration::from_millis(200));
            Store::open_shared(&app_dir)
                .unwrap()
                .take_ui_requests()
                .unwrap()
        });
        let shown = show_in_app(
            dir.path(),
            &id,
            ShowView::Table,
            Some("customer"),
            &delhi(),
            FilterMatch::All,
            None,
            &[Sort {
                column: "name".into(),
                desc: true,
            }],
            None,
            SHOW_WAIT,
        )
        .unwrap();
        assert_eq!(shown["shown"], true);
        let request: Value = serde_json::from_str(&app.join().unwrap()[0]).unwrap();
        assert_eq!(request["databaseId"], id.as_str());
        assert_eq!(request["table"], "customer");
        assert_eq!(request["filters"][0]["op"], "eq");
        assert_eq!(request["match"], "all");
        assert_eq!(request["sort"][0]["desc"], true);
    }

    #[test]
    fn show_checks_tables_columns_and_sql_first() {
        let (dir, id) = store_with_shop();
        let show = |view, table, filters: &[Filter], sql| {
            show_in_app(
                dir.path(),
                &id,
                view,
                table,
                filters,
                FilterMatch::All,
                None,
                &[],
                sql,
                Duration::ZERO,
            )
            .unwrap_err()
            .to_string()
        };
        assert!(show(ShowView::Table, Some("nope"), &[], None).contains("No table or view"));
        let bad = [Filter {
            column: "x".into(),
            op: FilterOp::Null,
            value: None,
            value2: None,
        }];
        assert_eq!(
            show(ShowView::Table, Some("customer"), &bad, None),
            "Unknown column: x"
        );
        assert_eq!(
            show(ShowView::Query, None, &[], Some(" ")),
            "view query needs sql"
        );
    }
}
