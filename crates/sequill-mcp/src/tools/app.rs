//! The app around the databases: what the window shows, creating, renaming and deleting
//! databases, the schema designer's designs, and asking the open app to show something.

use super::{open_db, open_design, open_session, open_store, open_store_for_changes, to_json};
use schemars::JsonSchema;
use sequill_core::design::Draft;
use sequill_core::filter::{Filter, FilterMatch};
use sequill_core::rows::{Sort, table_columns};
use sequill_core::schema::{RelationInfo, SchemaObject};
use sequill_core::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};

/// How long `show_in_app` waits for the app to pick a request up (it checks every second).
pub const SHOW_WAIT: Duration = Duration::from_secs(4);
const NOT_OPEN: &str =
    "Sequill isn't open, so nothing was shown. Ask the user to open Sequill, then try again.";

/// The app's version, whether its window is open (`in_app`: this server runs inside it),
/// the page and database it shows, the MCP switches, and every database and design.
pub fn app_info(dir: &Path, in_app: bool) -> Result<Value> {
    let store = open_store(dir)?;
    let mut databases = Vec::new();
    let mut designs = Vec::new();
    for d in store.list()? {
        // Designs of other databases: only get_schema and set_design work on them.
        if let Some(dialect) = d.dialect {
            designs.push(json!({ "id": d.id, "name": d.name, "dialect": dialect, "updatedAt": d.updated_at }));
            continue;
        }
        let mut entry = json!({ "id": d.id, "name": d.name, "sizeBytes": d.size_bytes, "updatedAt": d.updated_at });
        // A file the user opened from their computer: changes are made to that file.
        if let Some(path) = d.path {
            entry["file"] = json!(path);
        }
        databases.push(entry);
    }
    // Saved by the window as {"page", "databaseId"}; stale once the app has closed.
    let shown: Value = match store.ui_state()? {
        Some(state) if in_app => serde_json::from_str(&state).unwrap_or(Value::Null),
        _ => Value::Null,
    };
    let current = shown["databaseId"]
        .as_str()
        .and_then(|id| store.resolve_any(id).ok())
        .map(|d| json!({ "id": d.id, "name": d.name }));
    Ok(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "appOpen": in_app,
        "page": shown["page"],
        "database": current,
        "changesAllowed": store.mcp_changes_allowed()?,
        "databases": databases,
        "designs": designs,
    }))
}

