//! A table's columns and sort keys, as the editor's table view uses them.

use crate::error::{Error, Result};
use crate::session::Session;
use serde::{Deserialize, Serialize};

/// One sort key.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
pub struct Sort {
    pub column: String,
    /// Largest first.
    #[serde(default)]
    pub desc: bool,
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
