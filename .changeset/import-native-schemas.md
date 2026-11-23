---
"sqlite-browser-editor": minor
---

Importing a schema now starts with the database type (PostgreSQL, MySQL / MariaDB, SQL Server, DuckDB or SQLite) and shows how to get its schema. Column types are kept exactly as written (arrays, `NVARCHAR(MAX)`, enums, structs), the type picker offers that database's own types, and its enums, functions, procedures, triggers, views, sequences and types are kept, shown in the designer's outline, editable and saved with the design. Exporting to the database a schema came from writes them back; DuckDB is a new export target.