/// A new, empty SQLite database, or with `dialect` (postgresql, mysql…) a design for one.
pub fn create_database(dir: &Path, name: &str, dialect: Option<&str>) -> Result<Value> {
    let mut store = open_store_for_changes(dir)?;
    let info = match dialect.map(str::trim) {
        Some(d) if !d.is_empty() && !d.eq_ignore_ascii_case("sqlite") => {
            store.create_design(name, d)?
        }
        _ => store.create(name, None)?,
    };
    Ok(json!({ "database": to_json(info) }))
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

/// Told to an assistant whose design save lost the race to another edit.
pub const DESIGN_CHANGED_MESSAGE: &str = "The design changed since you read it (the user or another assistant edited it), so nothing was saved. Call get_schema again and apply your changes to that version.";

/// What the schema designer shows: tables, views, indexes and triggers with their SQL, for
/// a design of another database also its type and "objects", and the unsaved design (the
/// changes planned in the designer, with its version for set_design).
pub fn get_schema(dir: &Path, database: &str) -> Result<Value> {
    let db = open_design(dir, database)?;
    let schema = db.session.schema()?;
    let design = db.store.design(&db.info.id)?;
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
    let mut result = json!({
        "database": db.database(),
        "tables": relations(&schema.tables),
        "views": relations(&schema.views),
        "indexes": objects(&schema.indexes),
        "triggers": objects(&schema.triggers),
        "design": { "version": design.version, "draft": design.draft },
    });
    // A design of another database: its type, and the objects SQLite can't hold, which
    // set_design's "objects" changes by "kind:name".
    if let Some(dialect) = schema.dialect {
        result["dialect"] = json!(dialect);
        result["objects"] = to_json(schema.objects);
    }
    Ok(result)
}

/// Replaces a database's unsaved design if it is still at `version`. Existing tables and
/// columns must be named as they are in the database; the user saves the design into it.
pub fn set_design(dir: &Path, database: &str, version: i64, draft: &Draft) -> Result<Value> {
    // Changes are checked before the database is looked up, as for every other change.
    let store = open_store_for_changes(dir)?;
    let info = store.resolve_any(database)?;
    let db = open_session(store, info, false)?;
    let tables: BTreeMap<String, Vec<String>> = db
        .session
        .schema()?
        .tables
        .into_iter()
        .map(|t| (t.name, t.columns.into_iter().map(|c| c.name).collect()))
        .collect();
    let unknown = draft.unknown_names(&tables);
    if !unknown.is_empty() {
        return Err(Error::msg(format!(
            "The database has no {}. Name existing tables and columns as they are now (see get_schema); new tables go in \"tables\".",
            unknown.join(", ")
        )));
    }
    let bad = draft.bad_colors();
    if !bad.is_empty() {
        return Err(Error::msg(format!(
            "Not a table color: {}. Use {} or \"#rrggbb\".",
            bad.join(", "),
            sequill_core::design::TABLE_COLORS.join(", ")
        )));
    }
    let draft = serde_json::to_value(draft).expect("drafts serialize");
    match db.store.save_design(&db.info.id, &draft, version)? {
        Some(version) => Ok(json!({ "database": db.database(), "version": version })),
        None => Err(Error::msg(DESIGN_CHANGED_MESSAGE)),
    }
}

/// What to show in the app.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ShowView {
    /// The editor page on the database.
    Editor,
    /// A table or view in the editor, with optional filters, search and sort.
    Table,
    /// A new query tab in the editor with `sql` in it (not run).
    Query,
    /// The schema page (diagram and designer); works for designs of other databases too.
    Schema,
}

/// What `show_in_app` is asked to show.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct ShowArgs {
    /// The database's id, or its exact name, from app_info.
    pub database: String,
    pub view: ShowView,
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

