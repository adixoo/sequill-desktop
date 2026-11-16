# Sequill

A SQLite browser and editor, built as a desktop app with an MCP server so AI assistants can work
with the same databases. It runs as a [Tauri](https://tauri.app) window on a native SQLite engine;
the same frontend also runs in a browser on the official
[SQLite WASM](https://sqlite.org/wasm/doc/trunk/index.md) build (used for development and the
end-to-end tests). Nothing is uploaded and everything works offline. The editor is at `/` and the
schema visualizer and designer at `/vis`.

## Features

- **Databases**: open `.sqlite` / `.db` files (picker or drag and drop), create empty ones or a sample
  shop, rename, delete, download the file or a SQL dump. Databases persist across reloads.
- **Table grid**: virtualised rows, paging through SQLite, multi-column sort, global search, a filter
  builder (15 conditions, AND/OR), resizable, reorderable, hideable and pinnable columns, density
  toggle, layouts remembered per table.
- **Editing**: inline cell edits (double-click, Enter, or just type), paste blocks from spreadsheets,
  set NULL, a row inspector for full rows, BLOB upload/preview/download, JSON formatting, add,
  duplicate and delete rows (including "all matching rows"), foreign-key navigation.
- **SQL console**: CodeMirror with SQLite highlighting and schema autocomplete, Ctrl/Cmd+Enter to run
  the script or selection, one result per statement, EXPLAIN QUERY PLAN mode, history and saved queries.
- **Schema**: create tables (column builder, keys, defaults, references, STRICT, WITHOUT ROWID), add,
  rename and drop columns, rename and drop tables, create and drop indexes. Every change previews its SQL.
- **Schema visualizer (`/vis`)**: any database drawn as an ER diagram (tables, views, keys, foreign-key
  lines) with a searchable outline of every table's columns and types, auto-arrange, zoom, minimap and a
  focus mode for one table's relations. Lines pick the sides of the cards that face each other as you
  move tables around, and each table can have its own color (six presets or any custom color).
  Design visually:
  add tables and columns and drag between columns to create foreign keys. The outline is also the
  editor: add, edit, rename and delete columns, rename, delete and restore tables. Changes that SQLite
  can't make in place (type, constraints, a new foreign key on an existing column) rebuild the table and
  keep its rows, indexes, triggers and views. Pending changes show in color: green for added, blue for
  edited, rose and struck through for deleted. Nothing touches a database until you save: clicking the
  header's **Unsaved** badge applies everything to the open database in one transaction (foreign keys are
  checked before it commits; anything that would lose a rule first shows the SQL), and its menu can
  review the SQL first, **save as a new database** (a copy with the schema plus your changes, optionally
  with the rows, leaving the original as it is), download the SQL or discard the changes.
  Unsaved designs, layouts and colors are remembered per database. Both pages share one database
  menu (the same databases and actions); a database with an unsaved design is tagged "draft", and
  leaving the schema page with unsaved changes asks whether to keep them as a draft or discard them.
- **Import / export**: CSV, TSV and JSON import into new or existing tables with type detection and
  column mapping (one transaction, all-or-nothing); export tables, filtered views, selections or query
  results as CSV, JSON or SQL INSERTs.
