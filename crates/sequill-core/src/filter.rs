//! Row filters, the same as the editor's filter builder. The app builds the SQL for them
//! (`buildWhere` in `src/lib/sqlite/sql.ts`); these types are the MCP input schema.

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
