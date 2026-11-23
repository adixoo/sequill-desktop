//! Sequill's SQLite engine: the same behavior as the web app's SQLite worker, on real
//! files, shared by the desktop app (`src-tauri`) and the MCP server (`sequill-mcp`).

pub mod ddl;
pub mod design;
pub mod dialects;
pub mod dump;
pub mod error;
pub mod filter;
pub mod rows;
pub mod schema;
pub mod session;
pub mod split;
pub mod sql_objects;
pub mod store;
pub mod value;

pub use error::{Error, Result};
pub use schema::Schema;
pub use session::{QueryResult, Session, SqlStatement, StatementResult};
pub use store::{
    BLANK_DESIGN, DbInfo, DesignPreview, ExternalChanges, ImportedSchema, McpActivity,
    NewMcpActivity, Store, StoredDesign, default_data_dir,
};
pub use value::{CellValue, Row};

/// The bundled SQLite library's version, such as "3.50.4".
pub fn sqlite_version() -> &'static str {
    rusqlite::version()
}