/// The request the app receives (`src/app/mcp-requests.tsx` reads it).
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
pub fn show_in_app(dir: &Path, args: &ShowArgs, wait: Duration) -> Result<Value> {
    let view = args.view;
    let table = args.table.as_deref();
    let sql = args.sql.as_deref();
    let db = if view == ShowView::Schema {
        open_design(dir, &args.database)?
    } else {
        open_db(dir, &args.database)?
    };
    match view {
        ShowView::Table => {
            let table = table.ok_or_else(|| Error::msg("view table needs a table"))?;
            let columns = table_columns(&db.session, table)?;
            let used = args
                .filters
                .iter()
                .map(|f| &f.column)
                .chain(args.sort.iter().map(|s| &s.column));
            if let Some(bad) = used.into_iter().find(|c| !columns.contains(c)) {
                return Err(Error::msg(format!("Unknown column: {bad}")));
            }
        }
        ShowView::Query if sql.is_none_or(|s| s.trim().is_empty()) => {
            return Err(Error::msg("view query needs sql"));
        }
        ShowView::Editor | ShowView::Query | ShowView::Schema => {}
    }
    let request = ShowRequest {
        database_id: &db.info.id,
        view,
        table: (view == ShowView::Table).then_some(table).flatten(),
        filters: if view == ShowView::Table {
            &args.filters
        } else {
            &[]
        },
        matching: args.matching,
        search: args.search.as_deref().unwrap_or(""),
        sort: if view == ShowView::Table {
            &args.sort
        } else {
            &[]
        },
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
    fn edits_the_design_over_the_version_it_read_and_leaves_the_database_alone() {
        let (dir, id) = store_with_shop();
        let read = get_schema(dir.path(), "Shop").unwrap();
        assert_eq!(read["design"]["version"], 0);

        let draft: Draft =
            serde_json::from_value(json!({ "renamedTables": { "customer": "client" } })).unwrap();
        let saved = set_design(dir.path(), "Shop", 0, &draft).unwrap();
        assert_eq!(saved["version"], 1);
        let read = get_schema(dir.path(), &id).unwrap();
        assert_eq!(
            read["design"]["draft"]["renamedTables"]["customer"],
            "client"
        );

        // Based on an old read: refused, so the newer design isn't lost.
        let error = set_design(dir.path(), "Shop", 0, &Draft::default()).unwrap_err();
        assert_eq!(error.to_string(), DESIGN_CHANGED_MESSAGE);

        let ghost: Draft = serde_json::from_value(json!({ "droppedTables": ["ghost"] })).unwrap();
        let error = set_design(dir.path(), "Shop", 1, &ghost).unwrap_err();
        assert!(error.to_string().contains("no ghost"), "{error}");

        let store = Store::open_shared(dir.path()).unwrap();
        store.set_mcp_changes_allowed(false).unwrap();
        assert!(set_design(dir.path(), "Shop", 1, &draft).is_err());
        // The database itself never changed.
        let schema = get_schema(dir.path(), "Shop").unwrap();
        assert_eq!(schema["tables"][0]["name"], "customer");
    }

    #[test]
    fn edits_the_design_of_another_database_but_nothing_else_reaches_it() {
        let (dir, _) = store_with_shop();
        Store::open(dir.path())
            .unwrap()
            .import_schema(
                "Pg",
                "postgresql",
                b"CREATE TABLE p (id serial PRIMARY KEY);\nCREATE TYPE mood AS ENUM ('ok', 'sad');",
            )
            .unwrap();

        let schema = get_schema(dir.path(), "pg").unwrap();
        assert_eq!(schema["dialect"], "postgresql");
        assert_eq!(schema["tables"][0]["name"], "p");
        assert_eq!(schema["objects"][0]["kind"], "enum");

        let draft: Draft = serde_json::from_value(json!({
            "renamedTables": { "p": "person" },
            "objects": { "enum:mood": null },
        }))
        .unwrap();
        assert_eq!(
            set_design(dir.path(), "Pg", 0, &draft).unwrap()["version"],
            1
        );
        assert_eq!(
            get_schema(dir.path(), "Pg").unwrap()["design"]["draft"]["renamedTables"]["p"],
            "person"
        );
        let ghost: Draft = serde_json::from_value(json!({ "droppedTables": ["ghost"] })).unwrap();
        assert!(set_design(dir.path(), "Pg", 1, &ghost).is_err());

        // Rows, SQL and the database itself stay out of reach.
        assert!(crate::tools::query(dir.path(), "Pg", "SELECT 1", &[], None).is_err());
        assert!(rename_database(dir.path(), "Pg", "Other").is_err());
        assert!(delete_database(dir.path(), "Pg").is_err());
    }

    #[test]
    fn creates_renames_and_deletes_databases() {
        let (dir, _) = store_with_shop();
        let empty = create_database(dir.path(), "  ", None).unwrap_err();
        assert_eq!(empty.to_string(), "The name is empty");
        let created = create_database(dir.path(), " Notes ", None).unwrap();
        assert_eq!(created["database"]["name"], "Notes");
        let id = created["database"]["id"].as_str().unwrap().to_owned();
        let renamed = rename_database(dir.path(), "notes", "Journal").unwrap();
        assert_eq!(renamed["database"]["name"], "Journal");
        delete_database(dir.path(), &id).unwrap();
        assert!(delete_database(dir.path(), "Journal").is_err());
    }

    #[test]
    fn creates_a_design_of_the_dialect_asked_for() {
        let (dir, _) = store_with_shop();
        create_database(dir.path(), "Lite", Some("SQLite")).unwrap();
        create_database(dir.path(), "Pg", Some("PostgreSQL")).unwrap();
        let info = app_info(dir.path(), false).unwrap();
        assert_eq!(info["designs"][0]["name"], "Pg");
        assert_eq!(info["designs"][0]["dialect"], "postgresql");
        assert_eq!(
            get_schema(dir.path(), "Pg").unwrap()["dialect"],
            "postgresql"
        );
        let lite = info["databases"].as_array().unwrap();
        assert!(
            lite.iter().any(|d| d["name"] == "Lite"),
            "sqlite is a real database"
        );

        let error = create_database(dir.path(), "X", Some("oracle")).unwrap_err();
        assert!(error.to_string().contains("oracle"), "{error}");
    }

    #[test]
    fn sets_table_colors_by_name_and_refuses_bad_ones() {
        let (dir, _) = store_with_shop();
        let colored: Draft =
            serde_json::from_value(json!({ "colors": { "customer": "mint" } })).unwrap();
        set_design(dir.path(), "Shop", 0, &colored).unwrap();
        let read = get_schema(dir.path(), "Shop").unwrap();
        assert_eq!(read["design"]["draft"]["colors"]["customer"], "mint");

        let bad: Draft =
            serde_json::from_value(json!({ "colors": { "customer": "red" } })).unwrap();
        let error = set_design(dir.path(), "Shop", 1, &bad).unwrap_err();
        assert!(
            error.to_string().contains("Not a table color: red"),
            "{error}"
        );
        let ghost: Draft = serde_json::from_value(json!({ "colors": { "ghost": "sky" } })).unwrap();
        assert!(set_design(dir.path(), "Shop", 1, &ghost).is_err());
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
    fn app_info_tells_what_the_open_window_shows() {
        let (dir, id) = store_with_shop();
        Store::open(dir.path())
            .unwrap()
            .import_schema(
                "Pg",
                "postgresql",
                b"CREATE TABLE p (id serial PRIMARY KEY);",
            )
            .unwrap();
        let store = Store::open_shared(dir.path()).unwrap();
        store
            .set_ui_state(&json!({ "page": "schema", "databaseId": id }).to_string())
            .unwrap();

        let info = app_info(dir.path(), true).unwrap();
        assert_eq!(info["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(info["appOpen"], true);
        assert_eq!(info["page"], "schema");
        assert_eq!(info["database"]["name"], "Shop");
        assert_eq!(info["changesAllowed"], true);
        assert_eq!(
            info["databases"].as_array().unwrap().len(),
            1,
            "designs are listed apart"
        );
        assert_eq!(info["designs"][0]["dialect"], "postgresql");

        // Run by the relay while the app is closed: what the window last saved is stale.
        let closed = app_info(dir.path(), false).unwrap();
        assert_eq!(closed["appOpen"], false);
        assert_eq!(closed["page"], Value::Null);
        assert_eq!(closed["database"], Value::Null);
    }

    /// Showing `view` of `database`, with nothing else set.
    fn show_args(database: &str, view: ShowView) -> ShowArgs {
        ShowArgs {
            database: database.into(),
            view,
            table: None,
            filters: Vec::new(),
            matching: FilterMatch::All,
            search: None,
            sort: Vec::new(),
            sql: None,
        }
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
            &show_args(&id, ShowView::Schema),
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
        let args = ShowArgs {
            table: Some("customer".into()),
            filters: delhi(),
            sort: vec![Sort {
                column: "name".into(),
                desc: true,
            }],
            ..show_args(&id, ShowView::Table)
        };
        let shown = show_in_app(dir.path(), &args, SHOW_WAIT).unwrap();
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
        let show = |view, table: Option<&str>, filters: &[Filter], sql: Option<&str>| {
            let args = ShowArgs {
                table: table.map(str::to_owned),
                filters: filters.to_vec(),
                sql: sql.map(str::to_owned),
                ..show_args(&id, view)
            };
            show_in_app(dir.path(), &args, Duration::ZERO)
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
        assert_eq!(
            show(ShowView::Editor, None, &[], None),
            NOT_OPEN,
            "checked, then asked"
        );
        Store::open(dir.path())
            .unwrap()
            .import_schema("Pg", "postgresql", b"CREATE TABLE p (id int);")
            .unwrap();
        let in_page = |view| {
            show_in_app(dir.path(), &show_args("Pg", view), Duration::ZERO)
                .unwrap_err()
                .to_string()
        };
        assert_eq!(
            in_page(ShowView::Schema),
            NOT_OPEN,
            "designs open on the schema page"
        );
        assert!(
            in_page(ShowView::Editor).contains("No database"),
            "but not in the editor"
        );
    }
}
