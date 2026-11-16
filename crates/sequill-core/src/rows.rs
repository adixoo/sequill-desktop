//! Reading and changing rows of one table by column name, with the editor's filters.
//! Values are always bound; table and column names are checked against the table first.

use crate::dump::quote_ident;
use crate::error::{Error, Result};
use crate::filter::{Filter, FilterMatch, build_where};
use crate::session::Session;
use crate::value::{CellValue, Row};
use rusqlite::params_from_iter;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// The most rows one call reads or inserts.
pub const MAX_ROWS: usize = 5_000;

/// One sort key.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
pub struct Sort {
    pub column: String,
    /// Largest first.
    #[serde(default)]
    pub desc: bool,
}

/// Which rows to read, as in the editor's table view.
#[derive(Debug, Clone, Default)]
pub struct RowQuery {
    pub filters: Vec<Filter>,
    pub matching: FilterMatch,
    pub search: String,
    pub sort: Vec<Sort>,
    pub limit: usize,
    pub offset: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundRows {
    pub columns: Vec<String>,
    pub rows: Vec<Row>,
    /// Rows matching the filters in total (not just this page).
    pub total: i64,
}

/// The columns of a table or view (hidden virtual-table columns left out).
pub fn table_columns(session: &Session, table: &str) -> Result<Vec<String>> {
    let columns: Vec<String> = session
        .connection()
        .prepare("SELECT name FROM pragma_table_xinfo(?) WHERE hidden != 1 ORDER BY cid")?
        .query_map([table], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    if columns.is_empty() {
        return Err(Error::msg(format!(
            "No table or view is called \"{table}\""
        )));
    }
    Ok(columns)
}

fn check_column(columns: &[String], column: &str) -> Result<()> {
    if columns.iter().any(|c| c == column) {
        Ok(())
    } else {
        Err(Error::msg(format!("Unknown column: {column}")))
    }
}

fn to_cell(value: &Value) -> Result<CellValue> {
    serde_json::from_value(value.clone())
        .map_err(|e| Error::msg(format!("Not a SQLite value ({value}): {e}")))
}

pub fn find_rows(session: &Session, table: &str, q: &RowQuery) -> Result<FoundRows> {
    let columns = table_columns(session, table)?;
    let filter = build_where(&columns, &q.filters, q.matching, &q.search)?;
    let mut order = Vec::new();
    for s in &q.sort {
        check_column(&columns, &s.column)?;
        order.push(format!(
            "{}{}",
            quote_ident(&s.column),
            if s.desc { " DESC" } else { "" }
        ));
    }
    let order = if order.is_empty() {
        String::new()
    } else {
        format!(" ORDER BY {}", order.join(", "))
    };
    let list = columns
        .iter()
        .map(|c| quote_ident(c))
        .collect::<Vec<_>>()
        .join(", ");
    let from = quote_ident(table);

    let total = session.count(
        &format!("SELECT count(*) FROM {from}{}", filter.sql),
        &filter.params,
    )?;
    let mut params = filter.params;
    params.push(CellValue::Integer(
        i64::try_from(q.limit.min(MAX_ROWS)).unwrap_or(0),
    ));
    params.push(CellValue::Integer(
        i64::try_from(q.offset).unwrap_or(i64::MAX),
    ));
    let sql = format!(
        "SELECT {list} FROM {from}{}{order} LIMIT ? OFFSET ?",
        filter.sql
    );
    let rows = session.query(&sql, &params, None)?.rows;
    Ok(FoundRows {
        columns,
        rows,
        total,
    })
}

/// Inserts rows given as `{column: value}` objects, all or none.
pub fn insert_rows(session: &Session, table: &str, rows: &[Map<String, Value>]) -> Result<u64> {
    if rows.is_empty() {
        return Err(Error::msg("Give at least one row"));
    }
    if rows.len() > MAX_ROWS {
        return Err(Error::msg(format!(
            "Insert at most {MAX_ROWS} rows at a time"
        )));
    }
    let columns = table_columns(session, table)?;
    let tx = session.connection().unchecked_transaction()?;
    let mut inserted = 0;
    for row in rows {
        let mut names = Vec::new();
        let mut values = Vec::new();
        for (column, value) in row {
            check_column(&columns, column)?;
            names.push(quote_ident(column));
            values.push(to_cell(value)?);
        }
        let sql = if names.is_empty() {
            format!("INSERT INTO {} DEFAULT VALUES", quote_ident(table))
        } else {
            format!(
                "INSERT INTO {} ({}) VALUES ({})",
                quote_ident(table),
                names.join(", "),
                vec!["?"; names.len()].join(", ")
            )
        };
        inserted += tx.execute(&sql, params_from_iter(&values))? as u64;
    }
    tx.commit()?;
    Ok(inserted)
}

/// The WHERE clause for a change, refusing to touch every row unless asked to.
fn change_where(
    columns: &[String],
    filters: &[Filter],
    matching: FilterMatch,
    all_rows: bool,
) -> Result<crate::filter::Where> {
    let filter = build_where(columns, filters, matching, "")?;
    if filter.sql.is_empty() && !all_rows {
        return Err(Error::msg(
            "Give at least one filter, or set all_rows to true to change every row",
        ));
    }
    Ok(filter)
}

/// Sets columns to new values on the rows matching `filters`; returns how many changed.
pub fn update_rows(
    session: &Session,
    table: &str,
    set: &Map<String, Value>,
    filters: &[Filter],
    matching: FilterMatch,
    all_rows: bool,
) -> Result<u64> {
    if set.is_empty() {
        return Err(Error::msg("Give at least one column to set"));
    }
    let columns = table_columns(session, table)?;
    let mut assignments = Vec::new();
    let mut params = Vec::new();
    for (column, value) in set {
        check_column(&columns, column)?;
        assignments.push(format!("{} = ?", quote_ident(column)));
        params.push(to_cell(value)?);
    }
    let filter = change_where(&columns, filters, matching, all_rows)?;
    params.extend(filter.params);
    let sql = format!(
        "UPDATE {} SET {}{}",
        quote_ident(table),
        assignments.join(", "),
        filter.sql
    );
    let tx = session.connection().unchecked_transaction()?;
    let changed = tx.execute(&sql, params_from_iter(&params))? as u64;
    tx.commit()?;
    Ok(changed)
}

/// Deletes the rows matching `filters`; returns how many went.
pub fn delete_rows(
    session: &Session,
    table: &str,
    filters: &[Filter],
    matching: FilterMatch,
    all_rows: bool,
) -> Result<u64> {
    let columns = table_columns(session, table)?;
    let filter = change_where(&columns, filters, matching, all_rows)?;
    let sql = format!("DELETE FROM {}{}", quote_ident(table), filter.sql);
    let tx = session.connection().unchecked_transaction()?;
    let deleted = tx.execute(&sql, params_from_iter(&filter.params))? as u64;
    tx.commit()?;
    Ok(deleted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filter::FilterOp;
    use serde_json::json;

    fn people() -> Session {
        let s = Session::memory().unwrap();
        s.connection()
            .execute_batch(
                "CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT, age INTEGER);
                 INSERT INTO people (name, age) VALUES ('Asha', 31), ('Ravi', 17), ('Meera', 45), ('Arun', 22);",
            )
            .unwrap();
        s
    }

    fn f(column: &str, op: FilterOp, value: Value) -> Filter {
        Filter {
            column: column.into(),
            op,
            value: Some(value),
            value2: None,
        }
    }

    fn obj(value: Value) -> Map<String, Value> {
        value.as_object().unwrap().clone()
    }

    #[test]
    fn finds_rows_with_filters_sort_paging_and_a_total() {
        let s = people();
        let q = RowQuery {
            filters: vec![f("age", FilterOp::Gte, json!(18))],
            sort: vec![Sort {
                column: "age".into(),
                desc: true,
            }],
            limit: 2,
            ..RowQuery::default()
        };
        let found = find_rows(&s, "people", &q).unwrap();
        assert_eq!(found.columns, ["id", "name", "age"]);
        assert_eq!(found.total, 3);
        let names: Vec<&CellValue> = found.rows.iter().map(|r| &r[1]).collect();
        assert_eq!(
            names,
            [
                &CellValue::Text("Meera".into()),
                &CellValue::Text("Asha".into())
            ]
        );

        let search = RowQuery {
            search: "ar".into(),
            limit: 10,
            ..RowQuery::default()
        };
        assert_eq!(
            find_rows(&s, "people", &search).unwrap().total,
            1,
            "Arun only"
        );
    }

    #[test]
    fn refuses_unknown_tables_columns_and_sorts() {
        let s = people();
        let q = RowQuery {
            limit: 1,
            ..RowQuery::default()
        };
        assert!(
            find_rows(&s, "nope", &q)
                .unwrap_err()
                .to_string()
                .contains("No table or view")
        );
        let bad_sort = RowQuery {
            sort: vec![Sort {
                column: "x".into(),
                desc: false,
            }],
            ..q
        };
        assert_eq!(
            find_rows(&s, "people", &bad_sort).unwrap_err().to_string(),
            "Unknown column: x"
        );
    }

    #[test]
    fn inserts_all_or_nothing() {
        let s = people();
        let added = insert_rows(
            &s,
            "people",
            &[obj(json!({"name": "Kiran", "age": 28})), obj(json!({}))],
        );
        assert_eq!(added.unwrap(), 2);
        let bad = insert_rows(
            &s,
            "people",
            &[obj(json!({"name": "Ok"})), obj(json!({"nope": 1}))],
        );
        assert_eq!(bad.unwrap_err().to_string(), "Unknown column: nope");
        assert_eq!(s.count("SELECT count(*) FROM people", &[]).unwrap(), 6);
    }

    #[test]
    fn updates_and_deletes_only_matching_rows_unless_all_rows() {
        let s = people();
        let teens = [f("age", FilterOp::Lt, json!(18))];
        let changed = update_rows(
            &s,
            "people",
            &obj(json!({"age": 18})),
            &teens,
            FilterMatch::All,
            false,
        );
        assert_eq!(changed.unwrap(), 1);
        assert!(
            update_rows(
                &s,
                "people",
                &obj(json!({"age": 1})),
                &[],
                FilterMatch::All,
                false
            )
            .is_err()
        );
        assert!(
            delete_rows(&s, "people", &[], FilterMatch::All, false)
                .unwrap_err()
                .to_string()
                .contains("all_rows")
        );

        let a_names = [f("name", FilterOp::Starts, json!("A"))];
        assert_eq!(
            delete_rows(&s, "people", &a_names, FilterMatch::All, false).unwrap(),
            2
        );
        assert_eq!(
            delete_rows(&s, "people", &[], FilterMatch::All, true).unwrap(),
            2
        );
    }
}
