//! Builders for schema changes from structured definitions, with the same rules and messages
//! as the web app's `src/shared/lib/sqlite/ddl.ts`. Names are always quoted.

use crate::dump::quote_ident;
use crate::error::{Error, Result};
use serde::Deserialize;

const FK_ACTIONS: [&str; 5] = [
    "NO ACTION",
    "RESTRICT",
    "SET NULL",
    "SET DEFAULT",
    "CASCADE",
];

/// A foreign key from a column to another table.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
pub struct Reference {
    /// The table it points at.
    pub table: String,
    /// The column it points at (default: that table's primary key).
    #[serde(default)]
    pub column: Option<String>,
    /// NO ACTION, RESTRICT, SET NULL, SET DEFAULT or CASCADE.
    #[serde(default)]
    pub on_delete: Option<String>,
    #[serde(default)]
    pub on_update: Option<String>,
}

/// One column of a new table, or a column to add.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
pub struct ColumnSpec {
    pub name: String,
    /// INTEGER, REAL, TEXT, BLOB, NUMERIC or ANY (or any SQLite type name). Optional.
    #[serde(rename = "type", default)]
    pub type_name: Option<String>,
    #[serde(default)]
    pub primary_key: bool,
    /// Only for a single INTEGER primary key.
    #[serde(default)]
    pub autoincrement: bool,
    #[serde(default)]
    pub not_null: bool,
    #[serde(default)]
    pub unique: bool,
    /// Default as SQL: 0, 'text', NULL, CURRENT_TIMESTAMP, (expression).
    #[serde(default)]
    pub default: Option<String>,
    #[serde(default)]
    pub references: Option<Reference>,
}

/// A table to create.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
pub struct TableSpec {
    pub name: String,
    pub columns: Vec<ColumnSpec>,
    /// STRICT: values must match the column types.
    #[serde(default)]
    pub strict: bool,
    /// WITHOUT ROWID (needs a primary key).
    #[serde(default)]
    pub without_rowid: bool,
}

/// A column of an index.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(untagged)]
pub enum IndexColumn {
    Name(String),
    Sorted {
        name: String,
        #[serde(default)]
        desc: bool,
    },
}

/// An index to create.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
pub struct IndexSpec {
    pub table: String,
    pub columns: Vec<IndexColumn>,
    #[serde(default)]
    pub unique: bool,
    /// Default: idx_<table>_<columns>.
    #[serde(default)]
    pub name: Option<String>,
    /// Makes it a partial index: only rows where this SQL condition holds.
    #[serde(default, rename = "where")]
    pub where_clause: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum TriggerTiming {
    Before,
    After,
    /// Only on views.
    InsteadOf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum TriggerEvent {
    Insert,
    Update,
    Delete,
}

/// A trigger to create.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
pub struct TriggerSpec {
    pub name: String,
    /// The table (or view, for instead_of) it watches.
    pub table: String,
    pub timing: TriggerTiming,
    pub event: TriggerEvent,
    /// For update: only when these columns change.
    #[serde(default)]
    pub update_of: Vec<String>,
    /// Only when this SQL condition holds (may use NEW. and OLD.).
    #[serde(default)]
    pub when: Option<String>,
    /// The statements to run, separated by semicolons (may use NEW. and OLD.).
    pub body: String,
}

/// A kind of schema object.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum ObjectKind {
    Table,
    View,
    Index,
    Trigger,
}

fn required<'a>(value: &'a str, what: &str) -> Result<&'a str> {
    let value = value.trim();
    if value.is_empty() {
        Err(Error::msg(format!("{what} is empty")))
    } else {
        Ok(value)
    }
}

/// A piece of SQL that goes inside a statement (a default, a condition): one expression,
/// never a second statement.
fn fragment<'a>(sql: &'a str, what: &str) -> Result<&'a str> {
    let sql = required(sql, what)?;
    if sql.contains(';') {
        return Err(Error::msg(format!("{what} can't contain ';'")));
    }
    Ok(sql)
}

fn type_name(name: &str) -> Result<String> {
    let name = name.trim();
    let ok = name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || " _(),".contains(c));
    if !ok {
        return Err(Error::msg(format!("\"{name}\" is not a column type")));
    }
    Ok(name.to_uppercase())
}

fn fk_action(action: &str) -> Result<String> {
    let action = action.trim().to_uppercase();
    if FK_ACTIONS.contains(&action.as_str()) {
        Ok(action)
    } else {
        Err(Error::msg(format!(
            "\"{action}\" is not one of {}",
            FK_ACTIONS.join(", ")
        )))
    }
}

