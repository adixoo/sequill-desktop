//! Row filters and search, the same as the editor's filter builder. Mirrors `buildWhere`
//! in the web app's `src/lib/sqlite/sql.ts`: same operators, same text matching,
//! and numeric-looking text compared as a number.

use crate::dump::quote_ident;
use crate::error::{Error, Result};
use crate::value::CellValue;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// How a filter tests its column.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum FilterOp {
    /// Equals `value`.
    Eq,
    /// Does not equal `value` (NULL counts as different).
    Neq,
    /// Text contains `value`.
    Contains,
    /// Text does not contain `value`.
    NotContains,
    /// Text starts with `value`.
    Starts,
    /// Text ends with `value`.
    Ends,
    Gt,
    Gte,
    Lt,
    Lte,
    /// Between `value` and `value2`, inclusive.
    Between,
    /// One of `value`: a list, or text separated by commas.
    In,
    /// Empty text ('').
    Empty,
    /// NULL.
    Null,
    /// Not NULL.
    NotNull,
}

/// One condition on one column.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
pub struct Filter {
    /// The column to test.
    pub column: String,
    pub op: FilterOp,
    /// The value to compare with (not needed for empty, null and not_null).
    #[serde(default)]
    pub value: Option<Value>,
    /// The upper bound, for between.
    #[serde(default)]
    pub value2: Option<Value>,
}

/// Whether every filter must match, or any one of them.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum FilterMatch {
    #[default]
    All,
    Any,
}

/// A WHERE clause (with the keyword, or empty) and its bound values.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Where {
    pub sql: String,
    pub params: Vec<CellValue>,
}

/// Numeric-looking text (`12`, `-3.5`, `1e3`) as a number, so it matches columns without
/// numeric affinity too; anything else stays text. Like `coerceFilterValue` in sql.ts.
pub fn coerce_text(text: &str) -> CellValue {
    let t = text.trim();
    let mantissa_end = t.find(['e', 'E']).unwrap_or(t.len());
    let (mantissa, exponent) = t.split_at(mantissa_end);
    let mantissa = mantissa.strip_prefix(['+', '-']).unwrap_or(mantissa);
    let digits_and_dot = !mantissa.is_empty()
        && mantissa.chars().all(|c| c.is_ascii_digit() || c == '.')
        && mantissa.chars().filter(|&c| c == '.').count() <= 1
        && mantissa.chars().any(|c| c.is_ascii_digit());
    let exponent_ok = exponent.is_empty() || {
        let e = &exponent[1..];
        let e = e.strip_prefix(['+', '-']).unwrap_or(e);
        !e.is_empty() && e.chars().all(|c| c.is_ascii_digit())
    };
    if !(digits_and_dot && exponent_ok) {
        return CellValue::Text(text.to_owned());
    }
    if !t.contains(['.', 'e', 'E'])
        && let Ok(n) = t.parse::<i64>()
    {
        return CellValue::Integer(n);
    }
    t.parse::<f64>()
        .map(CellValue::Real)
        .unwrap_or_else(|_| CellValue::Text(text.to_owned()))
}

/// A filter value as a bound parameter: numbers stay numbers, numeric text becomes one.
fn coerce(value: &Value) -> Result<CellValue> {
    match value {
        Value::String(s) => Ok(coerce_text(s)),
        Value::Number(n) => Ok(n.as_i64().map_or_else(
            || CellValue::Real(n.as_f64().unwrap_or(f64::NAN)),
            CellValue::Integer,
        )),
        Value::Bool(b) => Ok(CellValue::Integer(i64::from(*b))),
        Value::Null => Ok(CellValue::Null),
        other => serde_json::from_value(other.clone())
            .map_err(|e| Error::msg(format!("A filter value is not a SQLite value: {e}"))),
    }
}

/// A filter value as text, for the LIKE operators.
fn as_text(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
    }
}

