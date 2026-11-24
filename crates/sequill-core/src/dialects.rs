//! Schemas from and for other databases. Import reads the tables, keys and indexes of a SQL
//! script written for another database (PostgreSQL, MySQL, SQL Server…) and writes them as
//! SQLite, keeping each column's declared type as written. Export writes a SQLite schema as
//! another database's `CREATE` statements. Only structure travels, never rows.

use crate::dump::quote_ident;
use crate::error::{Error, Result};
use crate::schema::{ExtraObject, OBJECTS_TABLE, RelationInfo, RelationKind};
use crate::session::Session;
use crate::split::split_statements;
use crate::sql_objects::{object_of, split_script, sqlite_type_name};
use serde::Deserialize;
use sqlparser::ast::{
    ColumnDef, ColumnOption, CreateIndex, Expr, ForeignKeyConstraint, IndexColumn, ObjectName,
    ReferentialAction, Statement, TableConstraint,
};
use sqlparser::dialect::dialect_from_str;
use sqlparser::parser::Parser;

/// A script for another database as SQLite statements, the objects SQLite can't run (kept
/// as SQL), and what was left out (such as "CREATE EXTENSION (2)").
pub struct Converted {
    pub statements: Vec<String>,
    pub objects: Vec<ExtraObject>,
    pub skipped: Vec<String>,
}

/// Converts `script`, written for `dialect` (a name such as "postgresql", "mysql", "mssql",
/// "oracle" or "generic"; "sqlite" passes statements through), into SQLite statements.
/// Statements that can't be read or have no SQLite equivalent are skipped, not fatal.
pub fn to_sqlite(dialect: &str, script: &str) -> Result<Converted> {
    let parser_dialect = dialect_from_str(dialect)
        .ok_or_else(|| Error::msg(format!("Sequill can't read SQL written for \"{dialect}\"")))?;
    // psql meta-commands (\connect, \restrict) aren't SQL.
    let script: String = script
        .lines()
        .filter(|l| !l.trim_start().starts_with('\\'))
        .collect::<Vec<_>>()
        .join("\n");
    let mut out = Converted {
        statements: Vec::new(),
        objects: Vec::new(),
        skipped: Vec::new(),
    };
    if dialect.eq_ignore_ascii_case("sqlite") {
        out.statements = split_statements(&script);
        return Ok(out);
    }
    let mut tables: Vec<Table> = Vec::new();
    let mut indexes = Vec::new();
    let mut skipped = Vec::new();
    for sql in split_script(dialect, &script) {
        // Enums, functions, triggers, views…: kept as written (the last one of a name wins).
        if let Some(object) = object_of(&sql) {
            out.objects
                .retain(|o| !(o.kind == object.kind && o.name == object.name));
            out.objects.push(object);
            continue;
        }
        let parsed = Parser::parse_sql(&*parser_dialect, &sql).unwrap_or_default();
        let mut used = !parsed.is_empty();
        for statement in parsed {
            used &= match statement {
                Statement::CreateTable(create) => {
                    tables.push(Table {
                        name: last_name(&create.name),
                        columns: create.columns.iter().map(column_sql).collect(),
                        constraints: create
                            .constraints
                            .iter()
                            .filter_map(constraint_sql)
                            .collect(),
                    });
                    true
                }
                Statement::AlterTable(alter) => {
                    let name = last_name(&alter.name);
                    let table = tables
                        .iter_mut()
                        .find(|t| t.name.eq_ignore_ascii_case(&name));
                    let added: Vec<String> = alter
                        .operations
                        .iter()
                        .filter_map(|op| match op {
                            sqlparser::ast::AlterTableOperation::AddConstraint {
                                constraint,
                                ..
                            } => constraint_sql(constraint),
                            _ => None,
                        })
                        .collect();
                    let all_added = added.len() == alter.operations.len();
                    // SQLite can't add constraints later: they join the table's CREATE.
                    match table {
                        Some(table) if !added.is_empty() => {
                            table.constraints.extend(added);
                            all_added
                        }
                        _ => false,
                    }
                }
                Statement::CreateIndex(index) => match index_sql(&index) {
                    Some(sql) => {
                        indexes.push(sql);
                        true
                    }
                    None => false,
                },
                _ => false,
            };
        }
        if !used {
            skipped.push(sql);
        }
    }
    out.statements = tables.iter().map(Table::sql).chain(indexes).collect();
    out.skipped = summarize(&skipped);
    Ok(out)
}

struct Table {
    name: String,
    columns: Vec<String>,
    constraints: Vec<String>,
}

