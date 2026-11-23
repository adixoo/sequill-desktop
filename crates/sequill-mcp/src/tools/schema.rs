//! Tables, columns, indexes, triggers and views, built from structured definitions with
//! the editor's rules (`sequill_core::ddl`). Each change runs in one transaction and
//! returns the SQL it ran.

use super::open_db;
use schemars::JsonSchema;
use sequill_core::ddl::{self, ColumnSpec, IndexSpec, ObjectKind, TableSpec, TriggerSpec};
use sequill_core::{Error, Result};
use serde::Deserialize;
use serde_json::{Value, json};
use std::path::Path;

/// What to change about a table.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AlterAction {
    /// Add `definition` as a new column.
    AddColumn,
    /// Rename `column` to `new_name`.
    RenameColumn,
    /// Remove `column`.
    DropColumn,
    /// Rename the table to `new_name`.
    RenameTable,
}

fn apply(dir: &Path, database: &str, sql: String) -> Result<Value> {
    let db = open_db(dir, database, true)?;
    let tx = db.session.connection().unchecked_transaction()?;
    tx.execute_batch(&sql)?;
    tx.commit()?;
    db.record_write();
    Ok(json!({ "ok": true, "sql": sql }))
}

fn needs<'a>(value: &'a Option<String>, what: &str, action: &str) -> Result<&'a str> {
    value
        .as_deref()
        .ok_or_else(|| Error::msg(format!("{action} needs {what}")))
}

pub fn create_table(dir: &Path, database: &str, table: &TableSpec) -> Result<Value> {
    apply(dir, database, ddl::create_table_sql(table)?)
}

pub fn alter_table(
    dir: &Path,
    database: &str,
    table: &str,
    action: AlterAction,
    column: &Option<String>,
    new_name: &Option<String>,
    definition: Option<&ColumnSpec>,
) -> Result<Value> {
    let sql = match action {
        AlterAction::AddColumn => {
            let definition =
                definition.ok_or_else(|| Error::msg("add_column needs a column definition"))?;
            ddl::add_column_sql(table, definition)?
        }
        AlterAction::RenameColumn => ddl::rename_column_sql(
            table,
            needs(column, "column", "rename_column")?,
            needs(new_name, "new_name", "rename_column")?,
        )?,
        AlterAction::DropColumn => {
            ddl::drop_column_sql(table, needs(column, "column", "drop_column")?)
        }
        AlterAction::RenameTable => {
            ddl::rename_table_sql(table, needs(new_name, "new_name", "rename_table")?)?
        }
    };
    apply(dir, database, sql)
}

pub fn create_index(dir: &Path, database: &str, index: &IndexSpec) -> Result<Value> {
    apply(dir, database, ddl::create_index_sql(index)?)
}

pub fn create_trigger(dir: &Path, database: &str, trigger: &TriggerSpec) -> Result<Value> {
    apply(dir, database, ddl::create_trigger_sql(trigger)?)
}

pub fn create_view(dir: &Path, database: &str, name: &str, select: &str) -> Result<Value> {
    apply(dir, database, ddl::create_view_sql(name, select)?)
}

pub fn drop_object(dir: &Path, database: &str, kind: ObjectKind, name: &str) -> Result<Value> {
    apply(dir, database, ddl::drop_sql(kind, name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::get_schema;
    use crate::tools::test_support::store_with_shop;

    fn names(dir: &Path, id: &str, key: &str) -> Vec<String> {
        get_schema(dir, id).unwrap()[key]
            .as_array()
            .unwrap()
            .iter()
            .map(|o| o["name"].as_str().unwrap().to_owned())
            .collect()
    }

    #[test]
    fn builds_a_schema_step_by_step() {
        let (dir, id) = store_with_shop();
        let d = dir.path();
        let table: TableSpec = serde_json::from_value(json!({
            "name": "orders",
            "columns": [
                {"name": "id", "type": "INTEGER", "primary_key": true},
                {"name": "customer_id", "type": "INTEGER", "references": {"table": "customer", "on_delete": "cascade"}},
                {"name": "total", "type": "REAL", "not_null": true, "default": "0"}
            ]
        }))
        .unwrap();
        let created = create_table(d, &id, &table).unwrap();
        assert!(
            created["sql"]
                .as_str()
                .unwrap()
                .starts_with("CREATE TABLE \"orders\"")
        );

        let note: ColumnSpec =
            serde_json::from_value(json!({"name": "note", "type": "TEXT"})).unwrap();
        alter_table(
            d,
            &id,
            "orders",
            AlterAction::AddColumn,
            &None,
            &None,
            Some(&note),
        )
        .unwrap();
        alter_table(
            d,
            &id,
            "orders",
            AlterAction::RenameColumn,
            &Some("note".into()),
            &Some("memo".into()),
            None,
        )
        .unwrap();
        let index: IndexSpec =
            serde_json::from_value(json!({"table": "orders", "columns": ["customer_id"]})).unwrap();
        create_index(d, &id, &index).unwrap();
        let trigger: TriggerSpec = serde_json::from_value(json!({
            "name": "no_negative", "table": "orders", "timing": "before", "event": "insert",
            "when": "NEW.total < 0", "body": "SELECT RAISE(ABORT, 'negative total')"
        }))
        .unwrap();
        create_trigger(d, &id, &trigger).unwrap();
        create_view(
            d,
            &id,
            "big_orders",
            "SELECT * FROM orders WHERE total > 100",
        )
        .unwrap();

        assert_eq!(names(d, &id, "tables"), ["customer", "orders"]);
        assert_eq!(names(d, &id, "indexes"), ["idx_orders_customer_id"]);
        assert_eq!(names(d, &id, "triggers"), ["no_negative"]);
        assert_eq!(names(d, &id, "views"), ["big_orders"]);

        drop_object(d, &id, ObjectKind::View, "big_orders").unwrap();
        drop_object(d, &id, ObjectKind::Trigger, "no_negative").unwrap();
        drop_object(d, &id, ObjectKind::Index, "idx_orders_customer_id").unwrap();
        alter_table(
            d,
            &id,
            "orders",
            AlterAction::DropColumn,
            &Some("memo".into()),
            &None,
            None,
        )
        .unwrap();
        alter_table(
            d,
            &id,
            "orders",
            AlterAction::RenameTable,
            &None,
            &Some("purchases".into()),
            None,
        )
        .unwrap();
        drop_object(d, &id, ObjectKind::Table, "purchases").unwrap();
        assert_eq!(names(d, &id, "tables"), ["customer"]);
    }

    #[test]
    fn explains_what_an_action_is_missing() {
        let (dir, id) = store_with_shop();
        let error = alter_table(
            dir.path(),
            &id,
            "customer",
            AlterAction::RenameColumn,
            &Some("name".into()),
            &None,
            None,
        );
        assert_eq!(
            error.unwrap_err().to_string(),
            "rename_column needs new_name"
        );
        assert!(drop_object(dir.path(), &id, ObjectKind::Table, "nope").is_err());
    }
}
