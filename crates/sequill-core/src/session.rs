//! Runs SQL against one open database. Mirrors the web app's `src/shared/lib/sqlite/session.ts`,
//! so the desktop app behaves the same as the browser build.

use crate::dump::dump_database;
use crate::error::{Error, Result};
use crate::schema::{Schema, read_schema};
use crate::split::split_statements;
use crate::value::{CellValue, Row};
use rusqlite::{Connection, OpenFlags, params_from_iter};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{Duration, Instant};

/// How long a call waits for another process (such as the MCP server) to finish writing.
pub const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Row>,
    /// Rows changed by the statement (0 for reads).
    pub changes: u64,
    pub duration_ms: f64,
    /// True when rows were cut at the requested limit.
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatementResult {
    pub sql: String,
    #[serde(flatten)]
    pub result: QueryResult,
    /// Set when the statement failed; later statements were not run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SqlStatement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<CellValue>,
}

pub struct Session {
    conn: Connection,
}

impl Session {
    pub fn new(conn: Connection) -> Result<Self> {
        conn.busy_timeout(BUSY_TIMEOUT)?;
        conn.execute_batch("PRAGMA foreign_keys = ON")?;
        Ok(Self { conn })
    }

    /// Opens (creating if needed) a database file for reading and writing.
    pub fn open(path: &Path) -> Result<Self> {
        Self::new(Connection::open(path)?)
    }

    /// Opens an existing database file for reading and writing; a missing file is an error
    /// (never a new, empty database).
    pub fn open_existing(path: &Path) -> Result<Self> {
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_URI
            | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        Self::new(Connection::open_with_flags(path, flags)?)
    }

    /// Opens a database file so that SQLite itself refuses every write.
    pub fn open_read_only(path: &Path) -> Result<Self> {
        let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        Self::new(Connection::open_with_flags(path, flags)?)
    }

    pub fn memory() -> Result<Self> {
        Self::new(Connection::open_in_memory()?)
    }

    pub fn connection(&self) -> &Connection {
        &self.conn
    }

    /// Runs one statement and returns at most `limit` rows.
    pub fn query(
        &self,
        sql: &str,
        params: &[CellValue],
        limit: Option<usize>,
    ) -> Result<QueryResult> {
        let started = Instant::now();
        let mut stmt = self.conn.prepare(sql)?;
        let columns: Vec<String> = stmt.column_names().map(str::to_owned).collect();
        let readonly = stmt.readonly();
        let limit = limit.unwrap_or(usize::MAX);
        let mut rows = Vec::new();
        let mut truncated = false;
        {
            // Like the browser build, no parameters means "leave them NULL" rather than an error.
            let mut cursor = if params.is_empty() {
                stmt.raw_query()
            } else {
                stmt.query(params_from_iter(params))?
            };
            while let Some(row) = cursor.next()? {
                if rows.len() >= limit {
                    truncated = true;
                    break;
                }
                let values = (0..columns.len())
                    .map(|i| row.get_ref(i).map(CellValue::from))
                    .collect::<rusqlite::Result<Row>>()?;
                rows.push(values);
            }
        }
        Ok(QueryResult {
            columns,
            rows,
            changes: if readonly { 0 } else { self.conn.changes() },
            duration_ms: started.elapsed().as_secs_f64() * 1000.0,
            truncated,
        })
    }

    /// Runs a multi-statement script and reports every statement. Stops at the first error.
    pub fn exec_script(&self, script: &str, row_limit: usize) -> Vec<StatementResult> {
        let mut results = Vec::new();
        for sql in split_statements(script) {
            let started = Instant::now();
            match self.query(&sql, &[], Some(row_limit)) {
                Ok(result) => results.push(StatementResult {
                    sql,
                    result,
                    error: None,
                }),
                Err(error) => {
                    results.push(failed(sql, started, &error));
                    break;
                }
            }
        }
        results
    }

    /// EXPLAIN QUERY PLAN for every statement in a script. Nothing is executed.
    pub fn explain_script(&self, script: &str) -> Vec<StatementResult> {
        split_statements(script)
            .into_iter()
            .map(|sql| {
                let started = Instant::now();
                match self.query(&format!("EXPLAIN QUERY PLAN {sql}"), &[], None) {
                    Ok(result) => StatementResult {
                        sql,
                        result,
                        error: None,
                    },
                    Err(error) => failed(sql, started, &error),
                }
            })
            .collect()
    }

    /// Runs statements atomically; returns the total number of changed rows.
    pub fn transaction(&self, statements: &[SqlStatement]) -> Result<u64> {
        let tx = self.conn.unchecked_transaction()?;
        let mut changes = 0;
        for s in statements {
            changes += self.query(&s.sql, &s.params, None)?.changes;
        }
        tx.commit()?;
        Ok(changes)
    }

