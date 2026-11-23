//! The databases Sequill knows: files it keeps in a data directory, and files the user
//! opened from their computer, which are edited where they are (never copied). A small
//! catalog database keeps their display names. Mirrors the web worker's OPFS catalog
//! (`src/lib/sqlite/worker.ts`), with real files that other processes (the MCP
//! server) can open too.

use crate::dialects;
use crate::error::{Error, Result};
use crate::session::DesignCopy;
use crate::session::Session;
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Must equal `identifier` in `src-tauri/tauri.conf.json`.
pub const APP_IDENTIFIER: &str = "com.adibitz.sequill";
const CATALOG_FILE: &str = "catalog.sqlite3";
const DATABASES_DIR: &str = "databases";
const DB_FILE_PREFIX: &str = "db-";
const DB_FILE_SUFFIX: &str = ".sqlite3";
/// Whether AI assistants may use the databases over MCP ("1" or "0"); off until turned on.
const MCP_ENABLED_KEY: &str = "mcp_enabled";
/// Whether assistants may also change data, schema and databases ("1" or "0"); off until
/// turned on. Checked by the MCP server on every call that changes something.
const MCP_CHANGES_KEY: &str = "mcp_allow_changes";
/// Requests to show something older than this are dropped unseen.
const UI_REQUEST_MAX_AGE_MS: i64 = 10_000;
/// How many days the record of what assistants did over MCP is kept; "0" keeps it forever.
const MCP_HISTORY_DAYS_KEY: &str = "mcp_history_days";
pub const DEFAULT_MCP_HISTORY_DAYS: u32 = 7;
/// Longest SQL or details text kept for one call, so a huge insert can't bloat the catalog.
const MCP_ACTIVITY_TEXT_LIMIT: usize = 20_000;
const DAY_MS: i64 = 24 * 60 * 60 * 1000;
const SQLITE_HEADER: &[u8] = b"SQLite format 3\0";
const STRUCTURE_CHANGED: &str = "The database's structure changed since your design was checked (another app or an assistant changed it). Nothing was saved; review the changes and save again.";

/// Where the app and the MCP server keep databases unless told otherwise.
pub fn default_data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|dir| dir.join(APP_IDENTIFIER))
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DbInfo {
    pub id: String,
    pub name: String,
    pub size_bytes: u64,
    pub created_at: i64,
    pub updated_at: i64,
    /// The file on the user's computer that is edited in place; None when Sequill keeps the
    /// file in its data folder.
    pub path: Option<String>,
}

/// A query saved by name, shared by every database.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SavedQuery {
    pub id: String,
    pub name: String,
    pub sql: String,
    pub updated_at: i64,
}

fn required_name(name: &str) -> Result<&str> {
    let name = name.trim();
    if name.is_empty() {
        Err(Error::msg("The name is empty"))
    } else {
        Ok(name)
    }
}

/// The schema designer's unsaved design for one database (or "blank"), as stored.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct StoredDesign {
    /// A database id, or [`BLANK_DESIGN`].
    pub key: String,
    /// The draft as JSON (see [`crate::design::Draft`]).
    pub draft: serde_json::Value,
    /// Goes up by one on every save, so a save based on an older read can be refused.
    pub version: i64,
}

/// What `import_schema` made, and what it left out (such as "CREATE FUNCTION (2)").
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportedSchema {
    pub database: DbInfo,
    pub skipped: Vec<String>,
}

/// The key of the design that isn't tied to a database (it becomes a new one).
pub const BLANK_DESIGN: &str = "blank";

/// What other processes changed since the last check.
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExternalChanges {
    /// The list of databases (names, sizes, times) changed.
    pub catalog: bool,
    /// The open database's data or schema changed.
    pub database: Option<String>,
}

/// The result of checking a schema design on a copy of the database's structure.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesignPreview {
    /// The structure version the design was checked against (None for a blank design); pass
    /// it to `apply_design` so a save refuses if the database changed in between.
    pub base: Option<i64>,
    /// Why saving the design would fail; None when every statement ran.
    pub error: Option<String>,
}

impl ExternalChanges {
    pub fn any(&self) -> bool {
        self.catalog || self.database.is_some()
    }
}

struct OpenDb {
    id: String,
    session: Session,
    data_version: i64,
}

pub struct Store {
    dir: PathBuf,
    catalog: Connection,
    catalog_version: i64,
    current: Option<OpenDb>,
    /// The schema designer's structure-only copy of a database (None for a blank design),
    /// kept while that database's structure is unchanged.
    design: Option<(Option<String>, DesignCopy)>,
}

/// SQLite integers are signed; no file comes close to the limit.
fn sql_size(size: u64) -> i64 {
    i64::try_from(size).unwrap_or(i64::MAX)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
}

/// Ids name files, so only canonical UUIDs are accepted (no paths sneak in).
fn check_id(id: &str) -> Result<()> {
    match uuid::Uuid::parse_str(id) {
        Ok(uuid) if uuid.hyphenated().to_string() == id => Ok(()),
        _ => Err(Error::msg("That database no longer exists")),
    }
}

fn id_from_file_name(name: &str) -> Option<&str> {
    let id = name
        .strip_prefix(DB_FILE_PREFIX)?
        .strip_suffix(DB_FILE_SUFFIX)?;
    check_id(id).ok().map(|()| id)
}

fn data_version(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row("PRAGMA data_version", [], |r| r.get(0))?)
}

fn to_info(row: &rusqlite::Row) -> rusqlite::Result<DbInfo> {
    Ok(DbInfo {
        id: row.get("id")?,
        name: row.get("name")?,
        size_bytes: u64::try_from(row.get::<_, i64>("size")?).unwrap_or(0),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        path: row.get("path")?,
    })
}

/// Adds the `path` column to catalogs made before files could be opened in place. Inside an
/// immediate transaction, so the app and the MCP server can't both add it.
fn migrate_catalog(catalog: &mut Connection) -> Result<()> {
    let tx = catalog.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let has_path: bool = tx.query_row(
        "SELECT count(*) > 0 FROM pragma_table_info('databases') WHERE name = 'path'",
        [],
        |r| r.get(0),
    )?;
    if !has_path {
        tx.execute_batch("ALTER TABLE databases ADD COLUMN path TEXT")?;
    }
    tx.execute_batch("CREATE UNIQUE INDEX IF NOT EXISTS databases_path ON databases (path)")?;
    Ok(tx.commit()?)
}