impl Table {
    fn sql(&self) -> String {
        let parts: Vec<&str> = self
            .columns
            .iter()
            .chain(&self.constraints)
            .map(String::as_str)
            .collect();
        format!(
            "CREATE TABLE {} (\n  {}\n)",
            quote_ident(&self.name),
            parts.join(",\n  ")
        )
    }
}

/// The table's own name, without a schema such as `public.`.
fn last_name(name: &ObjectName) -> String {
    name.0
        .last()
        .and_then(|part| part.as_ident())
        .map_or_else(|| name.to_string(), |ident| ident.value.clone())
}

fn column_sql(column: &ColumnDef) -> String {
    let mut sql = format!(
        "{} {}",
        quote_ident(&column.name.value),
        sqlite_type_name(&column.data_type.to_string())
    );
    for option in &column.options {
        match &option.option {
            ColumnOption::NotNull => sql.push_str(" NOT NULL"),
            ColumnOption::PrimaryKey(_) => sql.push_str(" PRIMARY KEY"),
            ColumnOption::Unique(_) => sql.push_str(" UNIQUE"),
            ColumnOption::Default(expr) => {
                if let Some(value) = literal(expr) {
                    sql.push_str(&format!(" DEFAULT {value}"));
                }
            }
            ColumnOption::ForeignKey(fk) => {
                sql.push(' ');
                sql.push_str(&references(fk));
            }
            _ => {}
        }
    }
    sql
}

/// A default SQLite can store as written: a literal (casts such as PostgreSQL's
/// `'x'::text` removed), a negative number, or the current date or time.
fn literal(expr: &Expr) -> Option<String> {
    match expr {
        Expr::Value(_) => Some(expr.to_string()),
        Expr::Cast { expr, .. } | Expr::Nested(expr) => literal(expr),
        Expr::UnaryOp { expr: inner, .. } if matches!(**inner, Expr::Value(_)) => {
            Some(expr.to_string())
        }
        _ => {
            let text = expr.to_string().to_uppercase();
            let now = ["CURRENT_TIMESTAMP", "CURRENT_DATE", "CURRENT_TIME"];
            now.contains(&text.trim_end_matches("()"))
                .then(|| text.trim_end_matches("()").to_owned())
        }
    }
}

fn names(columns: &[IndexColumn]) -> Option<String> {
    let names: Option<Vec<String>> = columns
        .iter()
        .map(|c| match &c.column.expr {
            Expr::Identifier(ident) => Some(quote_ident(&ident.value)),
            _ => None,
        })
        .collect();
    names.map(|n| n.join(", "))
}

fn idents(columns: &[sqlparser::ast::Ident]) -> String {
    columns
        .iter()
        .map(|c| quote_ident(&c.value))
        .collect::<Vec<_>>()
        .join(", ")
}

fn references(fk: &ForeignKeyConstraint) -> String {
    let mut sql = format!("REFERENCES {}", quote_ident(&last_name(&fk.foreign_table)));
    if !fk.referred_columns.is_empty() {
        sql.push_str(&format!(" ({})", idents(&fk.referred_columns)));
    }
    let action = |a: &ReferentialAction| a.to_string();
    if let Some(on_delete) = &fk.on_delete {
        sql.push_str(&format!(" ON DELETE {}", action(on_delete)));
    }
    if let Some(on_update) = &fk.on_update {
        sql.push_str(&format!(" ON UPDATE {}", action(on_update)));
    }
    sql
}

// shortcut: MySQL's inline KEY/INDEX entries are skipped, upgrade by emitting them as
// CREATE INDEX if MySQL imports need their plain indexes.
fn constraint_sql(constraint: &TableConstraint) -> Option<String> {
    match constraint {
        TableConstraint::PrimaryKey(pk) => Some(format!("PRIMARY KEY ({})", names(&pk.columns)?)),
        TableConstraint::Unique(unique) => Some(format!("UNIQUE ({})", names(&unique.columns)?)),
        TableConstraint::ForeignKey(fk) if !fk.columns.is_empty() => Some(format!(
            "FOREIGN KEY ({}) {}",
            idents(&fk.columns),
            references(fk)
        )),
        _ => None,
    }
}

/// Plain indexes on columns; partial and expression indexes have no portable form.
fn index_sql(index: &CreateIndex) -> Option<String> {
    if index.predicate.is_some() {
        return None;
    }
    let name = last_name(index.name.as_ref()?);
    Some(format!(
        "CREATE {}INDEX {} ON {} ({})",
        if index.unique { "UNIQUE " } else { "" },
        quote_ident(&name),
        quote_ident(&last_name(&index.table_name)),
        names(&index.columns)?
    ))
}