fn escape_like(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        if matches!(c, '\\' | '%' | '_') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

fn clause(filter: &Filter, params: &mut Vec<CellValue>) -> Result<Option<String>> {
    let col = quote_ident(&filter.column);
    let value = || filter.value.as_ref().unwrap_or(&Value::Null);
    let mut compare = |op: &str| -> Result<Option<String>> {
        params.push(coerce(value())?);
        Ok(Some(format!("{col} {op} ?")))
    };
    let like = |pattern: String, negate: bool, params: &mut Vec<CellValue>| {
        params.push(CellValue::Text(pattern));
        let op = if negate { "NOT LIKE" } else { "LIKE" };
        Some(format!("{col} {op} ? ESCAPE '\\'"))
    };
    let text = || escape_like(&as_text(filter.value.as_ref()));
    Ok(match filter.op {
        FilterOp::Null => Some(format!("{col} IS NULL")),
        FilterOp::NotNull => Some(format!("{col} IS NOT NULL")),
        FilterOp::Empty => Some(format!("{col} = ''")),
        FilterOp::Eq => compare("=")?,
        FilterOp::Neq => compare("IS NOT")?,
        FilterOp::Gt => compare(">")?,
        FilterOp::Gte => compare(">=")?,
        FilterOp::Lt => compare("<")?,
        FilterOp::Lte => compare("<=")?,
        FilterOp::Contains => like(format!("%{}%", text()), false, params),
        FilterOp::NotContains => like(format!("%{}%", text()), true, params),
        FilterOp::Starts => like(format!("{}%", text()), false, params),
        FilterOp::Ends => like(format!("%{}", text()), false, params),
        FilterOp::Between => {
            params.push(coerce(value())?);
            params.push(coerce(filter.value2.as_ref().unwrap_or(&Value::Null))?);
            Some(format!("{col} BETWEEN ? AND ?"))
        }
        FilterOp::In => {
            let items: Vec<CellValue> = match filter.value.as_ref() {
                Some(Value::Array(list)) => list.iter().map(coerce).collect::<Result<_>>()?,
                other => as_text(other)
                    .split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(coerce_text)
                    .collect(),
            };
            if items.is_empty() {
                return Ok(None);
            }
            let marks = vec!["?"; items.len()].join(", ");
            params.extend(items);
            Some(format!("{col} IN ({marks})"))
        }
    })
}

/// The WHERE clause for `filters` and a text `search` across every column. Column names
/// are checked against `columns`, so nothing unknown reaches the SQL.
pub fn build_where(
    columns: &[String],
    filters: &[Filter],
    matching: FilterMatch,
    search: &str,
) -> Result<Where> {
    let mut params = Vec::new();
    let mut parts = Vec::new();

    let mut filter_parts = Vec::new();
    for filter in filters {
        if !columns.contains(&filter.column) {
            return Err(Error::msg(format!("Unknown column: {}", filter.column)));
        }
        if let Some(sql) = clause(filter, &mut params)? {
            filter_parts.push(sql);
        }
    }
    if !filter_parts.is_empty() {
        let joiner = if matching == FilterMatch::Any {
            " OR "
        } else {
            " AND "
        };
        parts.push(if filter_parts.len() == 1 {
            filter_parts.remove(0)
        } else {
            format!("({})", filter_parts.join(joiner))
        });
    }

    let search = search.trim();
    if !search.is_empty() && !columns.is_empty() {
        let pattern = format!("%{}%", escape_like(search));
        let ors: Vec<String> = columns
            .iter()
            .map(|c| {
                params.push(CellValue::Text(pattern.clone()));
                format!("CAST({} AS TEXT) LIKE ? ESCAPE '\\'", quote_ident(c))
            })
            .collect();
        parts.push(format!("({})", ors.join(" OR ")));
    }

    let sql = if parts.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", parts.join(" AND "))
    };
    Ok(Where { sql, params })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn filter(column: &str, op: FilterOp, value: Value) -> Filter {
        Filter {
            column: column.into(),
            op,
            value: Some(value),
            value2: None,
        }
    }

    fn cols() -> Vec<String> {
        vec!["name".into(), "age".into()]
    }

    #[test]
    fn numeric_text_is_compared_as_a_number() {
        assert_eq!(coerce_text("42"), CellValue::Integer(42));
        assert_eq!(coerce_text(" -3.5 "), CellValue::Real(-3.5));
        assert_eq!(coerce_text("1e3"), CellValue::Real(1000.0));
        assert_eq!(coerce_text(".5"), CellValue::Real(0.5));
        for text in ["12a", "1.2.3", "", "-", "inf", "NaN", "1e", "e5"] {
            assert_eq!(coerce_text(text), CellValue::Text(text.into()), "{text}");
        }
    }

    #[test]
    fn builds_the_same_clauses_as_the_editor() {
        let w = build_where(
            &cols(),
            &[
                filter("age", FilterOp::Gte, json!("18")),
                filter("name", FilterOp::Starts, json!("A_")),
            ],
            FilterMatch::All,
            "",
        )
        .unwrap();
        assert_eq!(w.sql, r#" WHERE ("age" >= ? AND "name" LIKE ? ESCAPE '\')"#);
        assert_eq!(
            w.params,
            vec![CellValue::Integer(18), CellValue::Text("A\\_%".into())]
        );
    }

    #[test]
    fn any_match_in_lists_and_search() {
        let w = build_where(
            &cols(),
            &[
                filter("age", FilterOp::In, json!([1, "2"])),
                filter("name", FilterOp::In, json!("a, b,,")),
                Filter {
                    column: "name".into(),
                    op: FilterOp::Null,
                    value: None,
                    value2: None,
                },
            ],
            FilterMatch::Any,
            "x",
        )
        .unwrap();
        assert_eq!(
            w.sql,
            r#" WHERE ("age" IN (?, ?) OR "name" IN (?, ?) OR "name" IS NULL) AND (CAST("name" AS TEXT) LIKE ? ESCAPE '\' OR CAST("age" AS TEXT) LIKE ? ESCAPE '\')"#
        );
        assert_eq!(w.params.len(), 6);
    }

    #[test]
    fn empty_in_lists_are_skipped_and_unknown_columns_refused() {
        let w = build_where(
            &cols(),
            &[filter("age", FilterOp::In, json!(""))],
            FilterMatch::All,
            "",
        )
        .unwrap();
        assert_eq!(w, Where::default());
        let error = build_where(
            &cols(),
            &[filter("nope", FilterOp::Eq, json!(1))],
            FilterMatch::All,
            "",
        );
        assert_eq!(error.unwrap_err().to_string(), "Unknown column: nope");
    }
}