/// A column definition, as used in CREATE TABLE and ALTER TABLE ADD COLUMN.
pub fn column_sql(col: &ColumnSpec, inline_primary_key: bool) -> Result<String> {
    let mut sql = quote_ident(required(&col.name, "A column name")?);
    if let Some(t) = col.type_name.as_deref().filter(|t| !t.trim().is_empty()) {
        sql += &format!(" {}", type_name(t)?);
    }
    if inline_primary_key && col.primary_key {
        sql += " PRIMARY KEY";
        if col.autoincrement {
            sql += " AUTOINCREMENT";
        }
    }
    if col.not_null {
        sql += " NOT NULL";
    }
    if col.unique && !col.primary_key {
        sql += " UNIQUE";
    }
    if let Some(default) = &col.default {
        sql += &format!(" DEFAULT ({})", fragment(default, "A default")?);
    }
    if let Some(r) = &col.references {
        sql += &format!(
            " REFERENCES {}",
            quote_ident(required(&r.table, "A referenced table")?)
        );
        if let Some(column) = r.column.as_deref().filter(|c| !c.trim().is_empty()) {
            sql += &format!("({})", quote_ident(column.trim()));
        }
        if let Some(action) = &r.on_delete {
            sql += &format!(" ON DELETE {}", fk_action(action)?);
        }
        if let Some(action) = &r.on_update {
            sql += &format!(" ON UPDATE {}", fk_action(action)?);
        }
    }
    Ok(sql)
}

pub fn create_table_sql(spec: &TableSpec) -> Result<String> {
    let name = required(&spec.name, "The table name")?;
    if spec.columns.is_empty() {
        return Err(Error::msg("Add at least one column"));
    }
    let names: Vec<String> = spec
        .columns
        .iter()
        .map(|c| c.name.trim().to_lowercase())
        .collect();
    let duplicate = names
        .iter()
        .enumerate()
        .find(|(i, n)| names[..*i].contains(n));
    if let Some((_, dup)) = duplicate {
        return Err(Error::msg(format!("Column \"{dup}\" appears twice")));
    }
    let pk: Vec<&ColumnSpec> = spec.columns.iter().filter(|c| c.primary_key).collect();
    if spec.without_rowid && pk.is_empty() {
        return Err(Error::msg("WITHOUT ROWID tables need a primary key"));
    }
    if let Some(auto) = pk.iter().find(|c| c.autoincrement) {
        if pk.len() > 1 {
            return Err(Error::msg(
                "AUTOINCREMENT needs a single-column primary key",
            ));
        }
        let is_integer = auto
            .type_name
            .as_deref()
            .is_some_and(|t| t.trim().eq_ignore_ascii_case("INTEGER"));
        if !is_integer {
            return Err(Error::msg(
                "AUTOINCREMENT only works on an INTEGER primary key",
            ));
        }
        if spec.without_rowid {
            return Err(Error::msg(
                "AUTOINCREMENT is not allowed on WITHOUT ROWID tables",
            ));
        }
    }
    let inline_pk = pk.len() == 1;
    let mut lines = spec
        .columns
        .iter()
        .map(|c| column_sql(c, inline_pk).map(|sql| format!("  {sql}")))
        .collect::<Result<Vec<_>>>()?;
    if pk.len() > 1 {
        let keys: Vec<String> = pk.iter().map(|c| quote_ident(c.name.trim())).collect();
        lines.push(format!("  PRIMARY KEY ({})", keys.join(", ")));
    }
    let options: Vec<&str> = [
        (spec.without_rowid, "WITHOUT ROWID"),
        (spec.strict, "STRICT"),
    ]
    .into_iter()
    .filter_map(|(on, text)| on.then_some(text))
    .collect();
    let options = if options.is_empty() {
        String::new()
    } else {
        format!(" {}", options.join(", "))
    };
    Ok(format!(
        "CREATE TABLE {} (\n{}\n){options};",
        quote_ident(name),
        lines.join(",\n")
    ))
}

