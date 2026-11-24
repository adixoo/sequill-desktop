//! The schema designer's unsaved design (its "draft"): what the user (or an assistant) has
//! designed but not saved to the database yet. Field names match `Draft` in
//! `src/features/vis/lib/model.ts`, which turns it into SQL; the catalog keeps it so the app
//! and assistants over MCP edit the same one.

use crate::schema::ExtraObject;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Draft {
    /// New tables.
    #[serde(default)]
    pub tables: Vec<DraftTable>,
    /// New columns for existing tables: existing table name → columns.
    #[serde(default)]
    pub added_columns: BTreeMap<String, Vec<ColumnDef>>,
    /// Existing table name → its new name.
    #[serde(default)]
    pub renamed_tables: BTreeMap<String, String>,
    /// Existing tables to drop.
    #[serde(default)]
    pub dropped_tables: Vec<String>,
    /// Existing table name → existing column name → change.
    #[serde(default)]
    pub column_changes: BTreeMap<String, BTreeMap<String, ColumnChange>>,
    /// An imported schema's enums, functions, procedures, triggers, views, sequences and
    /// types: "kind:name" as stored → its new definition, or null to delete it.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub objects: BTreeMap<String, Option<ExtraObject>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftTable {
    /// Any id unique among the design's new tables.
    pub id: String,
    pub name: String,
    pub columns: Vec<ColumnDef>,
    #[serde(default)]
    pub without_rowid: bool,
    #[serde(default)]
    pub strict: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ColumnDef {
    pub name: String,
    /// The declared type, such as INTEGER, TEXT, REAL, BLOB or NUMERIC.
    #[serde(rename = "type")]
    pub type_name: String,
    #[serde(default)]
    pub primary_key: bool,
    #[serde(default)]
    pub autoincrement: bool,
    #[serde(default)]
    pub not_null: bool,
    #[serde(default)]
    pub unique: bool,
    #[serde(default)]
    pub default_kind: DefaultKind,
    /// The default for kinds text, number and expression.
    #[serde(default)]
    pub default_value: String,
    /// A foreign key to another table's column.
    #[serde(default)]
    pub references: Option<ColumnReference>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum DefaultKind {
    #[default]
    None,
    Null,
    Text,
    Number,
    Expression,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ColumnReference {
    pub table: String,
    pub column: String,
    /// NO ACTION, CASCADE, SET NULL, SET DEFAULT or RESTRICT.
    #[serde(default = "no_action")]
    pub on_delete: String,
}

fn no_action() -> String {
    "NO ACTION".to_owned()
}

/// A pending change to an existing column: drop it, or replace its definition (`def.name`
/// is its new name).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ColumnChange {
    Drop,
    Change { def: ColumnDef },
}

impl Draft {
    /// Names of existing tables and columns the draft refers to that `tables` (table name →
    /// its columns) doesn't have, as "table" or "table.column".
    pub fn unknown_names(&self, tables: &BTreeMap<String, Vec<String>>) -> Vec<String> {
        let mut unknown = Vec::new();
        let table_names = self
            .added_columns
            .keys()
            .chain(self.renamed_tables.keys())
            .chain(&self.dropped_tables)
            .chain(self.column_changes.keys());
        for table in table_names {
            if !tables.contains_key(table) && !unknown.contains(table) {
                unknown.push(table.clone());
            }
        }
        for (table, changes) in &self.column_changes {
            let Some(columns) = tables.get(table) else {
                continue;
            };
            for column in changes.keys().filter(|c| !columns.contains(c)) {
                unknown.push(format!("{table}.{column}"));
            }
        }
        unknown
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_the_web_ui_draft_and_writes_it_back_unchanged() {
        let web = json!({
            "tables": [{ "id": "a1", "name": "orders", "withoutRowid": false, "strict": false,
                "columns": [{ "name": "id", "type": "INTEGER", "primaryKey": true,
                    "autoincrement": false, "notNull": false, "unique": false,
                    "defaultKind": "none", "defaultValue": "",
                    "references": { "table": "customer", "column": "id", "onDelete": "CASCADE" } }] }],
            "addedColumns": {},
            "renamedTables": { "customer": "client" },
            "droppedTables": [],
            "columnChanges": { "customer": { "city": { "kind": "drop" } } }
        });
        let draft: Draft = serde_json::from_value(web.clone()).unwrap();
        assert_eq!(serde_json::to_value(&draft).unwrap(), web);
    }

    #[test]
    fn fills_in_what_an_assistant_leaves_out_and_refuses_unknown_fields() {
        let draft: Draft = serde_json::from_value(json!({
            "tables": [{ "id": "t", "name": "tag", "columns": [{ "name": "label", "type": "TEXT" }] }]
        }))
        .unwrap();
        assert_eq!(draft.tables[0].columns[0].default_kind, DefaultKind::None);
        assert!(serde_json::from_value::<Draft>(json!({ "newTables": [] })).is_err());
    }

    #[test]
    fn names_tables_and_columns_the_database_does_not_have() {
        let draft: Draft = serde_json::from_value(json!({
            "renamedTables": { "customer": "client", "ghost": "x" },
            "columnChanges": { "customer": { "city": { "kind": "drop" }, "age": { "kind": "drop" } } }
        }))
        .unwrap();
        let tables = BTreeMap::from([(
            "customer".to_owned(),
            vec!["id".to_owned(), "city".to_owned()],
        )]);
        assert_eq!(draft.unknown_names(&tables), ["ghost", "customer.age"]);
    }
}