- **App shell**: tabs, Ctrl/Cmd+K command palette, light and dark themes (dark by default), phone-friendly layout.
- **MCP server**: AI assistants can list, read and (when allowed) change the databases; see [MCP server](#mcp-server).

## Stack

Vite 8 · React 19 (with the React Compiler) · TypeScript · Bun · Tailwind CSS 4 · shadcn/ui (Radix) ·
Motion (`motion/react`, lazy-loaded) · TanStack Query and Virtual · Zustand · CodeMirror 6 · PapaParse ·
React Flow (`@xyflow/react`) and dagre for the schema diagram · Comlink · Fontsource (self-hosted fonts) ·
Changesets · ESLint + Prettier · Bun test + Playwright.

Desktop app: Tauri 2 · Rust · rusqlite (bundled SQLite) · rmcp (MCP server).

## Getting started

```bash
bun install
bun run desktop:dev
```

That opens the desktop app with hot reload. `bun run dev` alone serves the frontend at
http://localhost:5173 for a browser (on the WASM engine). `bun install` (postinstall) and
`bun run dev` copy the SQLite WASM runtime into `public/sqlite/` (see `scripts/copy-sqlite-wasm.ts`).

## Scripts

| Script                     | What it does                                                         |
| -------------------------- | -------------------------------------------------------------------- |
| `bun run dev`              | Vite dev server for the frontend (http://localhost:5173).            |
| `bun run build`            | Production build of the frontend to `dist/`.                         |
| `bun run preview`          | Serves `dist/` like the desktop app does (port 4173).                |
| `bun run typecheck`        | TypeScript for the app, tests, scripts and configs.                  |
| `bun run lint`             | ESLint (TypeScript, Rules of Hooks and React Compiler checks).       |
| `bun run format`           | Prettier (with Tailwind class sorting); `format:check` to verify.    |
| `bun run test`             | Unit and integration tests (`bun test`, SQLite in memory).           |
| `bun run test:e2e`         | Playwright against the production build. Run `bun run build` first.  |
| `bun run icons`            | Regenerates the favicon and app icon from `src/shared/lib/logo.ts`.  |
| `bun run changeset`        | Describe a change for the changelog.                                 |
| `bun run version-packages` | Apply changesets: bump the version and update `CHANGELOG.md`.        |
| `bun run desktop:dev`      | Desktop app with hot reload (starts `bun run dev` itself).           |
| `bun run desktop:build`    | Desktop app release build and installers in `target/release/bundle`. |
| `bun run test:rust`        | Rust tests for the engine, the MCP server and the desktop app.       |
| `bun run mcp -- [options]` | MCP server from source (see [MCP server](#mcp-server)).              |

End-to-end tests run in the installed Brave browser. If Brave is
not at `C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe`, set `BRAVE_PATH`.

## How it works

```
index.html             the page; loads src/main/main.tsx
src/
  main/                entry point, root providers (theme, motion) and the page switch
  features/
    editor/            editor (/): sidebar, tabs, grid, table view, query console, command palette
    vis/               schema visualizer (/vis): table cards, canvas, outline, inspector, save flow
      lib/             diagram model, draft design rules and SQL, auto-layout
  shared/
    ui/                shadcn/ui primitives mapped onto the design tokens
    components/        used by both pages: boot screen, database switcher, dialogs, logo,
                       theme toggle, change marks, link
      pastel/          design-system components (annotation marks, loader, code block…)
    hooks/             React Query bindings for the databases, saved queries, layout
    lib/
      sqlite/          engine API (worker in browsers, Tauri commands on desktop), session,
                       SQL/DDL builders, introspection, dump
      data/            formatting, import inference, export, grid layout helpers
      store/           Zustand stores (workspace tabs, dialogs)
      router.ts        the two pages and client-side navigation (History API)
  styles/globals.css   the Pastel Noir tokens (dark as designed, derived light theme)
src-tauri/             the desktop app (Rust)
crates/                the native SQLite engine and the MCP server (Rust)
e2e/  scripts/  public/
```

- **Two pages, one load.** `src/main/app.tsx` picks the page from the path; `shared/lib/router.ts`
  switches pages with the History API, so moving between the editor and the designer never reloads
  or reboots the engine. Unknown paths show the editor.
- **SQLite engine.** `getSqlite()` in `shared/lib/sqlite/client.ts` is the only way pages reach SQLite.
  On desktop it calls the native engine (see [Desktop app](#desktop-app)). In a browser it runs
  `worker.ts`, which loads the WASM runtime from `public/sqlite/` (bundling it breaks because the
  package spawns its own workers), installs the `opfs-sahpool` VFS and exposes the API through Comlink.
- **Safety.** Values are always bound parameters. Table and column names are checked against the
  introspected schema and quoted by one helper (`quoteIdent`). Destructive actions show their SQL first.
- **Loading.** Each page shows a staged boot loader while its UI downloads in parallel; CodeMirror, the
  CSV parser, schema dialogs and the command palette load on first use (`lazyComponent`). Motion
  features load after first paint. Fonts are bundled, so nothing is fetched from the network.

## Desktop app

The same pages run in a Tauri window on a native SQLite engine instead of the WASM worker. Nothing in
the pages changes: `getSqlite()` in `shared/lib/sqlite/client.ts` returns the worker in browsers and
`shared/lib/sqlite/desktop.ts` (Tauri commands) in the app, both with the worker's API. Values that
JSON can't carry (64-bit integers, blobs, infinities) travel as tagged objects
(`shared/lib/sqlite/cell-codec.ts`).

```
Cargo.toml             workspace
crates/
  sequill-core/        the engine: session, schema, dump and the database catalog (ports of
                       shared/lib/sqlite/session.ts, introspect.ts, dump.ts and the worker's catalog)
  sequill-mcp/         the MCP server (tools.rs: what each tool does; server.rs: the MCP side)
src-tauri/             the desktop app: one command per worker method, outside-change watcher
```

Databases are real files in the app's data folder (`%APPDATA%\com.adibitz.sequill` on Windows,
`~/Library/Application Support/com.adibitz.sequill` on macOS, `~/.local/share/com.adibitz.sequill` on
Linux), so other processes can open them. Databases kept in a browser's storage don't move over on
their own: download them there and open the files in the app. The app checks once a second whether
another process changed the open database or the list and refreshes what's on screen.

Building needs Rust (stable) and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

## MCP server

The desktop app includes an MCP server, so an AI assistant can work with the same databases.
Click **MCP** in the editor's top bar (next to **Jump to…**). It turns access on or off and shows
how to connect Claude Desktop, Claude Code or another client, with settings to copy. Access is
**off** until you turn it on; while it's off every tool call is refused. The server checks the switch
on every call, so turning it off stops an assistant at once, even mid-conversation. The switch is
stored in the catalog database next to the databases, so the app and the server share it.

To set a client up by hand, add this to its MCP settings (Claude Desktop: `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sequill": { "command": "C:\\Program Files\\Sequill\\sequill.exe", "args": ["mcp"] }
  }
}
```

The tools do what the editor does. These are always offered (while MCP is on):

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

Without `--allow-writes`, `query` and the other reads run on a connection SQLite opens read-only, and
the changing tools aren't offered at all. ATTACH is turned off, so a call can't reach other files.
Schema tools follow the editor's rules (the same checks and messages) and return the SQL they ran.
Deleting a database that the app has open is refused until the app switches to another one.
`show_in_app` waits a few seconds for the app to take the request and says so if Sequill isn't open.
Saved queries live in the catalog on desktop (moved there from the window's own storage on first
start), so the app and assistants share one list.
`--data-dir <path>` points it at another data folder. A database is named by its id or by its name.

## Logo

The Sequill mark is a pen nib whose top is stacked database disks (sequel and quill), in peach,
butter and mint on the near-black ground. It is drawn in code in `src/shared/lib/logo.ts`; the
`<Logo>` component renders it in the app, and `bun run icons` writes `public/logo.svg`,
`public/favicon.ico` (16–48px) and `public/icons/icon-512.png`, the source for the desktop icons
(`bun tauri icon public/icons/icon-512.png -o src-tauri/icons`). Sizes of 32px and under use a simpler
drawing (one disk and the nib) so the shape stays clear in a browser tab.

## Design system

The UI follows the Pastel Noir system: a grayscale ladder for structure, six pastels for meaning
(never colour alone), DM Sans for UI, JetBrains Mono for code and keys, and Caveat only beside a
hand-drawn arrow. The system is dark-first; the light theme inverts the gray ladder and adds a deep
"-ink" shade per pastel for text. Sizes and radii are scaled down for UI: the video system's values are
sized for a 1920×1080 frame, so the web radii are 4/6/8/10/14px (`xs`…`xl`) plus a pill.
Two extra hues mark unsaved schema changes: `--added` (green) and `--edited` (blue), each with an
`-ink` and `-wash` like the pastels and brighter than mint and sky so they don't read as either.
Scrollbars are thin gray pills (`--scrollbar-thumb`) that appear only while their scroll area is
hovered or focused; touch devices keep the browser's overlay scrollbars.

## Limitations

- In a browser, databases live in that browser's site storage (OPFS): clearing site data deletes them,
  and only one window can use them at a time (a window in the background hands them over). The
  desktop app keeps real files and has neither limit.
- Grid paging uses `LIMIT/OFFSET`, which slows down deep into very large tables.

## Releases

Changes are tracked with [Changesets](https://github.com/changesets/changesets): add one with
`bun run changeset`, and `bun run version-packages` bumps the version and writes `CHANGELOG.md`.
