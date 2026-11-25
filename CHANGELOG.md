# sqlite-browser-editor

## 1.2.4

### Patch Changes

- b9ffc9f: Loading screens show a hand-drawn circle that keeps re-drawing itself instead of a spinner.

## 1.2.3

### Patch Changes

- b481d24: The theme and row options in Settings show the selected choice with a sliding pill.

## 1.2.2

### Patch Changes

- 142ef6f: The header shows the Sequill logo instead of the name before the page switcher.

## 1.2.1

### Patch Changes

- Connecting an AI assistant is easier: the MCP guide is wider, picks the assistant from tiles with its logo, and shows steps for your computer (Windows, macOS or Linux). "Add to …" puts Sequill in Claude Desktop, Claude Code, Cursor, VS Code, Codex, Gemini CLI or Windsurf in one click, keeping the rest of their settings, then says what to do next, including how to fully quit Claude Desktop from the system tray or Task Manager.
- 1d555d8: The MCP button shows its state as a colored badge: on, read only or off.
- 9c56dce: The header is the same on the editor and schema pages: "Sequill / page" switches pages, and a new Settings popover holds the theme and the row density (moved out of the table toolbar). Tabs show the selected option with a sliding pill.
- Keyboard and screen reader fixes: focus stays visible in Windows high-contrast mode, the colour picker and query results move with the arrow keys, hints show on keyboard focus as well as hover, the open database is marked with a check, and search boxes and the filter count are announced. Row action buttons are always visible on touch screens.

## 1.2.0

### Minor Changes

- 236b88d: Unsaved schema designs now live in Sequill's catalog in the desktop app, so assistants can read and edit them over MCP with the new `get_design` and `set_design` tools, and the designer shows their edits live. The database only changes when you save the design. Drafts kept by earlier versions are moved over the first time the app opens.
- ae1b17e: Importing a schema now starts with the database type (PostgreSQL, MySQL / MariaDB, SQL Server, DuckDB or SQLite) and shows how to get its schema. Column types are kept exactly as written (arrays, `NVARCHAR(MAX)`, enums, structs), the type picker offers that database's own types, and its enums, functions, procedures, triggers, views, sequences and types are kept, shown in the designer's outline, editable and saved with the design. Exporting to the database a schema came from writes them back; DuckDB is a new export target.
- 5716548: Assistants keep working over MCP while Sequill is closed, or after it closes mid-conversation: `sequill mcp` runs the calls itself on the same data folder, with the same switches and history, and the app shows the changes when it opens. Assistants that Windows runs in an app package (Claude Desktop from the Microsoft Store) still need Sequill open, because Windows gives them a private copy of the data folder.
- 937e330: The schema designer's import now takes pasted SQL as well as files, and reads DuckDB schemas too (alongside PostgreSQL, MySQL / MariaDB, SQL Server, Oracle and SQLite). The imported tables become the saved schema you design on; nothing connects to your database.
- 3ab16e3: The schema designer can import a schema from a SQL script for PostgreSQL, MySQL / MariaDB, SQL Server, Oracle or standard SQL, or from a SQLite file, as a new database with no rows that isn't linked to the file. It can also export any design as `CREATE` statements for PostgreSQL, MySQL, SQL Server or SQLite. Desktop app only.
- 9f21386: A welcome guide opens the first time Sequill starts: opening or creating a database, browsing and editing data, designing the schema (drafts, import and export) and connecting an AI assistant. Open it again from the command palette with "Show the welcome guide".

### Patch Changes

- 41df77a: The desktop app no longer ships the browser build's SQLite (the WebAssembly engine and its worker, about 1.5 MB); it only ever used its native SQLite.
- aa06af2: An assistant's write that was saved is no longer reported as failed when Sequill is busy with a long write of its own. Before, the assistant saw "database is locked", retried, and added the rows twice.
- b963aab: Pasting cells copied from the grid keeps Windows line breaks (\r\n) inside a cell instead of turning them into plain line breaks.
- cb7a20c: Saving a schema design now lists every change in plain words (new tables and columns, renames, changed and deleted columns and tables) above the SQL. If the save fails, the reason stays in the review ("Nothing was saved: …"), naming the real table, and the design is kept so you can fix it.
- c1a285a: The schema designer can show the schema as saved, without your unsaved changes, read-only; one click brings your design back.

