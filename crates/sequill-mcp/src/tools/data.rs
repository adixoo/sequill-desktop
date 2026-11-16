//! Finding, adding, changing and deleting rows, with the editor's filters.

use super::{DEFAULT_MAX_ROWS, MAX_ROWS_LIMIT, open_db, to_json};
use sequill_core::Result;
use sequill_core::filter::{Filter, FilterMatch};
use sequill_core::rows::{self, RowQuery, Sort};
use serde_json::{Map, Value, json};
use std::path::Path;

/// Rows of a table or view, filtered, searched and sorted like the editor's table view.
#[allow(clippy::too_many_arguments)]
pub fn find_rows(
    dir: &Path,
    database: &str,
    table: &str,
    filters: Vec<Filter>,
    matching: FilterMatch,
    search: Option<String>,
    sort: Vec<Sort>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Value> {
    let db = open_db(dir, database, false)?;
    let query = RowQuery {
        filters,
        matching,
        search: search.unwrap_or_default(),
        sort,
        limit: limit.unwrap_or(DEFAULT_MAX_ROWS).min(MAX_ROWS_LIMIT),
        offset: offset.unwrap_or(0),
    };
    Ok(to_json(rows::find_rows(&db.session, table, &query)?))
}

pub fn insert_rows(
    dir: &Path,
    database: &str,
    table: &str,
    rows: &[Map<String, Value>],
) -> Result<Value> {
    let db = open_db(dir, database, true)?;
    let inserted = rows::insert_rows(&db.session, table, rows)?;
    db.record_write()?;
    Ok(json!({ "inserted": inserted }))
}

pub fn update_rows(
    dir: &Path,
    database: &str,
    table: &str,
    set: &Map<String, Value>,
    filters: &[Filter],
    matching: FilterMatch,
    all_rows: bool,
) -> Result<Value> {
    let db = open_db(dir, database, true)?;
    let changed = rows::update_rows(&db.session, table, set, filters, matching, all_rows)?;
    db.record_write()?;
    Ok(json!({ "changed": changed }))
}

pub fn delete_rows(
    dir: &Path,
    database: &str,
    table: &str,
    filters: &[Filter],
    matching: FilterMatch,
    all_rows: bool,
) -> Result<Value> {
    let db = open_db(dir, database, true)?;
    let deleted = rows::delete_rows(&db.session, table, filters, matching, all_rows)?;
    db.record_write()?;
    Ok(json!({ "deleted": deleted }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::test_support::store_with_shop;
    use sequill_core::filter::FilterOp;

    fn city(name: &str) -> Vec<Filter> {
        vec![Filter {
            column: "city".into(),
            op: FilterOp::Eq,
            value: Some(json!(name)),
            value2: None,
        }]
    }

    #[test]
    fn finds_edits_and_deletes_rows() {
        let (dir, id) = store_with_shop();
        let delhi = find_rows(
            dir.path(),
            &id,
            "customer",
            city("Delhi"),
            FilterMatch::All,
            None,
            vec![Sort {
                column: "name".into(),
                desc: false,
            }],
            None,
            None,
        )
        .unwrap();
        assert_eq!(delhi["total"], 2);
        assert_eq!(delhi["rows"][0][1], "Asha");

        let rows = vec![
            json!({"name": "Kiran", "city": "Delhi"})
                .as_object()
                .unwrap()
                .clone(),
        ];
        assert_eq!(
            insert_rows(dir.path(), &id, "customer", &rows).unwrap()["inserted"],
            1
        );
        let set = json!({"city": "New Delhi"}).as_object().unwrap().clone();
        let changed = update_rows(
            dir.path(),
            &id,
            "customer",
            &set,
            &city("Delhi"),
            FilterMatch::All,
            false,
        );
        assert_eq!(changed.unwrap()["changed"], 3);
        let deleted = delete_rows(
            dir.path(),
            &id,
            "customer",
            &city("Pune"),
            FilterMatch::All,
            false,
        );
        assert_eq!(deleted.unwrap()["deleted"], 1);
    }

    #[test]
    fn changing_every_row_needs_all_rows() {
        let (dir, id) = store_with_shop();
        let error = delete_rows(dir.path(), &id, "customer", &[], FilterMatch::All, false);
        assert!(error.unwrap_err().to_string().contains("all_rows"));
    }
}
