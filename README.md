# Sequill Desktop

A SQLite browser and editor for the desktop, with a built-in MCP server so AI assistants can work with
the same databases. It is a [Tauri](https://tauri.app) app on a native SQLite engine written in Rust.
Databases are real files on your computer; nothing is uploaded and everything works offline.

## Features

- **Databases**: open `.sqlite` / `.db` files (picker or drag and drop), create empty ones or a sample
  shop, rename, delete, export the file or a SQL dump.
- **Table grid**: virtualised rows, paging, multi-column sort, global search, a filter builder
  (15 conditions, AND/OR), resizable, reorderable, hideable and pinnable columns, layouts remembered
  per table.
- **Editing**: inline cell edits, paste blocks from spreadsheets, set NULL, a row inspector, BLOB
  upload/preview/download, JSON formatting, add, duplicate and delete rows, foreign-key navigation.
- **SQL console**: SQLite highlighting and schema autocomplete, Ctrl/Cmd+Enter to run the script or
  selection, one result per statement, EXPLAIN QUERY PLAN, history and saved queries.
- **Schema**: create tables (keys, defaults, references, STRICT, WITHOUT ROWID), add, rename and drop
  columns, rename and drop tables, create and drop indexes. Every change previews its SQL.
- **Schema visualizer**: any database drawn as an ER diagram you can also design in: add tables and
  columns, drag between columns to create foreign keys, then save everything in one transaction or as a
  new database. Changes SQLite can't make in place rebuild the table and keep its rows.
- **Import / export**: CSV, TSV and JSON import with type detection and column mapping; export tables,
  filtered views, selections or query results as CSV, JSON or SQL INSERTs.
- **MCP server**: AI assistants can read, show and (when allowed) change the databases; see
  [MCP server](#mcp-server).

## Getting started

Needs [Bun](https://bun.sh), Rust (stable) and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/).

```bash
bun install
bun run desktop:dev
```

That opens the app with hot reload. `bun run desktop:build` makes a release build and installers in
`target/release/bundle`.

## Scripts

| Script                     | What it does                                             |
| -------------------------- | -------------------------------------------------------- |
| `bun run desktop:dev`      | Desktop app with hot reload.                             |
| `bun run desktop:build`    | Release build and installers in `target/release/bundle`. |
| `bun run mcp -- [options]` | MCP server from source (see [MCP server](#mcp-server)).  |
| `bun run test:rust`        | Rust tests for the engine, the MCP server and the app.   |
| `bun run typecheck`        | TypeScript checks.                                       |
| `bun run lint`             | ESLint.                                                  |
| `bun run format`           | Prettier; `format:check` to verify.                      |
| `bun run test`             | Frontend unit and integration tests.                     |
| `bun run test:e2e`         | Playwright end-to-end tests (run `bun run build` first). |

End-to-end tests run in the installed Brave browser. If Brave is not at
`C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe`, set `BRAVE_PATH`.

## Releasing

Versions are managed with [Changesets](https://github.com/changesets/changesets). `package.json`
holds the version; the app reads it from there, and `bun run version-packages` copies it into
`Cargo.toml` and `Cargo.lock` (CI fails if they drift: `bun run version:check`).

1. With each user-facing change, run `bun run changeset`, pick patch, minor or major, describe the
   change, and commit the new `.changeset/*.md` file with it.
2. When that reaches `master`, the **Release** workflow opens (or updates) a "Version Packages" pull
   request that bumps the version and writes `CHANGELOG.md`.
3. Merging that pull request builds the app on Windows (x64), macOS (Apple Silicon and Intel) and
   Linux (x64), uploads the installers to a GitHub release `v<version>` with the changelog as notes,
   and publishes it. If a build fails, nothing is published; re-run the workflow to retry.

The **CI** workflow runs the type, lint, format, unit and Rust checks on every pull request and push
to `master`.

## Project layout

```
src/                   the React 19 + TypeScript frontend (Vite)
  main/                entry point and page switch
  features/editor/     the editor: sidebar, tabs, grid, query console, command palette
  features/vis/        the schema visualizer and designer
  shared/              UI, dialogs, hooks and the SQLite client used by both pages
src-tauri/             the desktop app: Tauri commands and the outside-change watcher
crates/
  sequill-core/        the native engine: sessions, schema, filters, DDL, dump, database catalog
  sequill-mcp/         the MCP server and its tools
```

The frontend reaches SQLite only through `getSqlite()` in `src/shared/lib/sqlite/client.ts`, which
calls the Rust engine through Tauri commands. Values are always bound parameters, names are quoted,
and destructive actions show their SQL first.

Databases live in the app's data folder (`%APPDATA%\com.adibitz.sequill` on Windows,
`~/Library/Application Support/com.adibitz.sequill` on macOS, `~/.local/share/com.adibitz.sequill` on
Linux). The app checks once a second whether another process (such as an assistant over MCP) changed
the open database or the list, and refreshes what's on screen.

## MCP server

Click **MCP** in the editor's top bar (next to **Jump to…**). It turns access on or off and shows how
to connect Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, JetBrains, Codex, Gemini CLI
or another client, with settings to copy. Access is **off**
until you turn it on, and the server checks the switch on every call, so turning it off stops an
assistant at once.

To set a client up by hand, add this to its MCP settings (Claude Desktop: `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sequill": { "command": "C:\\Program Files\\Sequill\\sequill.exe", "args": ["mcp"] }
  }
}
```

These tools are always offered (while MCP is on):

| Tool                 | What it does                                                                         |
| -------------------- | ------------------------------------------------------------------------------------ |
| `list_databases`     | Ids, names, sizes and last change times.                                             |
| `get_schema`         | Tables, views, indexes and triggers with the SQL that defines them.                  |
| `describe_table`     | One table or view: columns, keys, foreign keys, indexes, triggers and its row count. |
| `find_rows`          | Rows with the editor's filters (15 operators, all/any), search, sort and paging.     |
| `query`              | One read-only statement with `?` parameters; 200 rows by default, 5000 at most.      |
| `explain_query`      | EXPLAIN QUERY PLAN for a script, without running it.                                 |
| `list_saved_queries` | The editor's saved queries.                                                          |
| `show_in_app`        | Opens a table (with filters, search and sort), a query tab or the schema in the app. |

These change things, so they're only offered with `--allow-writes` ("Also let it make changes"):

| Tool                                                    | What it does                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `insert_rows`, `update_rows`, `delete_rows`             | Rows by column name; update and delete need filters or `all_rows`. |
| `create_table`, `alter_table`, `drop_object`            | Tables and columns (add, rename, drop), and dropping any object.   |
| `create_index`, `create_trigger`, `create_view`         | Indexes (unique, partial, descending), triggers and views.         |
| `create_database`, `rename_database`, `delete_database` | Databases in Sequill.                                              |
| `save_query`, `delete_saved_query`                      | The editor's saved queries.                                        |
| `execute`                                               | Any SQL script, for whatever the tools above don't cover.          |

Without `--allow-writes`, reads run on a read-only connection and the changing tools aren't offered.
ATTACH is turned off, so a call can't reach other files. Deleting a database the app has open is
refused until the app switches to another one. `show_in_app` says so if Sequill isn't open.
`--data-dir <path>` points the server at another data folder. A database is named by its id or name.

## Limitations

- Grid paging uses `LIMIT/OFFSET`, which slows down deep into very large tables.