pub fn add_column_sql(table: &str, col: &ColumnSpec) -> Result<String> {
    if col.primary_key {
        return Err(Error::msg(
            "SQLite cannot add a PRIMARY KEY column to an existing table",
        ));
    }
    if col.unique {
        return Err(Error::msg(
            "SQLite cannot add a UNIQUE column; add a unique index instead",
        ));
    }
    if col.not_null && col.default.is_none() {
        return Err(Error::msg("A NOT NULL column needs a default value"));
    }
    Ok(format!(
        "ALTER TABLE {} ADD COLUMN {};",
        quote_ident(table),
        column_sql(col, false)?
    ))
}

pub fn rename_column_sql(table: &str, from: &str, to: &str) -> Result<String> {
    Ok(format!(
        "ALTER TABLE {} RENAME COLUMN {} TO {};",
        quote_ident(table),
        quote_ident(from),
        quote_ident(required(to, "The new name")?)
    ))
}

pub fn drop_column_sql(table: &str, column: &str) -> String {
    format!(
        "ALTER TABLE {} DROP COLUMN {};",
        quote_ident(table),
        quote_ident(column)
    )
}

pub fn rename_table_sql(from: &str, to: &str) -> Result<String> {
    Ok(format!(
        "ALTER TABLE {} RENAME TO {};",
        quote_ident(from),
        quote_ident(required(to, "The new name")?)
    ))
}

pub fn create_index_sql(spec: &IndexSpec) -> Result<String> {
    if spec.columns.is_empty() {
        return Err(Error::msg("Pick at least one column"));
    }
    let columns: Vec<(&str, bool)> = spec
        .columns
        .iter()
        .map(|c| match c {
            IndexColumn::Name(name) => (name.as_str(), false),
            IndexColumn::Sorted { name, desc } => (name.as_str(), *desc),
        })
        .collect();
    let name = match spec.name.as_deref().filter(|n| !n.trim().is_empty()) {
        Some(name) => name.trim().to_owned(),
        None => {
            let parts: Vec<&str> = columns.iter().map(|(c, _)| *c).collect();
            format!("idx_{}_{}", spec.table, parts.join("_"))
        }
    };
    let cols: Vec<String> = columns
        .iter()
        .map(|(c, desc)| format!("{}{}", quote_ident(c), if *desc { " DESC" } else { "" }))
        .collect();
    let where_sql = match &spec.where_clause {
        Some(w) => format!(" WHERE {}", fragment(w, "The index condition")?),
        None => String::new(),
    };
    Ok(format!(
        "CREATE {}INDEX {} ON {} ({}){where_sql};",
        if spec.unique { "UNIQUE " } else { "" },
        quote_ident(&name),
        quote_ident(&spec.table),
        cols.join(", ")
    ))
}

pub fn create_trigger_sql(spec: &TriggerSpec) -> Result<String> {
    let timing = match spec.timing {
        TriggerTiming::Before => "BEFORE",
        TriggerTiming::After => "AFTER",
        TriggerTiming::InsteadOf => "INSTEAD OF",
    };
    let event = match spec.event {
        TriggerEvent::Insert => "INSERT".to_owned(),
        TriggerEvent::Delete => "DELETE".to_owned(),
        TriggerEvent::Update if spec.update_of.is_empty() => "UPDATE".to_owned(),
        TriggerEvent::Update => {
            let cols: Vec<String> = spec.update_of.iter().map(|c| quote_ident(c)).collect();
            format!("UPDATE OF {}", cols.join(", "))
        }
    };
    let when = match &spec.when {
        Some(w) => format!(" WHEN {}", fragment(w, "The trigger condition")?),
        None => String::new(),
    };
    let body = required(&spec.body, "The trigger body")?;
    let body = if body.ends_with(';') {
        body.to_owned()
    } else {
        format!("{body};")
    };
    Ok(format!(
        "CREATE TRIGGER {} {timing} {event} ON {} FOR EACH ROW{when}\nBEGIN\n  {body}\nEND;",
        quote_ident(required(&spec.name, "The trigger name")?),
        quote_ident(&spec.table)
    ))
}

pub fn create_view_sql(name: &str, select: &str) -> Result<String> {
    let select = required(select, "The view's SELECT")?
        .trim_end_matches(';')
        .trim_end();
    fragment(select, "The view's SELECT")?;
    Ok(format!(
        "CREATE VIEW {} AS {select};",
        quote_ident(required(name, "The view name")?)
    ))
}