/// Skipped CREATE statements by kind, in order, such as "CREATE FUNCTION (2)". Settings,
/// ownership, comments and rows are expected to be skipped, so they aren't listed.
fn summarize(skipped: &[String]) -> Vec<String> {
    let mut kinds: Vec<(String, usize)> = Vec::new();
    for sql in skipped {
        let words: Vec<String> = sql
            .lines()
            .filter(|l| !l.trim_start().starts_with("--"))
            .flat_map(str::split_whitespace)
            .take(2)
            .map(str::to_uppercase)
            .collect();
        if words.first().map(String::as_str) != Some("CREATE") {
            continue;
        }
        let kind = words.join(" ");
        match kinds.iter_mut().find(|(k, _)| *k == kind) {
            Some((_, n)) => *n += 1,
            None => kinds.push((kind, 1)),
        }
    }
    kinds
        .into_iter()
        .map(|(kind, n)| {
            if n == 1 {
                kind
            } else {
                format!("{kind} ({n})")
            }
        })
        .collect()
}

/// A database to write a schema for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Target {
    Sqlite,
    Postgresql,
    Mysql,
    Mssql,
    Duckdb,
}

impl Target {
    /// The name an imported schema records for this database (`Schema::dialect`).
    fn dialect(self) -> &'static str {
        match self {
            Target::Sqlite => "sqlite",
            Target::Postgresql => "postgresql",
            Target::Mysql => "mysql",
            Target::Mssql => "mssql",
            Target::Duckdb => "duckdb",
        }
    }

    fn quote(self, name: &str) -> String {
        match self {
            Target::Mysql => format!("`{}`", name.replace('`', "``")),
            Target::Mssql => format!("[{}]", name.replace(']', "]]")),
            Target::Sqlite | Target::Postgresql | Target::Duckdb => quote_ident(name),
        }
    }

    /// SQLite's own type names in this database; other declared types are kept as written.
    // shortcut: maps only SQLite's storage classes, upgrade with a per-type table if
    // designs carry types that a target rejects.
    fn column_type(self, declared: &str, in_key: bool) -> String {
        let upper = declared.trim().to_uppercase();
        let text = upper.is_empty() || upper == "TEXT";
        match (self, upper.as_str()) {
            (Target::Mssql, _) if text => "NVARCHAR(MAX)".into(),
            // MySQL can't index TEXT without a length.
            (Target::Mysql, _) if text && in_key => "VARCHAR(255)".into(),
            (_, _) if text => "TEXT".into(),
            (Target::Postgresql, "BLOB") => "BYTEA".into(),
            (Target::Mssql, "BLOB") => "VARBINARY(MAX)".into(),
            (Target::Postgresql, "REAL") => "DOUBLE PRECISION".into(),
            (Target::Mysql | Target::Duckdb, "REAL") => "DOUBLE".into(),
            (Target::Mssql, "REAL") => "FLOAT".into(),
            _ => declared.trim().to_owned(),
        }
    }

    /// What makes an INTEGER PRIMARY KEY number new rows by itself.
    fn identity(self) -> &'static str {
        match self {
            Target::Postgresql => " GENERATED BY DEFAULT AS IDENTITY",
            Target::Mysql => " AUTO_INCREMENT",
            Target::Mssql => " IDENTITY(1,1)",
            // DuckDB numbers rows with a sequence the schema has to create itself.
            Target::Sqlite | Target::Duckdb => "",
        }
    }

    /// An imported object (function, trigger…) as a statement this database's tools run.
    fn object_sql(self, object: &ExtraObject) -> String {
        if object.kind == "enum" {
            let values: Vec<String> = serde_json::from_str::<Vec<String>>(&object.body)
                .unwrap_or_default()
                .iter()
                .map(|v| format!("'{}'", v.replace('\'', "''")))
                .collect();
            return format!(
                "CREATE TYPE {} AS ENUM ({});",
                self.quote(&object.name),
                values.join(", ")
            );
        }
        let body = object.body.trim().trim_end_matches(';').trim_end();
        match self {
            // A routine's own semicolons would end it early: change the delimiter around it.
            Target::Mysql if body.contains(';') => format!("DELIMITER ;;\n{body};;\nDELIMITER ;"),
            // CREATE PROCEDURE, FUNCTION, TRIGGER and VIEW must each be alone in a batch.
            Target::Mssql => format!("GO\n{body}\nGO"),
            _ => format!("{body};"),
        }
    }
}

/// Objects created before the tables (they may use them) and after (they use the tables).
const OBJECTS_BEFORE: [&str; 4] = ["sequence", "enum", "type", "function"];
const OBJECTS_AFTER: [&str; 3] = ["view", "procedure", "trigger"];