/// `fs::canonicalize` gives `\\?\C:\…` on Windows; people know the file as `C:\…`.
fn plain_path(path: PathBuf) -> PathBuf {
    #[cfg(windows)]
    if let Some(rest) = path.to_str().and_then(|p| p.strip_prefix(r"\\?\")) {
        if !rest.starts_with(r"UNC\") {
            return PathBuf::from(rest);
        }
    }
    path
}

fn not_sqlite(detail: &str) -> Error {
    Error::msg(format!(
        "This file does not look like a SQLite database ({detail})"
    ))
}

/// Whether a file on the user's computer is a SQLite database. An empty file counts: SQLite
/// treats it as an empty database.
fn check_database_file(path: &Path) -> Result<()> {
    let mut header = Vec::with_capacity(SQLITE_HEADER.len());
    let file = fs::File::open(path)?;
    std::io::Read::read_to_end(
        &mut std::io::Read::take(file, SQLITE_HEADER.len() as u64),
        &mut header,
    )?;
    if header.is_empty() {
        return Ok(());
    }
    if header != SQLITE_HEADER {
        return Err(not_sqlite("it has no SQLite header"));
    }
    Session::open_read_only(path)
        .and_then(|s| s.count("SELECT count(*) FROM sqlite_schema", &[]))
        .map(|_| ())
        .map_err(|e| not_sqlite(&e.to_string()))
}

impl Store {
    /// Opens the store as its owner (the app): also repairs the catalog after crashes.
    pub fn open(dir: &Path) -> Result<Self> {
        let store = Self::open_shared(dir)?;
        store.reconcile()?;
        store.prune_mcp_activity()?;
        Ok(store)
    }

    /// Opens the store alongside its owner (the MCP server): never repairs the catalog,
    /// so it can't race the app while it is importing a file.
    pub fn open_shared(dir: &Path) -> Result<Self> {
        fs::create_dir_all(dir.join(DATABASES_DIR))?;
        let mut catalog = Connection::open(dir.join(CATALOG_FILE))?;
        catalog.busy_timeout(crate::session::BUSY_TIMEOUT)?;
        catalog.execute_batch(
            "CREATE TABLE IF NOT EXISTS databases (
               id TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0,
               created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
             CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS saved_queries (
               id TEXT PRIMARY KEY, name TEXT NOT NULL, sql TEXT NOT NULL, updated_at INTEGER NOT NULL);
             CREATE TABLE IF NOT EXISTS ui_requests (
               id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, created_at INTEGER NOT NULL);
             CREATE TABLE IF NOT EXISTS mcp_activity (
               id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, tool TEXT NOT NULL,
               database_id TEXT, database_name TEXT, sql TEXT, details TEXT,
               ok INTEGER NOT NULL, message TEXT);
             CREATE INDEX IF NOT EXISTS mcp_activity_at ON mcp_activity (at);
             CREATE TABLE IF NOT EXISTS designs (
               key TEXT PRIMARY KEY, draft TEXT NOT NULL, version INTEGER NOT NULL);",
        )?;
        migrate_catalog(&mut catalog)?;
        let catalog_version = data_version(&catalog)?;
        Ok(Self {
            dir: dir.to_owned(),
            catalog,
            catalog_version,
            current: None,
            design: None,
        })
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// The file of a database in the catalog: the user's own file for one opened in place.
    pub fn path(&self, id: &str) -> Result<PathBuf> {
        check_id(id)?;
        let Some(path) = self.info(id)?.path else {
            return Ok(self.managed_file(id));
        };
        let path = PathBuf::from(path);
        if !path.is_file() {
            return Err(Error::msg(format!(
                "The file {} is missing. It may have been moved, renamed or deleted; open it again from where it is now.",
                path.display()
            )));
        }
        Ok(path)
    }

    /// Where Sequill keeps a database it manages itself.
    fn managed_file(&self, id: &str) -> PathBuf {
        self.dir
            .join(DATABASES_DIR)
            .join(format!("{DB_FILE_PREFIX}{id}{DB_FILE_SUFFIX}"))
    }

    /// Keeps the catalog and the files in sync after crashes or interrupted imports. Files
    /// opened in place are left alone: a missing one is reported when it is opened.
    fn reconcile(&self) -> Result<()> {
        let mut files = Vec::new();
        for entry in fs::read_dir(self.dir.join(DATABASES_DIR))? {
            let name = entry?.file_name();
            if let Some(id) = name.to_str().and_then(id_from_file_name) {
                files.push(id.to_owned());
            }
        }
        let known: Vec<String> = self
            .catalog
            .prepare("SELECT id FROM databases WHERE path IS NULL")?
            .query_map([], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        let now = now_ms();
        for id in files.iter().filter(|id| !known.contains(id)) {
            let size = fs::metadata(self.managed_file(id)).map_or(0, |m| m.len());
            self.catalog.execute(
                "INSERT INTO databases (id, name, size, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                params![id, format!("Recovered {}", &id[..8]), sql_size(size), now, now],
            )?;
        }
        for id in known.iter().filter(|id| !files.contains(id)) {
            self.catalog
                .execute("DELETE FROM databases WHERE id = ?", [id])?;
        }
        Ok(())
    }

    pub fn list(&self) -> Result<Vec<DbInfo>> {
        Ok(self
            .catalog
            .prepare("SELECT * FROM databases ORDER BY updated_at DESC")?
            .query_map([], to_info)?
            .collect::<rusqlite::Result<_>>()?)
    }

    pub fn info(&self, id: &str) -> Result<DbInfo> {
        self.catalog
            .query_row("SELECT * FROM databases WHERE id = ?", [id], to_info)
            .optional()?
            .ok_or_else(|| Error::msg("That database no longer exists"))
    }

    /// Finds a database by id, or by a name that only one database has (any case).
    pub fn resolve(&self, id_or_name: &str) -> Result<DbInfo> {
        if let Ok(info) = self.info(id_or_name) {
            return Ok(info);
        }
        let wanted = id_or_name.trim().to_lowercase();
        let matches: Vec<DbInfo> = self
            .list()?
            .into_iter()
            .filter(|d| d.name.to_lowercase() == wanted)
            .collect();
        match matches.len() {
            1 => Ok(matches.into_iter().next().expect("one match")),
            0 => Err(Error::msg(format!(
                "No database is called \"{id_or_name}\""
            ))),
            n => Err(Error::msg(format!(
                "{n} databases are called \"{id_or_name}\"; use an id instead: {}",
                matches
                    .iter()
                    .map(|d| d.id.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            ))),
        }
    }

    fn register(&self, id: &str, name: &str, size: u64) -> Result<DbInfo> {
        let now = now_ms();
        self.catalog.execute(
            "INSERT INTO databases (id, name, size, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            params![id, name, sql_size(size), now, now],
        )?;
        self.info(id)
    }

    pub fn create(&mut self, name: &str, seed_sql: Option<&str>) -> Result<DbInfo> {
        let id = uuid::Uuid::new_v4().to_string();
        let path = self.managed_file(&id);
        let created = (|| {
            let session = Session::open(&path)?;
            if let Some(sql) = seed_sql {
                session.connection().execute_batch(sql)?;
            }
            session.size_bytes()
        })();
        match created {
            Ok(size) => self.register(&id, name, size),
            Err(error) => {
                remove_database_files(&path);
                Err(error)
            }
        }
    }

    pub fn import(&mut self, name: &str, bytes: &[u8]) -> Result<DbInfo> {
        if !bytes.starts_with(SQLITE_HEADER) {
            return Err(not_sqlite("it has no SQLite header"));
        }
        let id = uuid::Uuid::new_v4().to_string();
        let path = self.managed_file(&id);
        let partial = path.with_extension("sqlite3.part");
        fs::write(&partial, bytes)?;
        let checked = Session::open_read_only(&partial)
            .and_then(|s| s.count("SELECT count(*) FROM sqlite_schema", &[]));
        drop_side_files(&partial);
        if let Err(error) = checked {
            let _ = fs::remove_file(&partial);
            return Err(not_sqlite(&error.to_string()));
        }
        fs::rename(&partial, &path)?;
        self.register(&id, name, bytes.len() as u64)
    }

    /// A new database with only the structure (no rows) of `bytes`, and no link back to them:
    /// a SQLite file, or a SQL script written for `dialect` (see [`dialects::to_sqlite`]).
    pub fn import_schema(
        &mut self,
        name: &str,
        dialect: &str,
        bytes: &[u8],
    ) -> Result<ImportedSchema> {
        let name = required_name(name)?;
        let (structure, skipped) = if bytes.starts_with(SQLITE_HEADER) {
            (self.structure_of_file(bytes)?, Vec::new())
        } else {
            let script = std::str::from_utf8(bytes).map_err(|_| {
                Error::msg("This file is neither a SQLite database nor a SQL script")
            })?;
            let converted = dialects::to_sqlite(dialect, script)?;
            let scratch = Session::memory()?;
            let mut skipped = converted.skipped;
            for sql in &converted.statements {
                if let Err(error) = scratch.connection().execute_batch(sql) {
                    let start: String =
                        sql.split_whitespace().take(4).collect::<Vec<_>>().join(" ");
                    skipped.push(format!("{start}… ({error})"));
                }
            }
            // Rows a SQLite script inserted stay behind.
            (scratch.schema_only_copy()?, skipped)
        };
        if structure.schema()?.tables.is_empty() {
            return Err(Error::msg("No tables were found in this file"));
        }
        let database = self.create(name, Some(&structure.dump()?))?;
        Ok(ImportedSchema { database, skipped })
    }

    /// The structure of a SQLite file's bytes, read from a temporary copy.
    fn structure_of_file(&self, bytes: &[u8]) -> Result<Session> {
        let partial = self
            .dir
            .join(DATABASES_DIR)
            .join(format!("import-{}.sqlite3.part", uuid::Uuid::new_v4()));
        fs::write(&partial, bytes)?;
        let copied = Session::open_read_only(&partial).and_then(|s| s.schema_only_copy());
        drop_side_files(&partial);
        let _ = fs::remove_file(&partial);
        copied.map_err(|e| not_sqlite(&e.to_string()))
    }

    /// Adds a file on the user's computer to the list without copying it: every change is
    /// made to that file. Opening the same file again returns the entry it already has.
    pub fn link(&mut self, path: &Path) -> Result<DbInfo> {
        let path = fs::canonicalize(path)
            .map(plain_path)
            .map_err(|e| Error::msg(format!("{} could not be opened ({e})", path.display())))?;
        if !path.is_file() {
            return Err(Error::msg(format!("{} is not a file", path.display())));
        }
        let text = path
            .to_str()
            .ok_or_else(|| Error::msg("Sequill can't open a file whose path isn't valid text"))?
            .to_owned();
        let known: Option<String> = self
            .catalog
            .query_row("SELECT id FROM databases WHERE path = ?", [&text], |r| {
                r.get(0)
            })
            .optional()?;
        if let Some(id) = known {
            return self.info(&id);
        }
        check_database_file(&path)?;
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("Untitled")
            .to_owned();
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_ms();
        self.catalog.execute(
            "INSERT INTO databases (id, name, size, created_at, updated_at, path) VALUES (?, ?, ?, ?, ?, ?)",
            params![id, name, sql_size(fs::metadata(&path)?.len()), now, now, text],
        )?;
        self.info(&id)
    }

    /// A consistent copy of the database file (includes anything still in a WAL).
    pub fn export(&mut self, id: &str) -> Result<Vec<u8>> {
        let path = self.path(id)?;
        let copy = self
            .dir
            .join(format!("export-{}.tmp", uuid::Uuid::new_v4()));
        let backed_up = Session::open_read_only(&path).and_then(|source| {
            source
                .connection()
                .backup(
                    rusqlite::MAIN_DB,
                    &copy,
                    None::<fn(rusqlite::backup::Progress)>,
                )
                .map_err(Error::from)
        });
        let bytes = backed_up.and_then(|()| fs::read(&copy).map_err(Error::from));
        remove_database_files(&copy);
        bytes
    }

    pub fn rename(&mut self, id: &str, name: &str) -> Result<DbInfo> {
        let name = name.trim();
        if name.is_empty() {
            return Err(Error::msg("The name is empty"));
        }
        self.info(id)?;
        self.catalog.execute(
            "UPDATE databases SET name = ? WHERE id = ?",
            params![name, id],
        )?;
        self.info(id)
    }

    /// Deletes a database Sequill keeps, file and all. A file opened in place is only taken
    /// off the list: the user's own file is never deleted.
    pub fn delete(&mut self, id: &str) -> Result<()> {
        check_id(id)?;
        if self.current.as_ref().is_some_and(|c| c.id == id) {
            self.current = None;
        }
        if self
            .design
            .as_ref()
            .is_some_and(|(of, _)| of.as_deref() == Some(id))
        {
            self.design = None;
        }
        if self.info(id).is_ok_and(|info| info.path.is_some()) {
            self.catalog
                .execute("DELETE FROM databases WHERE id = ?", [id])?;
            self.catalog
                .execute("DELETE FROM designs WHERE key = ?", [id])?;
            return Ok(());
        }
        // Only forget it once the file is gone: another process may still have it open.
        let path = self.managed_file(id);
        match fs::remove_file(&path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => {
                return Err(Error::msg(format!(
                    "The database file could not be deleted ({e}). If it is open in Sequill, switch to another database there first."
                )));
            }
        }
        drop_side_files(&path);
        self.catalog
            .execute("DELETE FROM databases WHERE id = ?", [id])?;
        self.catalog
            .execute("DELETE FROM designs WHERE key = ?", [id])?;
        Ok(())
    }

    /// The open session for a database, opening it (and closing the previous one) if needed.
    pub fn session(&mut self, id: &str) -> Result<&Session> {
        if self.current.as_ref().is_none_or(|c| c.id != id) {
            let path = self.path(id)?;
            self.current = None;
            let session = Session::open_existing(&path)?;
            let data_version = session.data_version()?;
            self.current = Some(OpenDb {
                id: id.to_owned(),
                session,
                data_version,
            });
        }
        Ok(&self.current.as_ref().expect("opened above").session)
    }

    /// Checks a schema design on a copy of the database's structure (no rows), so the database
    /// itself is untouched. `None` checks a design for a new, empty database. The copy is
    /// rebuilt only when the database's structure changed since the last check.
    pub fn preview_design(
        &mut self,
        id: Option<&str>,
        statements: &[String],
    ) -> Result<DesignPreview> {
        let base = match id {
            Some(id) => Some(self.session(id)?.schema_version()?),
            None => None,
        };
        let fresh = self
            .design
            .as_ref()
            .is_some_and(|(of, copy)| of.as_deref() == id && copy.base() == base);
        if !fresh {
            self.design = None;
            let copy = match id {
                Some(id) => DesignCopy::of(self.session(id)?)?,
                None => DesignCopy::empty()?,
            };
            self.design = Some((id.map(str::to_owned), copy));
        }
        let (_, copy) = self.design.as_ref().expect("made above");
        Ok(DesignPreview {
            base,
            error: copy.check(statements).err().map(|e| e.to_string()),
        })
    }

    /// Saves a schema design to the database in one transaction. With `base` (the structure
    /// version `preview_design` checked against), refuses if the structure changed since.
    pub fn apply_design(
        &mut self,
        id: &str,
        statements: &[String],
        base: Option<i64>,
    ) -> Result<()> {
        let session = self.session(id)?;
        let version = session.schema_version()?;
        if base.is_some_and(|base| base != version) {
            return Err(Error::msg(STRUCTURE_CHANGED));
        }
        session.apply_design(statements)?;
        self.touch()
    }

    /// Records the open database's new size and modification time after a write.
    pub fn touch(&mut self) -> Result<()> {
        let Some(open) = &self.current else {
            return Ok(());
        };
        let size = open.session.size_bytes()?;
        self.record_write(&open.id, size)
    }

    /// Records a write made through another connection (such as the MCP server's).
    pub fn record_write(&self, id: &str, size: u64) -> Result<()> {
        self.catalog.execute(
            "UPDATE databases SET size = ?, updated_at = ? WHERE id = ?",
            params![sql_size(size), now_ms(), id],
        )?;
        Ok(())
    }

    /// Saved queries, newest first. Shared by every database, like the editor's list.
    pub fn saved_queries(&self) -> Result<Vec<SavedQuery>> {
        Ok(self
            .catalog
            .prepare(
                "SELECT id, name, sql, updated_at FROM saved_queries ORDER BY updated_at DESC",
            )?
            .query_map([], |r| {
                Ok(SavedQuery {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    sql: r.get(2)?,
                    updated_at: r.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?)
    }

    /// Adds a saved query or replaces the one with its id.
    pub fn upsert_saved_query(&self, query: &SavedQuery) -> Result<()> {
        required_name(&query.name)?;
        self.catalog.execute(
            "INSERT INTO saved_queries (id, name, sql, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET name = excluded.name, sql = excluded.sql,
               updated_at = excluded.updated_at",
            params![query.id, query.name.trim(), query.sql, query.updated_at],
        )?;
        Ok(())
    }

    /// Saves `sql` under `name`: updates the query with `id`, or the one already called `name`
    /// (any case), or adds a new one.
    pub fn save_query(&self, name: &str, sql: &str, id: Option<&str>) -> Result<SavedQuery> {
        let name = required_name(name)?;
        let existing = self.saved_queries()?;
        let target = match id {
            Some(id) => Some(
                existing
                    .iter()
                    .find(|q| q.id == id)
                    .ok_or_else(|| Error::msg(format!("No saved query has the id {id}")))?,
            ),
            None => existing.iter().find(|q| q.name.eq_ignore_ascii_case(name)),
        };
        let query = SavedQuery {
            id: target.map_or_else(|| uuid::Uuid::new_v4().to_string(), |q| q.id.clone()),
            name: name.to_owned(),
            sql: sql.to_owned(),
            updated_at: now_ms(),
        };
        self.upsert_saved_query(&query)?;
        Ok(query)
    }

    /// Removes a saved query; false when there was none with that id.
    pub fn delete_saved_query(&self, id: &str) -> Result<bool> {
        Ok(self
            .catalog
            .execute("DELETE FROM saved_queries WHERE id = ?", [id])?
            > 0)
    }

    /// Every stored schema design.
    pub fn designs(&self) -> Result<Vec<StoredDesign>> {
        self.catalog
            .prepare("SELECT key, draft, version FROM designs")?
            .query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get(2)?))
            })?
            .map(|row| {
                let (key, draft, version) = row?;
                let draft = serde_json::from_str(&draft)
                    .map_err(|e| Error::msg(format!("The design for {key} is unreadable ({e})")))?;
                Ok(StoredDesign {
                    key,
                    draft,
                    version,
                })
            })
            .collect()
    }

    /// The stored design for `key`; an empty one at version 0 if there is none.
    pub fn design(&self, key: &str) -> Result<StoredDesign> {
        Ok(self
            .designs()?
            .into_iter()
            .find(|d| d.key == key)
            .unwrap_or_else(|| StoredDesign {
                key: key.to_owned(),
                draft: serde_json::json!({}),
                version: 0,
            }))
    }

    /// Saves the design for `key` (a database id or [`BLANK_DESIGN`]) if it is still at
    /// `version` (0 when none was saved yet). Returns the new version, or None when another
    /// window or an assistant saved it first; nothing is saved then.
    pub fn save_design(
        &self,
        key: &str,
        draft: &serde_json::Value,
        version: i64,
    ) -> Result<Option<i64>> {
        if key != BLANK_DESIGN {
            check_id(key)?;
        }
        let draft = draft.to_string();
        let saved = if version == 0 {
            self.catalog.execute(
                "INSERT INTO designs (key, draft, version) VALUES (?, ?, 1) ON CONFLICT (key) DO NOTHING",
                params![key, draft],
            )?
        } else {
            self.catalog.execute(
                "UPDATE designs SET draft = ?, version = version + 1 WHERE key = ? AND version = ?",
                params![draft, key, version],
            )?
        };
        Ok((saved > 0).then_some(version + 1))
    }

    /// Records one call an assistant made over MCP, then forgets calls older than the
    /// history setting.
    pub fn record_mcp_activity(&self, entry: &NewMcpActivity) -> Result<()> {
        let clip = |text: &Option<String>| text.as_deref().map(clip_text);
        self.catalog.execute(
            "INSERT INTO mcp_activity (at, tool, database_id, database_name, sql, details, ok, message)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                now_ms(),
                entry.tool,
                entry.database_id,
                entry.database_name,
                clip(&entry.sql),
                clip(&entry.details),
                entry.ok,
                clip(&entry.message),
            ],
        )?;
        self.prune_mcp_activity()
    }

    /// What assistants did over MCP, newest first, at most `limit` calls.
    pub fn mcp_activity(&self, limit: usize) -> Result<Vec<McpActivity>> {
        self.prune_mcp_activity()?;
        Ok(self
            .catalog
            .prepare(
                "SELECT id, at, tool, database_id, database_name, sql, details, ok, message
                 FROM mcp_activity ORDER BY at DESC, id DESC LIMIT ?",
            )?
            .query_map([i64::try_from(limit).unwrap_or(i64::MAX)], |r| {
                Ok(McpActivity {
                    id: r.get(0)?,
                    at: r.get(1)?,
                    tool: r.get(2)?,
                    database_id: r.get(3)?,
                    database_name: r.get(4)?,
                    sql: r.get(5)?,
                    details: r.get(6)?,
                    ok: r.get(7)?,
                    message: r.get(8)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?)
    }

    pub fn clear_mcp_activity(&self) -> Result<()> {
        self.catalog.execute("DELETE FROM mcp_activity", [])?;
        Ok(())
    }

    /// Days the MCP history is kept; None keeps it forever. A week unless the user changed it.
    pub fn mcp_history_days(&self) -> Result<Option<u32>> {
        let value: Option<String> = self
            .catalog
            .query_row(
                "SELECT value FROM settings WHERE key = ?",
                [MCP_HISTORY_DAYS_KEY],
                |r| r.get(0),
            )
            .optional()?;
        Ok(match value.and_then(|v| v.parse::<u32>().ok()) {
            None => Some(DEFAULT_MCP_HISTORY_DAYS),
            Some(0) => None,
            Some(days) => Some(days),
        })
    }

    /// Sets how long the MCP history is kept (None: forever) and forgets what is now too old.
    pub fn set_mcp_history_days(&self, days: Option<u32>) -> Result<()> {
        if days == Some(0) {
            return Err(Error::msg("Keep the history for at least one day"));
        }
        self.catalog.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            params![MCP_HISTORY_DAYS_KEY, days.unwrap_or(0).to_string()],
        )?;
        self.prune_mcp_activity()
    }

    /// Deletes MCP history older than the setting allows.
    fn prune_mcp_activity(&self) -> Result<()> {
        if let Some(days) = self.mcp_history_days()? {
            let cutoff = now_ms() - i64::from(days) * DAY_MS;
            self.catalog
                .execute("DELETE FROM mcp_activity WHERE at < ?", [cutoff])?;
        }
        Ok(())
    }

    /// Asks the app to show something (another process, the MCP server, calls this).
    pub fn push_ui_request(&self, payload: &str) -> Result<i64> {
        self.catalog.execute(
            "INSERT INTO ui_requests (payload, created_at) VALUES (?, ?)",
            params![payload, now_ms()],
        )?;
        Ok(self.catalog.last_insert_rowid())
    }

    /// The app's side: every waiting request, oldest first, each handed out once.
    pub fn take_ui_requests(&self) -> Result<Vec<String>> {
        let tx = self.catalog.unchecked_transaction()?;
        // A request left behind by a server that stopped mid-wait must not pop up later.
        let payloads: Vec<String> = tx
            .prepare("SELECT payload FROM ui_requests WHERE created_at >= ? ORDER BY id")?
            .query_map([now_ms() - UI_REQUEST_MAX_AGE_MS], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        tx.execute("DELETE FROM ui_requests", [])?;
        tx.commit()?;
        Ok(payloads)
    }

    /// Whether the app has not picked a request up yet.
    pub fn ui_request_pending(&self, id: i64) -> Result<bool> {
        let found: Option<i64> = self
            .catalog
            .query_row("SELECT id FROM ui_requests WHERE id = ?", [id], |r| {
                r.get(0)
            })
            .optional()?;
        Ok(found.is_some())
    }

    pub fn cancel_ui_request(&self, id: i64) -> Result<()> {
        self.catalog
            .execute("DELETE FROM ui_requests WHERE id = ?", [id])?;
        Ok(())
    }

    /// Whether AI assistants may use the databases over MCP. Off until the user turns it on.
    pub fn mcp_enabled(&self) -> Result<bool> {
        self.switch(MCP_ENABLED_KEY)
    }

    pub fn set_mcp_enabled(&self, enabled: bool) -> Result<()> {
        self.set_switch(MCP_ENABLED_KEY, enabled)
    }

    /// Whether assistants may also change things over MCP (rows, tables, databases, saved
    /// queries). Off until the user turns it on; without it they can only read and show.
    pub fn mcp_changes_allowed(&self) -> Result<bool> {
        self.switch(MCP_CHANGES_KEY)
    }

    pub fn set_mcp_changes_allowed(&self, allowed: bool) -> Result<()> {
        self.set_switch(MCP_CHANGES_KEY, allowed)
    }

    /// An on/off setting; off until set.
    fn switch(&self, key: &str) -> Result<bool> {
        let value: Option<String> = self
            .catalog
            .query_row("SELECT value FROM settings WHERE key = ?", [key], |r| {
                r.get(0)
            })
            .optional()?;
        Ok(value.as_deref() == Some("1"))
    }

    fn set_switch(&self, key: &str, on: bool) -> Result<()> {
        self.catalog.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            params![key, if on { "1" } else { "0" }],
        )?;
        Ok(())
    }

    /// What other processes committed since the last call.
    pub fn external_changes(&mut self) -> Result<ExternalChanges> {
        let catalog_version = data_version(&self.catalog)?;
        let catalog = catalog_version != self.catalog_version;
        self.catalog_version = catalog_version;
        let database = match &mut self.current {
            Some(open) => {
                let version = open.session.data_version()?;
                let changed = version != open.data_version;
                open.data_version = version;
                changed.then(|| open.id.clone())
            }
            None => None,
        };
        Ok(ExternalChanges { catalog, database })
    }
}

/// One call an assistant made over MCP, as the app lists it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct McpActivity {
    pub id: i64,
    /// When it was called (ms since the Unix epoch).
    pub at: i64,
    /// The tool's name, such as `query` or `insert_rows`.
    pub tool: String,
    pub database_id: Option<String>,
    pub database_name: Option<String>,
    /// The SQL it ran or showed, if any.
    pub sql: Option<String>,
    /// Its other arguments as JSON (table, filters, rows…), if any.
    pub details: Option<String>,
    /// False when the call failed or was refused.
    pub ok: bool,
    /// Why it failed, if it did.
    pub message: Option<String>,
}

/// One call to record; see [`McpActivity`].
#[derive(Debug, Clone, Default)]
pub struct NewMcpActivity {
    pub tool: String,
    pub database_id: Option<String>,
    pub database_name: Option<String>,
    pub sql: Option<String>,
    pub details: Option<String>,
    pub ok: bool,
    pub message: Option<String>,
}

/// Cuts text to the history's limit on a character boundary, marking the cut.
fn clip_text(text: &str) -> String {
    match text.char_indices().nth(MCP_ACTIVITY_TEXT_LIMIT) {
        Some((at, _)) => format!("{}…", &text[..at]),
        None => text.to_owned(),
    }
}

/// The journal files SQLite may leave next to a database.
fn drop_side_files(path: &Path) {
    for suffix in ["-journal", "-wal", "-shm"] {
        let mut side = path.as_os_str().to_owned();
        side.push(suffix);
        let _ = fs::remove_file(PathBuf::from(side));
    }
}

fn remove_database_files(path: &Path) {
    let _ = fs::remove_file(path);
    drop_side_files(path);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path()).unwrap();
        (dir, store)
    }

    #[test]
    fn creates_lists_renames_and_deletes() {
        let (_dir, mut store) = store();
        let a = store
            .create("Shop", Some("CREATE TABLE t(a); INSERT INTO t VALUES (1);"))
            .unwrap();
        assert!(a.size_bytes > 0);
        assert_eq!(store.list().unwrap(), vec![a.clone()]);

        let renamed = store.rename(&a.id, "  Store  ").unwrap();
        assert_eq!(renamed.name, "Store");
        assert!(store.rename(&a.id, " ").is_err());

        assert_eq!(
            store
                .session(&a.id)
                .unwrap()
                .count("SELECT count(*) FROM t", &[])
                .unwrap(),
            1
        );
        store.delete(&a.id).unwrap();
        assert!(store.list().unwrap().is_empty());
        assert!(!store.managed_file(&a.id).exists());
        assert!(store.session(&a.id).is_err());
    }

    #[test]
    fn a_failed_seed_leaves_nothing_behind() {
        let (dir, mut store) = store();
        assert!(store.create("Bad", Some("CREATE TABLE")).is_err());
        assert!(store.list().unwrap().is_empty());
        assert_eq!(
            fs::read_dir(dir.path().join(DATABASES_DIR))
                .unwrap()
                .count(),
            0
        );
    }

    #[test]
    fn exports_and_imports_a_database() {
        let (_dir, mut store) = store();
        let a = store
            .create("A", Some("CREATE TABLE t(a); INSERT INTO t VALUES ('x');"))
            .unwrap();
        let bytes = store.export(&a.id).unwrap();
        assert!(bytes.starts_with(SQLITE_HEADER));

        let b = store.import("B", &bytes).unwrap();
        let rows = store
            .session(&b.id)
            .unwrap()
            .query("SELECT a FROM t", &[], None)
            .unwrap()
            .rows;
        assert_eq!(rows, vec![vec![crate::CellValue::Text("x".into())]]);
    }

    #[test]
    fn rejects_files_that_are_not_sqlite() {
        let (dir, mut store) = store();
        let error = store.import("X", b"hello").unwrap_err().to_string();
        assert!(error.starts_with("This file does not look like a SQLite database"));
        let mut corrupt = SQLITE_HEADER.to_vec();
        corrupt.extend([0xff; 100]);
        assert!(store.import("Y", &corrupt).is_err());
        assert!(store.list().unwrap().is_empty());
        assert_eq!(
            fs::read_dir(dir.path().join(DATABASES_DIR))
                .unwrap()
                .count(),
            0
        );
    }

    #[test]
    fn ids_cannot_point_outside_the_store() {
        let (_dir, mut store) = store();
        for id in [
            "../catalog",
            "",
            "not-a-uuid",
            "{6f2c8d4e-3b1a-4c5d-9e8f-0a1b2c3d4e5f}",
        ] {
            assert!(store.path(id).is_err(), "{id}");
            assert!(store.delete(id).is_err(), "{id}");
        }
    }

    #[test]
    fn reconciles_files_and_catalog_on_open() {
        let dir = tempfile::tempdir().unwrap();
        let (kept, lost) = {
            let mut store = Store::open(dir.path()).unwrap();
            let kept = store.create("Kept", Some("CREATE TABLE t(a)")).unwrap();
            let lost = store.create("Lost", None).unwrap();
            (kept, lost)
        };
        fs::remove_file(
            dir.path()
                .join(DATABASES_DIR)
                .join(format!("db-{}.sqlite3", lost.id)),
        )
        .unwrap();
        let orphan = uuid::Uuid::new_v4().to_string();
        fs::write(
            dir.path()
                .join(DATABASES_DIR)
                .join(format!("db-{orphan}.sqlite3")),
            b"",
        )
        .unwrap();

        let store = Store::open(dir.path()).unwrap();
        let mut names: Vec<String> = store.list().unwrap().into_iter().map(|d| d.name).collect();
        names.sort();
        assert_eq!(
            names,
            vec![kept.name, format!("Recovered {}", &orphan[..8])]
        );
    }

    #[test]
    fn mcp_access_is_off_until_turned_on_and_shared_between_processes() {
        let (dir, store) = store();
        assert!(!store.mcp_enabled().unwrap());
        store.set_mcp_enabled(true).unwrap();
        let other = Store::open_shared(dir.path()).unwrap();
        assert!(other.mcp_enabled().unwrap());
        store.set_mcp_enabled(false).unwrap();
        assert!(!other.mcp_enabled().unwrap());

        assert!(!store.mcp_changes_allowed().unwrap());
        store.set_mcp_changes_allowed(true).unwrap();
        assert!(other.mcp_changes_allowed().unwrap());
        assert!(
            !other.mcp_enabled().unwrap(),
            "the two switches are separate"
        );
    }

    #[test]
    fn saves_queries_by_id_or_name() {
        let (dir, store) = store();
        let first = store.save_query("Top customers", "SELECT 1", None).unwrap();
        let same = store.save_query("top CUSTOMERS", "SELECT 2", None).unwrap();
        assert_eq!(same.id, first.id, "same name updates it");
        let renamed = store
            .save_query("Best customers", "SELECT 3", Some(&first.id))
            .unwrap();
        assert_eq!(renamed.id, first.id);
        std::thread::sleep(std::time::Duration::from_millis(2));
        store.save_query("Other", "SELECT 4", None).unwrap();

        let other = Store::open_shared(dir.path()).unwrap();
        let names: Vec<String> = other
            .saved_queries()
            .unwrap()
            .into_iter()
            .map(|q| q.name)
            .collect();
        assert_eq!(names, ["Other", "Best customers"], "newest first, shared");
        assert!(store.save_query(" ", "SELECT 1", None).is_err());
        assert!(store.save_query("x", "SELECT 1", Some("missing")).is_err());
        assert!(store.delete_saved_query(&first.id).unwrap());
        assert!(!store.delete_saved_query(&first.id).unwrap());
    }

    #[test]
    fn hands_ui_requests_to_the_app_once() {
        let (dir, app) = store();
        let mcp = Store::open_shared(dir.path()).unwrap();
        let a = mcp.push_ui_request(r#"{"a":1}"#).unwrap();
        let b = mcp.push_ui_request(r#"{"b":2}"#).unwrap();
        mcp.cancel_ui_request(b).unwrap();
        assert!(mcp.ui_request_pending(a).unwrap());
        assert_eq!(app.take_ui_requests().unwrap(), [r#"{"a":1}"#]);
        assert!(!mcp.ui_request_pending(a).unwrap());
        assert!(app.take_ui_requests().unwrap().is_empty());

        let stale = mcp.push_ui_request("{}").unwrap();
        app.catalog
            .execute(
                "UPDATE ui_requests SET created_at = created_at - 60000 WHERE id = ?",
                [stale],
            )
            .unwrap();
        assert!(
            app.take_ui_requests().unwrap().is_empty(),
            "stale requests are dropped"
        );
        assert!(!mcp.ui_request_pending(stale).unwrap());
    }

    #[test]
    fn keeps_a_database_whose_file_is_still_open_elsewhere() {
        let (_dir, mut store) = store();
        let a = store.create("A", Some("CREATE TABLE t(a)")).unwrap();
        let held = Session::open(&store.path(&a.id).unwrap()).unwrap();
        let result = store.delete(&a.id);
        if cfg!(windows) {
            // Windows refuses to delete an open file: the database must stay listed.
            assert!(
                result
                    .unwrap_err()
                    .to_string()
                    .contains("could not be deleted")
            );
            assert_eq!(store.list().unwrap().len(), 1);
            drop(held);
            store.delete(&a.id).unwrap();
        } else {
            result.unwrap();
        }
        assert!(store.list().unwrap().is_empty());
    }

    #[test]
    fn resolves_by_id_or_unique_name() {
        let (_dir, mut store) = store();
        let a = store.create("Sales", None).unwrap();
        assert_eq!(store.resolve(&a.id).unwrap().id, a.id);
        assert_eq!(store.resolve("sales").unwrap().id, a.id);
        assert!(store.resolve("nope").is_err());
        store.create("Sales", None).unwrap();
        assert!(
            store
                .resolve("Sales")
                .unwrap_err()
                .to_string()
                .contains("use an id")
        );
    }

    #[test]
    fn sees_writes_from_other_processes() {
        let (dir, mut store) = store();
        let a = store.create("A", Some("CREATE TABLE t(a)")).unwrap();
        store.session(&a.id).unwrap();
        assert!(!store.external_changes().unwrap().any());

        // Our own writes are not "external".
        store
            .session(&a.id)
            .unwrap()
            .query("INSERT INTO t VALUES (1)", &[], None)
            .unwrap();
        store.touch().unwrap();
        assert!(!store.external_changes().unwrap().any());

        let other = Store::open_shared(dir.path()).unwrap();
        let path = other.path(&a.id).unwrap();
        Session::open(&path)
            .unwrap()
            .query("INSERT INTO t VALUES (2)", &[], None)
            .unwrap();
        other.record_write(&a.id, 1).unwrap();
        let changes = store.external_changes().unwrap();
        assert_eq!(
            changes,
            ExternalChanges {
                catalog: true,
                database: Some(a.id.clone())
            }
        );
        assert!(!store.external_changes().unwrap().any());
    }

    /// A database file outside the store, as a user would have on their computer.
    fn user_file(dir: &Path, name: &str, sql: &str) -> PathBuf {
        let path = dir.join(name);
        Session::open(&path)
            .unwrap()
            .connection()
            .execute_batch(sql)
            .unwrap();
        path
    }

    fn managed_files(dir: &Path) -> usize {
        fs::read_dir(dir.join(DATABASES_DIR)).unwrap().count()
    }

    #[test]
    fn edits_an_opened_file_in_place_without_copying_it() {
        let (dir, mut store) = store();
        let outside = tempfile::tempdir().unwrap();
        let file = user_file(outside.path(), "shop.db", "CREATE TABLE t(a)");

        let info = store.link(&file).unwrap();
        assert_eq!(info.name, "shop");
        assert_eq!(
            fs::canonicalize(info.path.as_deref().unwrap()).unwrap(),
            fs::canonicalize(&file).unwrap()
        );
        assert_eq!(managed_files(dir.path()), 0, "no copy is made");

        store
            .session(&info.id)
            .unwrap()
            .query("INSERT INTO t VALUES (1)", &[], None)
            .unwrap();
        store.current = None;
        let original = Session::open_read_only(&file).unwrap();
        assert_eq!(original.count("SELECT count(*) FROM t", &[]).unwrap(), 1);

        let again = store
            .link(&outside.path().join(".").join("shop.db"))
            .unwrap();
        assert_eq!(again.id, info.id, "the same file is listed once");
        assert_eq!(store.list().unwrap().len(), 1);
    }

    #[test]
    fn removing_an_opened_file_keeps_the_file() {
        let (_dir, mut store) = store();
        let outside = tempfile::tempdir().unwrap();
        let file = user_file(outside.path(), "keep.sqlite", "CREATE TABLE t(a)");
        let info = store.link(&file).unwrap();
        store.session(&info.id).unwrap();
        store.delete(&info.id).unwrap();
        assert!(store.list().unwrap().is_empty());
        assert!(file.exists(), "the user's file is never deleted");
    }

    #[test]
    fn a_moved_file_is_reported_and_never_recreated() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let file = user_file(outside.path(), "gone.db", "CREATE TABLE t(a)");
        let id = Store::open(dir.path()).unwrap().link(&file).unwrap().id;
        fs::remove_file(&file).unwrap();

        // Reopening the store keeps the entry, so the person can see what happened.
        let mut store = Store::open(dir.path()).unwrap();
        assert_eq!(store.list().unwrap().len(), 1);
        let error = store.session(&id).err().unwrap().to_string();
        assert!(error.contains("is missing"), "{error}");
        assert!(!file.exists(), "no empty database appears in its place");
    }

    #[test]
    fn refuses_to_open_files_that_are_not_sqlite() {
        let (_dir, mut store) = store();
        let outside = tempfile::tempdir().unwrap();
        let text = outside.path().join("notes.db");
        fs::write(&text, b"hello, not a database").unwrap();
        let error = store.link(&text).unwrap_err().to_string();
        assert!(error.starts_with("This file does not look like a SQLite database"));
        assert!(store.link(&outside.path().join("nope.db")).is_err());
        assert!(
            store.link(outside.path()).is_err(),
            "a folder is not a file"
        );
        assert!(store.list().unwrap().is_empty());

        let empty = outside.path().join("empty.db");
        fs::write(&empty, b"").unwrap();
        assert!(store.link(&empty).is_ok(), "SQLite opens an empty file");
    }

    #[test]
    fn adds_the_path_column_to_an_old_catalog() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join(DATABASES_DIR)).unwrap();
        Connection::open(dir.path().join(CATALOG_FILE))
            .unwrap()
            .execute_batch(
                "CREATE TABLE databases (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0,
                   created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);",
            )
            .unwrap();
        let mut store = Store::open(dir.path()).unwrap();
        let made = store.create("Old style", None).unwrap();
        assert_eq!(made.path, None);
        Store::open_shared(dir.path()).unwrap();
    }

    #[test]
    fn checks_designs_on_a_copy_and_saves_only_when_asked() {
        let (_dir, mut store) = store();
        let a = store
            .create(
                "A",
                Some("CREATE TABLE t(a); INSERT INTO t VALUES (1), (2);"),
            )
            .unwrap();
        let good = vec!["ALTER TABLE t ADD COLUMN b TEXT".to_owned()];
        let preview = store.preview_design(Some(&a.id), &good).unwrap();
        assert_eq!(preview.error, None);
        let columns = |store: &mut Store| {
            let schema = store.session(&a.id).unwrap().schema().unwrap();
            schema
                .tables
                .iter()
                .find(|t| t.name == "t")
                .unwrap()
                .columns
                .len()
        };
        assert_eq!(columns(&mut store), 1, "checking leaves the database alone");

        let bad = vec!["ALTER TABLE missing ADD COLUMN b".to_owned()];
        let error = store.preview_design(Some(&a.id), &bad).unwrap().error;
        assert_eq!(error.as_deref(), Some("no such table: missing"));

        // Something else changes the structure: a save checked against the old one is refused.
        store
            .session(&a.id)
            .unwrap()
            .query("CREATE TABLE other(x)", &[], None)
            .unwrap();
        let stale = store.apply_design(&a.id, &good, preview.base).unwrap_err();
        assert!(stale.to_string().contains("structure changed"));
        assert_eq!(columns(&mut store), 1);

        let fresh = store.preview_design(Some(&a.id), &good).unwrap();
        assert_ne!(fresh.base, preview.base);
        store.apply_design(&a.id, &good, fresh.base).unwrap();
        assert_eq!(columns(&mut store), 2);
        assert_eq!(
            store
                .session(&a.id)
                .unwrap()
                .count("SELECT count(*) FROM t", &[])
                .unwrap(),
            2
        );

        let blank = store
            .preview_design(None, &["CREATE TABLE n(id INTEGER PRIMARY KEY)".into()])
            .unwrap();
        assert_eq!(
            blank,
            DesignPreview {
                base: None,
                error: None
            }
        );
    }

    #[test]
    fn imports_only_the_structure_of_a_file_or_script() {
        let (_dir, mut store) = store();
        let source = store
            .create(
                "Src",
                Some("CREATE TABLE t(a PRIMARY KEY); INSERT INTO t VALUES (1), (2);"),
            )
            .unwrap();
        let bytes = store.export(&source.id).unwrap();
        let from_file = store.import_schema("Copy", "sqlite", &bytes).unwrap();
        assert!(from_file.skipped.is_empty());
        let copy = store.session(&from_file.database.id).unwrap();
        assert_eq!(copy.count("SELECT count(*) FROM t", &[]).unwrap(), 0);

        let script =
            b"CREATE TABLE p (id serial PRIMARY KEY, at timestamptz); CREATE VIEW v AS SELECT 1;";
        let from_sql = store.import_schema("Pg", "postgresql", script).unwrap();
        assert_eq!(from_sql.skipped, ["CREATE VIEW"]);
        let schema = store
            .session(&from_sql.database.id)
            .unwrap()
            .schema()
            .unwrap();
        assert_eq!(schema.tables[0].columns[1].type_name, "TIMESTAMPTZ");

        assert!(store.import_schema("None", "mysql", b"SET x = 1;").is_err());
        assert_eq!(
            store.list().unwrap().len(),
            3,
            "a failed import adds nothing"
        );
    }

    #[test]
    fn saves_designs_only_over_the_version_they_were_read_at() {
        let (dir, mut store) = store();
        let db = store.create("A", None).unwrap();
        let other = Store::open_shared(dir.path()).unwrap();
        let v1 = serde_json::json!({ "droppedTables": ["a"] });
        let v2 = serde_json::json!({ "droppedTables": ["b"] });

        assert_eq!(store.design(&db.id).unwrap().version, 0);
        assert_eq!(store.save_design(&db.id, &v1, 0).unwrap(), Some(1));
        // Another process read version 0 too: its save is refused, not merged.
        assert_eq!(other.save_design(&db.id, &v2, 0).unwrap(), None);
        assert_eq!(other.save_design(&db.id, &v2, 1).unwrap(), Some(2));
        assert_eq!(store.save_design(&db.id, &v1, 1).unwrap(), None);
        assert_eq!(store.design(&db.id).unwrap().draft, v2);

        assert_eq!(store.save_design(BLANK_DESIGN, &v1, 0).unwrap(), Some(1));
        assert!(store.save_design("../x", &v1, 0).is_err());
        store.delete(&db.id).unwrap();
        let keys: Vec<String> = store
            .designs()
            .unwrap()
            .into_iter()
            .map(|d| d.key)
            .collect();
        assert_eq!(keys, [BLANK_DESIGN]);
    }

    fn call(tool: &str, ok: bool) -> NewMcpActivity {
        NewMcpActivity {
            tool: tool.into(),
            database_name: Some("Shop".into()),
            sql: Some("SELECT 1".into()),
            ok,
            message: (!ok).then(|| "no such table: nope".into()),
            ..Default::default()
        }
    }

    /// Moves every recorded call `days` into the past.
    fn age_activity(store: &Store, days: i64) {
        store
            .catalog
            .execute("UPDATE mcp_activity SET at = at - ?", [days * DAY_MS])
            .unwrap();
    }

    #[test]
    fn records_mcp_activity_newest_first_and_shares_it_between_processes() {
        let (dir, store) = store();
        let mcp = Store::open_shared(dir.path()).unwrap();
        mcp.record_mcp_activity(&call("query", true)).unwrap();
        mcp.record_mcp_activity(&call("execute", false)).unwrap();

        let listed = store.mcp_activity(10).unwrap();
        let tools: Vec<&str> = listed.iter().map(|a| a.tool.as_str()).collect();
        assert_eq!(tools, ["execute", "query"]);
        assert!(!listed[0].ok);
        assert_eq!(listed[0].message.as_deref(), Some("no such table: nope"));
        assert_eq!(listed[1].database_name.as_deref(), Some("Shop"));
        assert_eq!(store.mcp_activity(1).unwrap().len(), 1, "the limit holds");

        store.clear_mcp_activity().unwrap();
        assert!(mcp.mcp_activity(10).unwrap().is_empty());
    }

    #[test]
    fn forgets_mcp_activity_after_a_week_unless_told_otherwise() {
        let (_dir, store) = store();
        assert_eq!(
            store.mcp_history_days().unwrap(),
            Some(DEFAULT_MCP_HISTORY_DAYS)
        );
        store.record_mcp_activity(&call("query", true)).unwrap();
        age_activity(&store, 6);
        assert_eq!(
            store.mcp_activity(10).unwrap().len(),
            1,
            "six days old is kept"
        );
        age_activity(&store, 2);
        assert!(
            store.mcp_activity(10).unwrap().is_empty(),
            "eight days old is gone"
        );

        store.set_mcp_history_days(None).unwrap();
        store.record_mcp_activity(&call("query", true)).unwrap();
        age_activity(&store, 400);
        assert_eq!(store.mcp_activity(10).unwrap().len(), 1, "forever keeps it");

        store.set_mcp_history_days(Some(30)).unwrap();
        assert!(
            store.mcp_activity(10).unwrap().is_empty(),
            "a shorter setting prunes at once"
        );
        assert_eq!(store.mcp_history_days().unwrap(), Some(30));
        assert!(store.set_mcp_history_days(Some(0)).is_err());
    }

    #[test]
    fn opening_the_store_prunes_old_mcp_activity() {
        let dir = tempfile::tempdir().unwrap();
        {
            let store = Store::open(dir.path()).unwrap();
            store.record_mcp_activity(&call("query", true)).unwrap();
            age_activity(&store, 8);
        }
        let reopened = Store::open(dir.path()).unwrap();
        let count: i64 = reopened
            .catalog
            .query_row("SELECT count(*) FROM mcp_activity", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn clips_huge_mcp_activity_text() {
        let (_dir, store) = store();
        let huge = "é".repeat(MCP_ACTIVITY_TEXT_LIMIT + 50);
        let mut entry = call("insert_rows", true);
        entry.details = Some(huge);
        store.record_mcp_activity(&entry).unwrap();
        let details = store.mcp_activity(1).unwrap().remove(0).details.unwrap();
        assert_eq!(details.chars().count(), MCP_ACTIVITY_TEXT_LIMIT + 1);
        assert!(details.ends_with('…'));
    }
}