    /// Applies schema changes (renames, drops, table rebuilds) in one transaction with
    /// foreign keys paused, as SQLite requires for rebuilds. Rolls back if the result has
    /// more broken foreign-key references than before.
    pub fn apply_design(&self, statements: &[String]) -> Result<()> {
        self.run_design(statements, true)
    }

    /// Runs a design exactly like `apply_design`, then undoes it: Ok when saving would work.
    pub fn check_design(&self, statements: &[String]) -> Result<()> {
        self.run_design(statements, false)
    }

    fn run_design(&self, statements: &[String], keep: bool) -> Result<()> {
        self.conn.execute_batch("PRAGMA foreign_keys = OFF")?;
        let applied = self.run_design_unchecked(statements, keep);
        let restored = self
            .conn
            .execute_batch("PRAGMA legacy_alter_table = OFF; PRAGMA foreign_keys = ON");
        applied?;
        Ok(restored?)
    }

    fn run_design_unchecked(&self, statements: &[String], keep: bool) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        let before = self.foreign_key_violations()?;
        for sql in statements {
            self.conn.execute_batch(sql)?;
        }
        let added = self.foreign_key_violations()?.saturating_sub(before);
        if added > 0 {
            let rows = if added == 1 { "row" } else { "rows" };
            return Err(Error::msg(format!(
                "Saving would leave {added} {rows} pointing at missing rows (foreign keys). Nothing was changed."
            )));
        }
        if keep {
            tx.commit()?;
        }
        Ok(())
    }

    /// Counts every change to the database's structure (SQLite's schema cookie), whichever
    /// connection or process made it.
    pub fn schema_version(&self) -> Result<i64> {
        Ok(self
            .conn
            .query_row("PRAGMA schema_version", [], |r| r.get(0))?)
    }

    /// A new in-memory database with this one's structure (tables, indexes, views, triggers)
    /// and none of its rows, so it stays small however big this one is.
    pub fn schema_only_copy(&self) -> Result<Session> {
        // Skips what gets made by itself: SQLite's internal tables and virtual tables' shadow tables.
        let mut pending: Vec<String> = self
            .conn
            .prepare(
                "SELECT sql FROM sqlite_schema
                 WHERE sql IS NOT NULL AND substr(name, 1, 7) <> 'sqlite_'
                   AND name NOT IN (SELECT name FROM pragma_table_list
                                    WHERE schema = 'main' AND type = 'shadow')
                 ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END, rowid",
            )?
            .query_map([], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        let copy = Session::memory()?;
        // A view can use one made after it (after a rebuild): retry until nothing more works.
        while !pending.is_empty() {
            let before = pending.len();
            let mut failed = Vec::new();
            let mut last_error = None;
            for sql in pending {
                if let Err(error) = copy.conn.execute_batch(&sql) {
                    failed.push(sql);
                    last_error = Some(error);
                }
            }
            if failed.len() == before {
                let error = Error::from(last_error.expect("a statement failed"));
                return Err(Error::msg(format!(
                    "Sequill could not copy this database's structure to check the design ({error})"
                )));
            }
            pending = failed;
        }
        Ok(copy)
    }

    fn foreign_key_violations(&self) -> Result<usize> {
        Ok(self
            .query("PRAGMA foreign_key_check", &[], None)?
            .rows
            .len())
    }

    /// Inserts many rows with one prepared statement inside one transaction.
    pub fn insert_many(&self, sql: &str, rows: &[Row]) -> Result<u64> {
        let tx = self.conn.unchecked_transaction()?;
        let mut inserted = 0;
        {
            let mut stmt = tx.prepare(sql)?;
            for row in rows {
                stmt.execute(params_from_iter(row))?;
                inserted += 1;
            }
        }
        tx.commit()?;
        Ok(inserted)
    }

    /// The first cell of the first row as a number (for `SELECT count(*) …`).
    pub fn count(&self, sql: &str, params: &[CellValue]) -> Result<i64> {
        let result = self.query(sql, params, Some(1))?;
        Ok(match result.rows.first().and_then(|r| r.first()) {
            Some(CellValue::Integer(n)) => *n,
            Some(CellValue::Real(n)) => *n as i64,
            Some(CellValue::Text(t)) => t.trim().parse().unwrap_or(0),
            _ => 0,
        })
    }

    pub fn schema(&self) -> Result<Schema> {
        read_schema(&self.conn)
    }

    pub fn dump(&self) -> Result<String> {
        dump_database(&self.conn)
    }

    pub fn size_bytes(&self) -> Result<u64> {
        let pages: i64 = self.conn.query_row("PRAGMA page_count", [], |r| r.get(0))?;
        let page_size: i64 = self.conn.query_row("PRAGMA page_size", [], |r| r.get(0))?;
        Ok(u64::try_from(pages * page_size).unwrap_or(0))
    }

    /// Changes whenever another connection commits to this database.
    pub fn data_version(&self) -> Result<i64> {
        Ok(self
            .conn
            .query_row("PRAGMA data_version", [], |r| r.get(0))?)
    }
}

