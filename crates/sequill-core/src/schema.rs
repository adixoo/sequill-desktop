//! Reads the schema of an open database through PRAGMA table-valued functions.
//! Field names match the web UI's `src/lib/sqlite/types.ts`.

use crate::error::Result;
use rusqlite::types::ValueRef;
use rusqlite::{Connection, Row};
use serde::Serialize;
use std::collections::HashMap;

/// Names that address the rowid, in the order they are tried.
pub const ROWID_CANDIDATES: [&str; 3] = ["rowid", "_rowid_", "oid"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub cid: i64,
    pub name: String,
    /// Declared type as written in the schema, upper-cased; empty when none.
    #[serde(rename = "type")]
    pub type_name: String,
    pub not_null: bool,
    pub default_value: Option<String>,
    /// 1-based position in the primary key, 0 when not part of it.
    pub pk: i64,
    /// 0 normal, 1 hidden (virtual table), 2 generated virtual, 3 generated stored.
    pub hidden: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKey {
    pub id: i64,
    pub seq: i64,
    pub table: String,
    pub from: String,
    pub to: Option<String>,
    pub on_update: String,
    pub on_delete: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexInfo {
    pub name: String,
    pub unique: bool,
    pub origin: String,
    pub partial: bool,
    pub columns: Vec<String>,
    pub sql: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RelationKind {
    Table,
    View,
    Virtual,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationInfo {
    pub name: String,
    pub kind: RelationKind,
    pub sql: Option<String>,
    pub columns: Vec<ColumnInfo>,
    pub foreign_keys: Vec<ForeignKey>,
    pub indexes: Vec<IndexInfo>,
    pub without_rowid: bool,
    pub strict: bool,
    pub rowid_name: Option<String>,
    pub editable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaObject {
    pub name: String,
    pub table: String,
    pub sql: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Schema {
    pub tables: Vec<RelationInfo>,
    pub views: Vec<RelationInfo>,
    pub indexes: Vec<SchemaObject>,
    pub triggers: Vec<SchemaObject>,
    /// The database a schema was imported from ("postgresql", "mysql", "mssql", "duckdb"…);
    /// None for a SQLite database.
    pub dialect: Option<String>,
    /// That database's enums, functions, procedures, triggers, views, sequences and types,
    /// which SQLite can't hold itself; kept as their SQL (`OBJECTS_TABLE`).
    pub objects: Vec<ExtraObject>,
}

/// Where an imported schema keeps its database type and the objects SQLite can't run. Hidden
/// from the editor and the diagram like SQLite's own tables.
pub const OBJECTS_TABLE: &str = "_sequill_objects";

/// One enum, function, procedure, trigger, view, sequence or type of an imported schema.
#[derive(Debug, Clone, PartialEq, Serialize, serde::Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub struct ExtraObject {
    /// "enum", "function", "procedure", "trigger", "view", "sequence" or "type".
    pub kind: String,
    pub name: String,
    /// The table a trigger belongs to.
    pub table: Option<String>,
    /// Its SQL as written; for an enum, its values as a JSON array.
    pub body: String,
}

pub fn is_internal_name(name: &str) -> bool {
    name.to_lowercase().starts_with("sqlite_") || name.eq_ignore_ascii_case(OBJECTS_TABLE)
}

/// A declared type as shown: upper-cased in a SQLite database, unless it holds quoted text
/// (an ENUM's values); in an imported schema, exactly as written there.
fn shown_type(declared: String, as_written: bool) -> String {
    if as_written || declared.contains(['\'', '"']) {
        declared
    } else {
        declared.to_uppercase()
    }
}

/// The imported schema's database type and objects, if it has them.
fn read_objects(conn: &Connection) -> Result<(Option<String>, Vec<ExtraObject>)> {
    let exists: bool = conn.query_row(
        "SELECT count(*) > 0 FROM sqlite_schema WHERE type = 'table' AND name = ?",
        [OBJECTS_TABLE],
        |r| r.get(0),
    )?;
    if !exists {
        return Ok((None, Vec::new()));
    }
    let rows = collect(
        conn,
        &format!("SELECT kind, name, tbl, body FROM \"{OBJECTS_TABLE}\" ORDER BY rowid"),
        None,
        |r| {
            Ok(ExtraObject {
                kind: string(r, 0)?,
                name: string(r, 1)?,
                table: text(r, 2)?,
                body: string(r, 3)?,
            })
        },
    )?;
    let dialect = rows
        .iter()
        .find(|o| o.kind == "dialect")
        .map(|o| o.name.clone());
    Ok((
        dialect,
        rows.into_iter().filter(|o| o.kind != "dialect").collect(),
    ))
}

pub fn pick_rowid_name(columns: &[ColumnInfo]) -> Option<String> {
    let taken: Vec<String> = columns.iter().map(|c| c.name.to_lowercase()).collect();
    ROWID_CANDIDATES
        .iter()
        .find(|c| !taken.iter().any(|t| t == *c))
        .map(|c| (*c).to_owned())
}

/// A cell read as text the way JavaScript's `String()` would, `None` for NULL.
fn text(row: &Row, i: usize) -> rusqlite::Result<Option<String>> {
    Ok(match row.get_ref(i)? {
        ValueRef::Null => None,
        ValueRef::Integer(n) => Some(n.to_string()),
        ValueRef::Real(f) => Some(f.to_string()),
        ValueRef::Text(t) | ValueRef::Blob(t) => Some(String::from_utf8_lossy(t).into_owned()),
    })
}

fn string(row: &Row, i: usize) -> rusqlite::Result<String> {
    Ok(text(row, i)?.unwrap_or_default())
}

fn number(row: &Row, i: usize) -> rusqlite::Result<i64> {
    Ok(match row.get_ref(i)? {
        ValueRef::Integer(n) => n,
        ValueRef::Real(f) => f as i64,
        _ => 0,
    })
}

fn collect<T>(
    conn: &Connection,
    sql: &str,
    param: Option<&str>,
    map: impl FnMut(&Row) -> rusqlite::Result<T>,
) -> rusqlite::Result<Vec<T>> {
    let mut stmt = conn.prepare(sql)?;
    match param {
        Some(p) => stmt.query_map([p], map)?.collect(),
        None => stmt.query_map([], map)?.collect(),
    }
}

fn read_columns(
    conn: &Connection,
    table: &str,
    as_written: bool,
) -> rusqlite::Result<Vec<ColumnInfo>> {
    collect(
        conn,
        r#"SELECT cid, name, type, "notnull", dflt_value, pk, hidden FROM pragma_table_xinfo(?) ORDER BY cid"#,
        Some(table),
        |r| {
            Ok(ColumnInfo {
                cid: number(r, 0)?,
                name: string(r, 1)?,
                type_name: shown_type(string(r, 2)?, as_written),
                not_null: number(r, 3)? == 1,
                default_value: text(r, 4)?,
                pk: number(r, 5)?,
                hidden: number(r, 6)?,
            })
        },
    )
}

fn read_foreign_keys(conn: &Connection, table: &str) -> rusqlite::Result<Vec<ForeignKey>> {
    collect(
        conn,
        r#"SELECT id, seq, "table", "from", "to", on_update, on_delete FROM pragma_foreign_key_list(?)"#,
        Some(table),
        |r| {
            Ok(ForeignKey {
                id: number(r, 0)?,
                seq: number(r, 1)?,
                table: string(r, 2)?,
                from: string(r, 3)?,
                to: text(r, 4)?,
                on_update: string(r, 5)?,
                on_delete: string(r, 6)?,
            })
        },
    )
}

fn read_indexes(
    conn: &Connection,
    table: &str,
    sql_by_name: &HashMap<String, Option<String>>,
) -> rusqlite::Result<Vec<IndexInfo>> {
    let list = collect(
        conn,
        r#"SELECT name, "unique", origin, partial FROM pragma_index_list(?)"#,
        Some(table),
        |r| {
            Ok((
                string(r, 0)?,
                number(r, 1)? == 1,
                string(r, 2)?,
                number(r, 3)? == 1,
            ))
        },
    )?;
    list.into_iter()
        .map(|(name, unique, origin, partial)| {
            let columns = collect(
                conn,
                "SELECT name FROM pragma_index_info(?) ORDER BY seqno",
                Some(&name),
                |r| Ok(text(r, 0)?.unwrap_or_else(|| "<expr>".into())),
            )?;
            let sql = sql_by_name.get(&name).cloned().flatten();
            Ok(IndexInfo {
                name,
                unique,
                origin,
                partial,
                columns,
                sql,
            })
        })
        .collect()
}

pub fn read_schema(conn: &Connection) -> Result<Schema> {
    let (dialect, extra) = read_objects(conn)?;
    // (type, name, tbl_name, sql)
    let master = collect(
        conn,
        "SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY name",
        None,
        |r| Ok((string(r, 0)?, string(r, 1)?, string(r, 2)?, text(r, 3)?)),
    )?;
    let sql_by_name: HashMap<String, Option<String>> = master
        .iter()
        .map(|(_, name, _, sql)| (name.clone(), sql.clone()))
        .collect();
    let objects = |kind: &str| -> Vec<SchemaObject> {
        master
            .iter()
            .filter(|(t, name, _, _)| t == kind && !is_internal_name(name))
            .map(|(_, name, table, sql)| SchemaObject {
                name: name.clone(),
                table: table.clone(),
                sql: sql.clone(),
            })
            .collect()
    };

    let list = collect(
        conn,
        "SELECT name, type, wr, strict FROM pragma_table_list WHERE schema = 'main' ORDER BY name COLLATE NOCASE",
        None,
        |r| {
            Ok((
                string(r, 0)?,
                string(r, 1)?,
                number(r, 2)? == 1,
                number(r, 3)? == 1,
            ))
        },
    )?;

    let mut tables = Vec::new();
    let mut views = Vec::new();
    for (name, type_name, without_rowid, strict) in list {
        if type_name == "shadow" || (is_internal_name(&name) && name != "sqlite_sequence") {
            continue;
        }
        let kind = match type_name.as_str() {
            "view" => RelationKind::View,
            "virtual" => RelationKind::Virtual,
            _ => RelationKind::Table,
        };
        // A view whose tables were dropped can't be described; list it without columns.
        let columns = match read_columns(conn, &name, dialect.is_some()) {
            Ok(columns) => columns,
            Err(_) if kind == RelationKind::View => Vec::new(),
            Err(error) => return Err(error.into()),
        };
        let is_table = kind == RelationKind::Table;
        let rowid_name = if is_table && !without_rowid {
            pick_rowid_name(&columns)
        } else {
            None
        };
        let has_pk = columns.iter().any(|c| c.pk > 0);
        let relation = RelationInfo {
            sql: sql_by_name.get(&name).cloned().flatten(),
            foreign_keys: if is_table {
                read_foreign_keys(conn, &name)?
            } else {
                Vec::new()
            },
            indexes: if is_table {
                read_indexes(conn, &name, &sql_by_name)?
            } else {
                Vec::new()
            },
            editable: is_table && (rowid_name.is_some() || has_pk),
            name,
            kind,
            columns,
            without_rowid,
            strict,
            rowid_name,
        };
        if kind == RelationKind::View {
            views.push(relation);
        } else {
            tables.push(relation);
        }
    }

    Ok(Schema {
        tables,
        views,
        indexes: objects("index"),
        triggers: objects("trigger"),
        dialect,
        objects: extra,
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::session::Session;

    pub(crate) const SAMPLE: &str = r#"
      CREATE TABLE artist (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE album (
        id INTEGER PRIMARY KEY, title TEXT, artist_id INTEGER REFERENCES artist(id) ON DELETE CASCADE,
        cover BLOB, price REAL DEFAULT 9.99
      );
      CREATE INDEX album_artist ON album(artist_id);
      CREATE VIEW album_names AS SELECT title FROM album;
      CREATE TRIGGER album_title AFTER INSERT ON album BEGIN UPDATE album SET title = trim(new.title) WHERE id = new.id; END;
      CREATE TABLE "odd ""name""" (rowid TEXT, _rowid_ TEXT, value TEXT);
      INSERT INTO artist (name) VALUES ('Nina'), ('Miles');
      INSERT INTO album (title, artist_id, cover) VALUES (' Kind of Blue ', 2, x'cafe'), ('Pastel Blues', 1, NULL);
      INSERT INTO "odd ""name""" VALUES ('r', 'u', 'it''s');
    "#;

    pub(crate) fn sample() -> Session {
        let s = Session::memory().unwrap();
        s.connection().execute_batch(SAMPLE).unwrap();
        s
    }

    #[test]
    fn reads_tables_views_indexes_triggers_keys_and_row_identity() {
        let schema = sample().schema().unwrap();
        let names: Vec<&str> = schema.tables.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(
            names,
            ["album", "artist", "odd \"name\"", "sqlite_sequence"]
        );

        let album = schema.tables.iter().find(|t| t.name == "album").unwrap();
        let columns: Vec<&str> = album.columns.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(columns, ["id", "title", "artist_id", "cover", "price"]);
        assert_eq!(album.columns[0].pk, 1);
        assert_eq!(album.columns[4].default_value.as_deref(), Some("9.99"));
        let fk = &album.foreign_keys[0];
        assert_eq!(
            (fk.table.as_str(), fk.from.as_str()),
            ("artist", "artist_id")
        );
        assert_eq!(
            (fk.to.as_deref(), fk.on_delete.as_str()),
            (Some("id"), "CASCADE")
        );
        let indexes: Vec<&str> = album.indexes.iter().map(|i| i.name.as_str()).collect();
        assert_eq!(indexes, ["album_artist"]);
        assert_eq!(album.rowid_name.as_deref(), Some("rowid"));
        assert!(album.editable);

        let odd = schema
            .tables
            .iter()
            .find(|t| t.name == "odd \"name\"")
            .unwrap();
        assert_eq!(odd.rowid_name.as_deref(), Some("oid"));

        let view = &schema.views[0];
        assert_eq!(
            (view.name.as_str(), view.kind, view.editable),
            ("album_names", RelationKind::View, false)
        );
        assert_eq!(schema.indexes.len(), 1);
        assert_eq!(schema.triggers[0].name, "album_title");
    }

    #[test]
    fn serializes_with_the_web_app_field_names() {
        let json = serde_json::to_value(sample().schema().unwrap()).unwrap();
        let album = &json["tables"][0];
        assert_eq!(album["rowidName"], "rowid");
        assert_eq!(album["withoutRowid"], false);
        assert_eq!(album["columns"][4]["type"], "REAL");
        assert_eq!(album["columns"][4]["defaultValue"], "9.99");
        assert_eq!(album["foreignKeys"][0]["onDelete"], "CASCADE");
        assert_eq!(json["views"][0]["kind"], "view");
    }

    #[test]
    fn lists_a_broken_view_without_columns() {
        let s = sample();
        s.connection()
            .execute_batch(
                "CREATE TABLE gone (a); CREATE VIEW v AS SELECT a FROM gone; DROP TABLE gone;",
            )
            .unwrap();
        let schema = s.schema().unwrap();
        let v = schema.views.iter().find(|v| v.name == "v").unwrap();
        assert!(v.columns.is_empty());
    }
}
