//! The databases Sequill knows: files it keeps in a data directory, and files the user
//! opened from their computer, which are edited where they are (never copied). A small
//! catalog database keeps their display names. Mirrors the web worker's OPFS catalog
//! (`src/shared/lib/sqlite/worker.ts`), with real files that other processes (the MCP
//! server) can open too.

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
/// Requests to show something older than this are dropped unseen.
const UI_REQUEST_MAX_AGE_MS: i64 = 10_000;
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
               id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, created_at INTEGER NOT NULL);",
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
        let value: Option<String> = self
            .catalog
            .query_row(
                "SELECT value FROM settings WHERE key = ?",
                [MCP_ENABLED_KEY],
                |r| r.get(0),
            )
            .optional()?;
        Ok(value.as_deref() == Some("1"))
    }

    pub fn set_mcp_enabled(&self, enabled: bool) -> Result<()> {
        self.catalog.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            params![MCP_ENABLED_KEY, if enabled { "1" } else { "0" }],
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
}