/// The schema that SQLite `statements` (a whole design, such as the designer's) make, as
/// `CREATE` statements for `target`. An imported schema's enums, functions, procedures,
/// triggers, views, sequences and types are written as they were imported when the target
/// is the database they came from; otherwise, like SQLite's own views and triggers, they are
/// listed in a comment instead.
pub fn export_schema(statements: &[String], target: Target) -> Result<String> {
    let design = Session::memory()?;
    for sql in statements {
        design.connection().execute_batch(sql)?;
    }
    if target == Target::Sqlite {
        design.connection().execute_batch(&format!(
            "DROP TABLE IF EXISTS {}",
            quote_ident(OBJECTS_TABLE)
        ))?;
        return design.dump();
    }
    let schema = design.schema()?;
    let same_database = schema.dialect.as_deref() == Some(target.dialect());
    let objects_of = |kinds: &[&str]| -> Vec<String> {
        kinds
            .iter()
            .flat_map(|kind| schema.objects.iter().filter(move |o| o.kind == *kind))
            .map(|o| target.object_sql(o))
            .collect()
    };
    let mut left_out: Vec<String> = schema
        .views
        .iter()
        .map(|v| format!("view {}", v.name))
        .collect();
    left_out.extend(
        schema
            .triggers
            .iter()
            .map(|t| format!("trigger {}", t.name)),
    );
    if !same_database {
        left_out.extend(
            schema
                .objects
                .iter()
                .map(|o| format!("{} {}", o.kind, o.name)),
        );
    }

    let mut out: Vec<String> = if same_database {
        objects_of(&OBJECTS_BEFORE)
    } else {
        Vec::new()
    };
    let mut indexes = Vec::new();
    let mut keys = Vec::new();
    // DuckDB can't add foreign keys later: they go inside CREATE TABLE, referenced tables first.
    let inline_keys = target == Target::Duckdb;
    for table in creation_order(&schema.tables, inline_keys) {
        if table.kind != RelationKind::Table {
            left_out.push(format!("virtual table {}", table.name));
            continue;
        }
        out.push(create_table(table, target, inline_keys));
        for index in table.indexes.iter().filter(|i| i.origin == "c") {
            if index.partial {
                left_out.push(format!("partial index {}", index.name));
                continue;
            }
            let columns: Vec<String> = index.columns.iter().map(|c| target.quote(c)).collect();
            indexes.push(format!(
                "CREATE {}INDEX {} ON {} ({});",
                if index.unique { "UNIQUE " } else { "" },
                target.quote(&index.name),
                target.quote(&table.name),
                columns.join(", ")
            ));
        }
        if !inline_keys {
            keys.extend(
                foreign_keys(table, target)
                    .into_iter()
                    .map(|key| format!("ALTER TABLE {} ADD {key};", target.quote(&table.name))),
            );
        }
    }
    out.extend(indexes);
    out.extend(keys);
    if same_database {
        out.extend(objects_of(&OBJECTS_AFTER));
    }
    if !left_out.is_empty() {
        out.push(format!(
            "-- Not exported (not written for this database): {}",
            left_out.join(", ")
        ));
    }
    Ok(format!("{}\n", out.join("\n\n")))
}

/// Tables in the order to create them: as they are, or (`referenced_first`) each after the
/// tables its foreign keys point at, where cycles allow.
fn creation_order(tables: &[RelationInfo], referenced_first: bool) -> Vec<&RelationInfo> {
    if !referenced_first {
        return tables.iter().collect();
    }
    fn visit<'a>(
        table: &'a RelationInfo,
        tables: &'a [RelationInfo],
        seen: &mut Vec<&'a str>,
        out: &mut Vec<&'a RelationInfo>,
    ) {
        if seen.contains(&table.name.as_str()) {
            return;
        }
        seen.push(&table.name);
        for key in &table.foreign_keys {
            if let Some(target) = tables.iter().find(|t| t.name == key.table) {
                visit(target, tables, seen, out);
            }
        }
        out.push(table);
    }
    let mut seen = Vec::new();
    let mut out = Vec::new();
    for table in tables {
        visit(table, tables, &mut seen, &mut out);
    }
    out
}