## 1.1.2

### Patch Changes

- a164073: Assistants now reach your databases through the open Sequill app instead of opening the files themselves, so they see the same list and files as the window. This fixes Claude Desktop on Windows, which gave the MCP server its own stale copy of Sequill's data folder. Keep Sequill open while an assistant works with it.

## 1.1.1

### Patch Changes

- df15d06: Queries an AI assistant shows you open in one reused "Assistant" tab instead of a new tab each time.
- a4b58db: Opened database files are now edited where they are instead of being copied into the app's data folder. Removing one from the list never deletes the file. The schema designer checks each edit on a structure-only copy of the database and always asks before saving to the database itself.
- f392708: The Windows installer and uninstaller show the Sequill icon.
- 10ffaf4: Everything an AI assistant does over MCP is kept in a history: open it with History, next to MCP in the top bar, or from "Assistant (MCP)" in the editor sidebar. The history stays on your computer and is deleted after a week by default; you can choose 1 day, 1 month, 3 months or never.
- e10a200: The MCP guide is now three plain steps with one-line install commands for Claude Code, Codex and Gemini CLI. "Allow changes" is a switch in the app that the MCP server checks on every call, so turning edits on or off no longer means setting the assistant up again.
- 3850003: An open table no longer goes blank when its columns change while it is on screen, for example when an AI assistant adds a column over MCP. The new column appears in place.
- fc7ad18: Removing or deleting the open database moves to another one instead of showing an empty error, and errors from the desktop app always show their reason.
- 49f7c5b: The window title shows the version of Sequill that is running.

## 1.1.0

### Minor Changes

- f969eda: Editor tabs get a right-click menu (close, close others, close tabs to the right, duplicate query). Open a file… in the database switcher now opens the picked file. Code blocks such as the MCP setup config have one clean frame and scroll long lines instead of wrapping, dialog scrollbars show only while hovered, the Jump to button has an outline, and the schema page header shows just "Schema".

## 1.0.0

### Major Changes

- 7ae3435: Sequill 1.0.0, the first desktop release: a Tauri app on a native SQLite engine written in Rust, with installers for Windows, macOS (Apple Silicon and Intel) and Linux. Databases are real files on your computer and everything works offline. It keeps the table grid, inline editing, SQL console, schema editor and visualizer, and CSV/JSON import and export, and adds a built-in MCP server so AI assistants can read, show and (when allowed) change the same databases.

## 0.2.2

### Patch Changes

- The installed app and a browser tab no longer lock each other out. A window in the background lets go of your databases and takes them back when it's shown; opening the app in another window hands them over, and the window that let go offers "Use here". "Try again" on the loading error now really retries. The footer also links to more apps by adibitz.

## 0.2.1

### Patch Changes

- The "or drop a file anywhere" hint on the editor's welcome screen now has its arrow pointing up at "Open a .sqlite file", and handwritten notes no longer cut off their last letters. Touch screens no longer show the drop hint.

## 0.2.0

### Minor Changes

- b552847: First release: an offline SQLite browser and editor running SQLite WASM in the browser (OPFS storage), with a table grid, inline editing, SQL console, schema editor, CSV/JSON import and export, installable PWA, light and dark themes, and a landing page.

### Patch Changes

- Faster first load: the fonts now download only the weights the app uses (fonts preloaded on every page drop from 152 KB to 117 KB). The offline service worker is built with Serwist's Next.js integration and keeps the exported pages, chunks, fonts and the SQLite runtime cached, revisioning pages by their content so they are re-downloaded only when they change.