/// The schema designer's structure-only copy of a database. Designs are checked on it, so the
/// database itself is only touched when the user saves.
pub struct DesignCopy {
    base: Option<i64>,
    session: Session,
}

impl DesignCopy {
    /// A copy of `source`'s structure, remembering which version of it was copied.
    pub fn of(source: &Session) -> Result<Self> {
        Ok(Self {
            base: Some(source.schema_version()?),
            session: source.schema_only_copy()?,
        })
    }

    /// An empty database, for a design that will become a new one.
    pub fn empty() -> Result<Self> {
        Ok(Self {
            base: None,
            session: Session::memory()?,
        })
    }

    /// The structure version this copy was made from; None for an empty one.
    pub fn base(&self) -> Option<i64> {
        self.base
    }

    /// Runs the design on the copy and undoes it: Ok when saving it would work.
    pub fn check(&self, statements: &[String]) -> Result<()> {
        self.session.check_design(statements)
    }
}

fn failed(sql: String, started: Instant, error: &Error) -> StatementResult {
    StatementResult {
        sql,
        result: QueryResult {
            columns: Vec::new(),
            rows: Vec::new(),
            changes: 0,
            duration_ms: started.elapsed().as_secs_f64() * 1000.0,
            truncated: false,
        },
        error: Some(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(sql: &str) -> Session {
        let s = Session::memory().unwrap();
        s.connection().execute_batch(sql).unwrap();
        s
    }

    fn count(s: &Session, table: &str) -> i64 {
        s.count(&format!("SELECT count(*) FROM {table}"), &[])
            .unwrap()
    }

    #[test]
    fn exec_script_reports_each_statement_and_stops_at_the_first_error() {
        let s = session("");
        let results = s.exec_script(
            "CREATE TABLE t(a); INSERT INTO t VALUES (1),(2); SELECT * FROM t; SELECT * FROM nope; SELECT 1;",
            100,
        );
        assert_eq!(results.len(), 4);
        assert_eq!(results[1].result.changes, 2);
        assert_eq!(
            results[2].result.rows,
            vec![vec![CellValue::Integer(1)], vec![CellValue::Integer(2)]]
        );
        let error = results[3].error.as_deref().unwrap();
        assert_eq!(error, "no such table: nope", "no codes or echoed SQL");
    }

    #[test]
    fn explain_script_plans_every_statement_without_running_it() {
        let s = session("CREATE TABLE t(a);");
        let plans =
            s.explain_script("SELECT * FROM t WHERE a = 1; DELETE FROM t; SELECT * FROM nope;");
        assert_eq!(plans.len(), 3);
        assert!(plans[0].result.columns.contains(&"detail".to_owned()));
        assert!(plans[2].error.as_deref().unwrap().contains("no such table"));
        assert_eq!(count(&s, "t"), 0);
    }

    #[test]
    fn query_honours_the_row_limit() {
        let s = session("CREATE TABLE t(a); INSERT INTO t VALUES (1),(2),(3);");
        let r = s.query("SELECT a FROM t", &[], Some(2)).unwrap();
        assert_eq!(r.rows.len(), 2);
        assert!(r.truncated);
        let all = s.query("SELECT a FROM t", &[], None).unwrap();
        assert_eq!(all.rows.len(), 3);
        assert!(!all.truncated);
    }

    #[test]
    fn query_binds_parameters_and_reports_changes() {
        let s = session("CREATE TABLE t(a, b);");
        let r = s
            .query(
                "INSERT INTO t VALUES (?, ?)",
                &[CellValue::Integer(1), CellValue::Blob(vec![0xca, 0xfe])],
                None,
            )
            .unwrap();
        assert_eq!(r.changes, 1);
        assert!(r.columns.is_empty());
        let read = s
            .query(
                "SELECT b FROM t WHERE a = ?",
                &[CellValue::Integer(1)],
                None,
            )
            .unwrap();
        assert_eq!(read.rows, vec![vec![CellValue::Blob(vec![0xca, 0xfe])]]);
        assert_eq!(read.changes, 0);
    }

    #[test]
    fn missing_parameters_bind_as_null() {
        let s = session("");
        let r = s.query("SELECT ? IS NULL", &[], None).unwrap();
        assert_eq!(r.rows, vec![vec![CellValue::Integer(1)]]);
    }

    #[test]
    fn transaction_rolls_back_on_error() {
        let s = session("CREATE TABLE t(a UNIQUE);");
        let insert = |v| SqlStatement {
            sql: "INSERT INTO t VALUES (?)".into(),
            params: vec![CellValue::Integer(v)],
        };
        assert!(s.transaction(&[insert(1), insert(1)]).is_err());
        assert_eq!(count(&s, "t"), 0);
        assert_eq!(s.transaction(&[insert(1), insert(2)]).unwrap(), 2);
    }

    #[test]
    fn insert_many_inserts_in_one_transaction() {
        let s = session("CREATE TABLE t(a, b);");
        let rows: Vec<Row> = (0..500)
            .map(|i| vec![CellValue::Integer(i), CellValue::Text(format!("v{i}"))])
            .collect();
        assert_eq!(
            s.insert_many("INSERT INTO t VALUES (?, ?)", &rows).unwrap(),
            500
        );
        assert_eq!(count(&s, "t"), 500);
    }

    #[test]
    fn apply_design_rolls_back_when_it_would_break_foreign_keys() {
        let s = session(
            "CREATE TABLE parent (id INTEGER PRIMARY KEY);
             CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
             INSERT INTO parent VALUES (1); INSERT INTO child VALUES (1, 1);",
        );
        let error = s.apply_design(&["DELETE FROM parent".into()]).unwrap_err();
        assert!(error.to_string().contains("1 row pointing at missing rows"));
        assert_eq!(count(&s, "parent"), 1);
        let fk: i64 = s
            .connection()
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1, "foreign keys are back on after a failed design");

        s.apply_design(&["ALTER TABLE child RENAME TO kid".into()])
            .unwrap();
        assert_eq!(count(&s, "kid"), 1);
    }

    #[test]
    fn read_only_sessions_refuse_writes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.sqlite3");
        Session::open(&path)
            .unwrap()
            .connection()
            .execute_batch("CREATE TABLE t(a)")
            .unwrap();
        let ro = Session::open_read_only(&path).unwrap();
        assert!(ro.query("INSERT INTO t VALUES (1)", &[], None).is_err());
        assert_eq!(count(&ro, "t"), 0);
    }

    fn schema_sql(s: &Session) -> Vec<String> {
        s.connection()
            .prepare("SELECT type || ' ' || name || ': ' || sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type, name")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap()
    }

    #[test]
    fn schema_only_copy_has_the_structure_and_no_rows() {
        let s = session(
            "CREATE TABLE parent (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE);
             CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
             CREATE INDEX child_parent ON child (parent_id);
             CREATE VIEW names AS SELECT name FROM parent;
             CREATE TRIGGER no_empty BEFORE INSERT ON parent WHEN new.name = '' BEGIN SELECT RAISE(ABORT, 'empty'); END;
             CREATE VIRTUAL TABLE docs USING fts5(body);
             INSERT INTO parent (name) VALUES ('a'), ('b'); INSERT INTO child VALUES (1, 1);
             INSERT INTO docs VALUES ('hello');",
        );
        // A view that uses a view made after it, as a table rebuild leaves them.
        s.connection()
            .execute_batch(
                "CREATE VIEW late AS SELECT 1 AS x; CREATE VIEW early AS SELECT x FROM late;
                 DROP VIEW late; CREATE VIEW late AS SELECT 2 AS x;",
            )
            .unwrap();
        let copy = s.schema_only_copy().unwrap();
        assert_eq!(schema_sql(&copy), schema_sql(&s));
        for table in ["parent", "child", "docs"] {
            assert_eq!(count(&copy, table), 0, "{table}");
        }
        assert_eq!(count(&s, "parent"), 2, "the source keeps its rows");
    }

    #[test]
    fn check_design_reports_errors_and_changes_nothing() {
        let s = session("CREATE TABLE t (a); INSERT INTO t VALUES (1);");
        s.check_design(&["ALTER TABLE t ADD COLUMN b".into()])
            .unwrap();
        assert_eq!(s.schema().unwrap().tables[0].columns.len(), 1);
        let error = s
            .check_design(&["ALTER TABLE t DROP COLUMN nope".into()])
            .unwrap_err();
        assert!(error.to_string().contains("nope"), "{error}");
        let version = s.schema_version().unwrap();
        s.apply_design(&["ALTER TABLE t ADD COLUMN b".into()])
            .unwrap();
        assert_ne!(s.schema_version().unwrap(), version);
    }

    #[test]
    fn open_existing_never_creates_a_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("missing.db");
        assert!(Session::open_existing(&path).is_err());
        assert!(!path.exists());
    }
}