fn create_table(table: &RelationInfo, target: Target, inline_keys: bool) -> String {
    let mut pk: Vec<_> = table.columns.iter().filter(|c| c.pk > 0).collect();
    pk.sort_by_key(|c| c.pk);
    let keyed = |name: &str| {
        pk.iter().any(|c| c.name == name)
            || table
                .indexes
                .iter()
                .any(|i| i.columns.iter().any(|c| c == name))
            || table.foreign_keys.iter().any(|f| f.from == name)
    };
    // SQLite numbers an INTEGER PRIMARY KEY by itself; other databases need to be told.
    let auto =
        (pk.len() == 1 && !table.without_rowid && pk[0].type_name.eq_ignore_ascii_case("INTEGER"))
            .then(|| pk[0].name.clone());
    let mut parts: Vec<String> = table
        .columns
        .iter()
        .filter(|c| c.hidden == 0)
        .map(|c| {
            let mut sql = format!(
                "{} {}",
                target.quote(&c.name),
                target.column_type(&c.type_name, keyed(&c.name))
            );
            if c.not_null || c.pk > 0 {
                sql.push_str(" NOT NULL");
            }
            if let Some(default) = &c.default_value {
                sql.push_str(&format!(" DEFAULT {default}"));
            }
            if auto.as_deref() == Some(c.name.as_str()) {
                sql.push_str(target.identity());
            }
            sql
        })
        .collect();
    if !pk.is_empty() {
        let names: Vec<String> = pk.iter().map(|c| target.quote(&c.name)).collect();
        parts.push(format!("PRIMARY KEY ({})", names.join(", ")));
    }
    for unique in table.indexes.iter().filter(|i| i.origin == "u") {
        let names: Vec<String> = unique.columns.iter().map(|c| target.quote(c)).collect();
        parts.push(format!("UNIQUE ({})", names.join(", ")));
    }
    if inline_keys {
        parts.extend(foreign_keys(table, target));
    }
    format!(
        "CREATE TABLE {} (\n  {}\n);",
        target.quote(&table.name),
        parts.join(",\n  ")
    )
}