pub fn drop_sql(kind: ObjectKind, name: &str) -> String {
    let kind = match kind {
        ObjectKind::Table => "TABLE",
        ObjectKind::View => "VIEW",
        ObjectKind::Index => "INDEX",
        ObjectKind::Trigger => "TRIGGER",
    };
    format!("DROP {kind} {};", quote_ident(name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::Session;
    use serde_json::json;

    fn col(value: serde_json::Value) -> ColumnSpec {
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn creates_tables_the_app_way() {
        let spec: TableSpec = serde_json::from_value(json!({
            "name": "order items",
            "columns": [
                {"name": "id", "type": "integer", "primary_key": true, "autoincrement": true},
                {"name": "qty", "type": "INTEGER", "not_null": true, "default": "1"},
                {"name": "order_id", "references": {"table": "orders", "on_delete": "cascade"}}
            ],
            "strict": true
        }))
        .unwrap();
        assert_eq!(
            create_table_sql(&spec).unwrap(),
            "CREATE TABLE \"order items\" (\n  \"id\" INTEGER PRIMARY KEY AUTOINCREMENT,\n  \"qty\" INTEGER NOT NULL DEFAULT (1),\n  \"order_id\" REFERENCES \"orders\" ON DELETE CASCADE\n) STRICT;"
        );
    }

    #[test]
    fn validates_like_the_app() {
        let table = |columns: serde_json::Value, without_rowid: bool| -> String {
            let spec: TableSpec = serde_json::from_value(
                json!({"name": "t", "columns": columns, "without_rowid": without_rowid}),
            )
            .unwrap();
            create_table_sql(&spec).unwrap_err().to_string()
        };
        assert_eq!(
            table(json!([{"name": "a"}, {"name": "A"}]), false),
            "Column \"a\" appears twice"
        );
        assert_eq!(
            table(json!([{"name": "a"}]), true),
            "WITHOUT ROWID tables need a primary key"
        );
        assert_eq!(
            table(
                json!([{"name": "a", "type": "TEXT", "primary_key": true, "autoincrement": true}]),
                false
            ),
            "AUTOINCREMENT only works on an INTEGER primary key"
        );
        assert!(add_column_sql("t", &col(json!({"name": "x", "not_null": true}))).is_err());
        assert!(
            column_sql(
                &col(json!({"name": "x", "default": "1); DROP TABLE t; --"})),
                false
            )
            .is_err()
        );
        assert!(column_sql(&col(json!({"name": "x", "type": "TEXT; DROP"})), false).is_err());
        assert!(
            column_sql(
                &col(json!({"name": "x", "references": {"table": "t", "on_delete": "explode"}})),
                false
            )
            .is_err()
        );
    }

    #[test]
    fn every_builder_produces_sql_that_sqlite_runs() {
        let s = Session::memory().unwrap();
        let run = |sql: String| s.connection().execute_batch(&sql).unwrap();
        run(create_table_sql(&serde_json::from_value(json!({
            "name": "people", "columns": [{"name": "id", "type": "INTEGER", "primary_key": true}, {"name": "name"}]
        })).unwrap()).unwrap());
        run(add_column_sql(
            "people",
            &col(json!({"name": "age", "type": "INTEGER", "default": "0"})),
        )
        .unwrap());
        run(rename_column_sql("people", "name", "full name").unwrap());
        run(create_index_sql(&serde_json::from_value(json!({
            "table": "people", "columns": ["age", {"name": "full name", "desc": true}], "where": "age > 0"
        })).unwrap()).unwrap());
        run(create_view_sql("adults", "SELECT * FROM people WHERE age >= 18;").unwrap());
        run("CREATE TABLE log (msg TEXT)".into());
        run(create_trigger_sql(&serde_json::from_value(json!({
            "name": "log_age", "table": "people", "timing": "after", "event": "update", "update_of": ["age"],
            "when": "NEW.age <> OLD.age", "body": "INSERT INTO log VALUES ('age changed')"
        })).unwrap()).unwrap());
        run(
            "INSERT INTO people (\"full name\", age) VALUES ('A', 1); UPDATE people SET age = 2"
                .into(),
        );
        assert_eq!(s.count("SELECT count(*) FROM log", &[]).unwrap(), 1);

        run(drop_sql(ObjectKind::Trigger, "log_age"));
        run(drop_sql(ObjectKind::Index, "idx_people_age_full name"));
        run(drop_sql(ObjectKind::View, "adults"));
        run(drop_column_sql("people", "age"));
        run(rename_table_sql("people", "persons").unwrap());
        run(drop_sql(ObjectKind::Table, "persons"));
        assert_eq!(s.schema().unwrap().tables.len(), 1, "only log is left");
    }
}