/// Each foreign key as a `FOREIGN KEY (…) REFERENCES …` clause.
fn foreign_keys(table: &RelationInfo, target: Target) -> Vec<String> {
    let mut ids: Vec<i64> = table.foreign_keys.iter().map(|f| f.id).collect();
    ids.dedup();
    ids.into_iter()
        .map(|id| {
            let mut parts: Vec<_> = table.foreign_keys.iter().filter(|f| f.id == id).collect();
            parts.sort_by_key(|f| f.seq);
            let from: Vec<String> = parts.iter().map(|f| target.quote(&f.from)).collect();
            let to: Vec<String> = parts
                .iter()
                .filter_map(|f| f.to.as_deref().map(|t| target.quote(t)))
                .collect();
            let mut sql = format!(
                "FOREIGN KEY ({}) REFERENCES {}",
                from.join(", "),
                target.quote(&parts[0].table)
            );
            if !to.is_empty() {
                sql.push_str(&format!(" ({})", to.join(", ")));
            }
            let on_delete = match (target, parts[0].on_delete.as_str()) {
                (_, "NO ACTION") => None,
                (Target::Mssql, "RESTRICT") => None,
                (_, action) => Some(action),
            };
            if let Some(action) = on_delete {
                sql.push_str(&format!(" ON DELETE {action}"));
            }
            sql
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// What `pg_dump --schema-only` writes, trimmed.
    const PG_DUMP: &str = r#"
\restrict abc123
SET statement_timeout = 0;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE FUNCTION public.touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
CREATE TABLE public.customer (
    id integer NOT NULL,
    name character varying(120) NOT NULL,
    tags text[],
    status text DEFAULT 'new'::text,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.customer OWNER TO app;
CREATE SEQUENCE public.customer_id_seq AS integer START WITH 1;
CREATE TABLE public."order" (
    id integer NOT NULL,
    customer_id integer,
    total numeric(10,2) DEFAULT 0
);
ALTER TABLE ONLY public.customer ADD CONSTRAINT customer_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public."order" ADD CONSTRAINT order_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;
CREATE INDEX order_customer ON public."order" USING btree (customer_id);
CREATE INDEX active_customer ON public.customer USING btree (name) WHERE (status = 'active'::text);
"#;

    fn run(statements: &[String]) -> Session {
        let session = Session::memory().unwrap();
        for sql in statements {
            session.connection().execute_batch(sql).unwrap();
        }
        session
    }

    #[test]
    fn reads_a_postgres_dump_with_keys_added_after_the_tables() {
        let converted = to_sqlite("postgresql", PG_DUMP).unwrap();
        assert_eq!(
            converted.skipped,
            ["CREATE INDEX"],
            "the partial index is listed"
        );
        // The function (its $$ body whole) and the sequence are kept as written.
        let kept: Vec<(&str, &str)> = converted
            .objects
            .iter()
            .map(|o| (o.kind.as_str(), o.name.as_str()))
            .collect();
        assert_eq!(
            kept,
            [("function", "touch"), ("sequence", "customer_id_seq")]
        );
        assert!(converted.objects[0].body.ends_with("RETURN NEW; END; $$"));
        let schema = run(&converted.statements).schema().unwrap();

        let customer = schema.tables.iter().find(|t| t.name == "customer").unwrap();
        let types: Vec<&str> = customer
            .columns
            .iter()
            .map(|c| c.type_name.as_str())
            .collect();
        assert_eq!(
            types,
            [
                "INTEGER",
                "CHARACTER VARYING(120)",
                "TEXT[]",
                "TEXT",
                "TIMESTAMP WITH TIME ZONE"
            ]
        );
        assert_eq!(customer.columns[0].pk, 1);
        assert_eq!(customer.columns[3].default_value.as_deref(), Some("'new'"));
        // now() has no SQLite equivalent; the default is left out rather than failing.
        assert_eq!(customer.columns[4].default_value, None);

        let order = schema.tables.iter().find(|t| t.name == "order").unwrap();
        assert_eq!(order.foreign_keys[0].table, "customer");
        assert_eq!(order.foreign_keys[0].on_delete, "CASCADE");
        let indexes: Vec<&str> = schema.indexes.iter().map(|i| i.name.as_str()).collect();
        assert_eq!(indexes, ["order_customer"]);
    }

    /// What the app's SQL-editor query for PostgreSQL (src/features/vis/lib/postgresql-schema.sql)
    /// printed on PostgreSQL 17: keys inline, foreign keys added after, objects in full.
    const PG_CATALOG_QUERY: &str = include_str!("../tests/fixtures/postgres-catalog-query.sql");

    #[test]
    fn reads_the_output_of_the_sql_editor_query() {
        let converted = to_sqlite("postgresql", PG_CATALOG_QUERY).unwrap();
        assert_eq!(
            converted.skipped,
            ["CREATE INDEX"],
            "only the partial index"
        );
        let kept: Vec<(&str, &str)> = converted
            .objects
            .iter()
            .map(|o| (o.kind.as_str(), o.name.as_str()))
            .collect();
        assert_eq!(
            kept,
            [
                ("type", "address"),
                ("enum", "mood"),
                ("type", "email"),
                ("sequence", "customer_id_seq"),
                ("sequence", "invoice_no"),
                ("procedure", "noop"),
                ("function", "stamp"),
                ("view", "sad_tickets"),
                ("view", "totals"),
                ("trigger", "ticket_stamp"),
            ]
        );
        let schema = run(&converted.statements).schema().unwrap();
        let ticket = schema.tables.iter().find(|t| t.name == "ticket").unwrap();
        assert_eq!(ticket.columns[0].pk, 1);
        assert_eq!(
            ticket.columns[2].type_name, "MOOD",
            "the enum's name is kept as the type"
        );
        assert_eq!(ticket.foreign_keys[0].table, "customer");
        assert_eq!(ticket.foreign_keys[0].on_delete, "CASCADE");
        let customer = schema.tables.iter().find(|t| t.name == "customer").unwrap();
        assert_eq!(customer.columns[0].pk, 1);
    }

    #[test]
    fn reads_duckdb() {
        let duckdb = "CREATE SEQUENCE event_ids START 1;
            CREATE TABLE app_user (id INTEGER PRIMARY KEY, email VARCHAR NOT NULL UNIQUE);
            CREATE TABLE event (
                id BIGINT PRIMARY KEY DEFAULT nextval('event_ids'),
                user_id INTEGER REFERENCES app_user(id),
                tags VARCHAR[],
                payload STRUCT(kind VARCHAR, size INTEGER),
                at TIMESTAMP DEFAULT current_timestamp
            );
            CREATE INDEX event_user ON event (user_id);";
        let converted = to_sqlite("duckdb", duckdb).unwrap();
        assert!(converted.skipped.is_empty());
        assert_eq!(converted.objects[0].kind, "sequence");
        let schema = run(&converted.statements).schema().unwrap();
        let event = schema.tables.iter().find(|t| t.name == "event").unwrap();
        let types: Vec<&str> = event.columns.iter().map(|c| c.type_name.as_str()).collect();
        assert_eq!(
            types,
            [
                "BIGINT",
                "INTEGER",
                "VARCHAR[]",
                "STRUCT(KIND VARCHAR, SIZE INTEGER)",
                "TIMESTAMP"
            ]
        );
        assert_eq!(event.foreign_keys[0].table, "app_user");
        assert_eq!(
            event.columns[4].default_value.as_deref(),
            Some("CURRENT_TIMESTAMP")
        );
        assert_eq!(schema.indexes.len(), 1);
    }

    #[test]
    fn reads_mysql_and_sql_server() {
        let mysql = "CREATE TABLE `post` (
            `id` int unsigned NOT NULL AUTO_INCREMENT,
            `title` varchar(200) NOT NULL DEFAULT '',
            `status` enum('draft','live') DEFAULT 'draft',
            PRIMARY KEY (`id`),
            UNIQUE KEY `title_unique` (`title`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
        let schema = run(&to_sqlite("mysql", mysql).unwrap().statements)
            .schema()
            .unwrap();
        let post = &schema.tables[0];
        let types: Vec<&str> = post.columns.iter().map(|c| c.type_name.as_str()).collect();
        // An inline ENUM keeps its values exactly (not upper-cased).
        assert_eq!(
            types,
            ["INT UNSIGNED", "VARCHAR(200)", "ENUM('draft', 'live')"]
        );
        assert!(post.indexes.iter().any(|i| i.origin == "u"));

        let mssql = "CREATE TABLE [dbo].[Item] ([Id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY, [Name] NVARCHAR(MAX) NULL)";
        let schema = run(&to_sqlite("mssql", mssql).unwrap().statements)
            .schema()
            .unwrap();
        let types: Vec<&str> = schema.tables[0]
            .columns
            .iter()
            .map(|c| c.type_name.as_str())
            .collect();
        assert_eq!(types, ["INT", "NVARCHAR(MAX)"]);
    }

    #[test]
    fn refuses_an_unknown_dialect() {
        assert!(to_sqlite("cobol", "CREATE TABLE t (a int)").is_err());
    }

    const SHOP: &[&str] = &[
        "CREATE TABLE customer (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, photo BLOB, score REAL DEFAULT 0)",
        "CREATE TABLE \"order\" (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customer(id) ON DELETE CASCADE, note TEXT)",
        "CREATE INDEX order_customer ON \"order\"(customer_id)",
        "CREATE VIEW big AS SELECT * FROM customer",
    ];

    fn export(target: Target) -> String {
        let statements: Vec<String> = SHOP.iter().map(|s| (*s).to_owned()).collect();
        export_schema(&statements, target).unwrap()
    }

    #[test]
    fn writes_each_database_s_own_types_quotes_and_numbering() {
        let pg = export(Target::Postgresql);
        assert!(
            pg.contains("\"id\" INTEGER NOT NULL GENERATED BY DEFAULT AS IDENTITY"),
            "{pg}"
        );
        assert!(pg.contains("\"photo\" BYTEA"), "{pg}");
        assert!(pg.contains("\"score\" DOUBLE PRECISION DEFAULT 0"), "{pg}");
        assert!(pg.contains("ALTER TABLE \"order\" ADD FOREIGN KEY (\"customer_id\") REFERENCES \"customer\" (\"id\") ON DELETE CASCADE;"), "{pg}");
        assert!(
            pg.contains("-- Not exported (not written for this database): view big"),
            "{pg}"
        );

        let mysql = export(Target::Mysql);
        assert!(
            mysql.contains("`id` INTEGER NOT NULL AUTO_INCREMENT"),
            "{mysql}"
        );
        assert!(
            mysql.contains("`name` VARCHAR(255) NOT NULL"),
            "TEXT in a key needs a length: {mysql}"
        );
        assert!(mysql.contains("`note` TEXT"), "{mysql}");
        assert!(
            mysql.contains("CREATE INDEX `order_customer` ON `order` (`customer_id`);"),
            "{mysql}"
        );

        let mssql = export(Target::Mssql);
        assert!(
            mssql.contains("[id] INTEGER NOT NULL IDENTITY(1,1)"),
            "{mssql}"
        );
        assert!(mssql.contains("[name] NVARCHAR(MAX) NOT NULL"), "{mssql}");
        assert!(mssql.contains("[photo] VARBINARY(MAX)"), "{mssql}");
    }

    #[test]
    fn a_sqlite_export_runs_back_into_the_same_schema() {
        let sql = export(Target::Sqlite);
        let back = Session::memory().unwrap();
        back.connection().execute_batch(&sql).unwrap();
        let names: Vec<String> = back
            .schema()
            .unwrap()
            .tables
            .into_iter()
            .map(|t| t.name)
            .collect();
        assert_eq!(names, ["customer", "order"]);
    }

    #[test]
    fn a_postgres_export_imports_back() {
        let pg = export(Target::Postgresql);
        let converted = to_sqlite("postgresql", &pg).unwrap();
        let schema = run(&converted.statements).schema().unwrap();
        let order = schema.tables.iter().find(|t| t.name == "order").unwrap();
        assert_eq!(order.foreign_keys[0].table, "customer");
    }

    /// An imported schema as the designer's statements make it: tables plus its objects.
    fn imported(dialect: &str, script: &str) -> Vec<String> {
        let converted = to_sqlite(dialect, script).unwrap();
        let mut statements = converted.statements;
        statements.push(crate::sql_objects::objects_sql(dialect, &converted.objects));
        statements
    }

    #[test]
    fn writes_a_schema_back_to_its_own_database_with_enums_functions_and_triggers() {
        let script = "CREATE TYPE mood AS ENUM ('sad', 'happy');
            CREATE SEQUENCE ticket_ids;
            CREATE TABLE ticket (id integer PRIMARY KEY, feeling mood NOT NULL, tags text[]);
            CREATE FUNCTION stamp() RETURNS trigger AS $$ BEGIN NEW.tags := '{}'; RETURN NEW; END $$ LANGUAGE plpgsql;
            CREATE TRIGGER ticket_stamp BEFORE INSERT ON ticket FOR EACH ROW EXECUTE FUNCTION stamp();
            CREATE VIEW sad_tickets AS SELECT * FROM ticket WHERE feeling = 'sad';";
        let pg = export_schema(&imported("postgresql", script), Target::Postgresql).unwrap();
        let at = |needle: &str| {
            pg.find(needle)
                .unwrap_or_else(|| panic!("{needle} in {pg}"))
        };
        // Types and sequences before the tables, the function too; view and trigger after.
        assert!(
            at("CREATE TYPE \"mood\" AS ENUM ('sad', 'happy');") < at("CREATE TABLE \"ticket\"")
        );
        assert!(at("CREATE SEQUENCE ticket_ids;") < at("CREATE TABLE \"ticket\""));
        assert!(
            at("$$ BEGIN NEW.tags := '{}'; RETURN NEW; END $$") < at("CREATE TABLE \"ticket\"")
        );
        assert!(at("CREATE TABLE \"ticket\"") < at("CREATE TRIGGER ticket_stamp"));
        assert!(at("CREATE TABLE \"ticket\"") < at("CREATE VIEW sad_tickets"));
        assert!(pg.contains("\"feeling\" mood NOT NULL"), "{pg}");
        assert!(pg.contains("\"tags\" TEXT[]"), "{pg}");
        assert!(!pg.contains("Not exported"), "{pg}");

        // To another database, the objects are listed instead of written.
        let mysql = export_schema(&imported("postgresql", script), Target::Mysql).unwrap();
        assert!(!mysql.contains("CREATE TRIGGER"), "{mysql}");
        assert!(mysql.contains("enum mood"), "{mysql}");
        assert!(mysql.contains("trigger ticket_stamp"), "{mysql}");
    }

    #[test]
    fn mysql_and_sql_server_routines_come_back_runnable() {
        let mysql = "CREATE TABLE t (n int);
DELIMITER ;;
CREATE PROCEDURE bump() BEGIN UPDATE t SET n = n + 1; END ;;
DELIMITER ;";
        let out = export_schema(&imported("mysql", mysql), Target::Mysql).unwrap();
        assert!(
            out.contains("DELIMITER ;;\nCREATE PROCEDURE bump() BEGIN UPDATE t SET n = n + 1; END;;\nDELIMITER ;"),
            "{out}"
        );

        let mssql =
            "CREATE TABLE t (n INT);\nGO\nCREATE PROCEDURE bump AS UPDATE t SET n = n + 1;\nGO";
        let out = export_schema(&imported("mssql", mssql), Target::Mssql).unwrap();
        assert!(
            out.contains("GO\nCREATE PROCEDURE bump AS UPDATE t SET n = n + 1\nGO"),
            "{out}"
        );
    }

    #[test]
    fn duckdb_gets_its_foreign_keys_inside_the_tables_referenced_tables_first() {
        let duck = export(Target::Duckdb);
        assert!(duck.find("CREATE TABLE \"customer\"") < duck.find("CREATE TABLE \"order\""));
        assert!(
            duck.contains("FOREIGN KEY (\"customer_id\") REFERENCES \"customer\" (\"id\") ON DELETE CASCADE\n);"),
            "{duck}"
        );
        assert!(!duck.contains("ALTER TABLE"), "{duck}");
        assert!(duck.contains("\"score\" DOUBLE DEFAULT 0"), "{duck}");
    }

    #[test]
    fn a_sqlite_export_leaves_the_imported_objects_out() {
        let sql = export_schema(
            &imported(
                "postgresql",
                "CREATE TABLE t (x int); CREATE VIEW v AS SELECT 1;",
            ),
            Target::Sqlite,
        )
        .unwrap();
        assert!(!sql.contains(OBJECTS_TABLE), "{sql}");
    }
}
