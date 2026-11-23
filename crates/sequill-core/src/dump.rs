//! SQL dump in the spirit of the sqlite3 shell's `.dump`.
//! Mirrors the web app's `src/lib/sqlite/dump.ts`, streaming each table instead of paging it.

use crate::error::Result;
use crate::value::CellValue;
use rusqlite::Connection;

pub fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

fn insert_statement(target: &str, row: &[CellValue]) -> String {
    let values: Vec<String> = row.iter().map(CellValue::sql_literal).collect();
    format!("INSERT INTO {target} VALUES ({});", values.join(", "))
}

struct SchemaEntry {
    kind: String,
    name: String,
    sql: String,
    /// pragma_table_list's type ("shadow" for FTS internals), when it is a table.
    table_kind: Option<String>,
}

fn rows(conn: &Connection, sql: &str, out: &mut Vec<String>, target: &str) -> Result<()> {
    let mut stmt = conn.prepare(sql)?;
    let n = stmt.column_count();
    let mut cursor = stmt.query([])?;
    while let Some(row) = cursor.next()? {
        let values = (0..n)
            .map(|i| row.get_ref(i).map(CellValue::from))
            .collect::<rusqlite::Result<Vec<_>>>()?;
        out.push(insert_statement(target, &values));
    }
    Ok(())
}

pub fn dump_database(conn: &Connection) -> Result<String> {
    let mut out: Vec<String> = vec![
        "PRAGMA foreign_keys=OFF;".into(),
        "BEGIN TRANSACTION;".into(),
    ];
    let entries: Vec<SchemaEntry> = conn
        .prepare(
            "SELECT s.type, s.name, s.sql, l.type FROM sqlite_schema s
               LEFT JOIN pragma_table_list l ON l.name = s.name AND l.schema = 'main'
              WHERE s.sql IS NOT NULL ORDER BY s.rowid",
        )?
        .query_map([], |r| {
            Ok(SchemaEntry {
                kind: r.get(0)?,
                name: r.get(1)?,
                sql: r.get(2)?,
                table_kind: r.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<_>>()?;

    let tables = entries.iter().filter(|e| {
        e.kind == "table"
            && e.table_kind.as_deref() != Some("shadow")
            && !e.name.starts_with("sqlite_")
    });
    for table in tables {
        out.push(format!("{};", table.sql));
        let columns: Vec<String> = conn
            .prepare("SELECT name FROM pragma_table_info(?) ORDER BY cid")?
            .query_map([&table.name], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<_>>()?;
        if columns.is_empty() {
            continue;
        }
        let list = columns
            .iter()
            .map(|c| quote_ident(c))
            .collect::<Vec<_>>()
            .join(", ");
        let target = format!("{} ({list})", quote_ident(&table.name));
        let select = format!("SELECT {list} FROM {}", quote_ident(&table.name));
        rows(conn, &select, &mut out, &target)?;
    }

    if entries.iter().any(|e| e.name == "sqlite_sequence") {
        let mut sequence = Vec::new();
        rows(
            conn,
            "SELECT name, seq FROM sqlite_sequence",
            &mut sequence,
            r#""sqlite_sequence" ("name", "seq")"#,
        )?;
        if !sequence.is_empty() {
            out.push("DELETE FROM sqlite_sequence;".into());
            out.extend(sequence);
        }
    }

    for kind in ["index", "trigger", "view"] {
        for e in entries
            .iter()
            .filter(|e| e.kind == kind && !e.name.starts_with("sqlite_"))
        {
            out.push(format!("{};", e.sql));
        }
    }
    out.push("COMMIT;".into());
    Ok(format!("{}\n", out.join("\n")))
}

#[cfg(test)]
mod tests {
    use crate::schema::tests::sample;
    use crate::session::Session;

    #[test]
    fn round_trips_schema_and_data_into_a_fresh_database() {
        let source = sample();
        let dump = source.dump().unwrap();
        assert!(dump.starts_with("PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;"));

        let copy = Session::memory().unwrap();
        copy.connection().execute_batch(&dump).unwrap();
        for table in ["artist", "album", r#""odd ""name""""#] {
            let sql = format!("SELECT * FROM {table} ORDER BY 1");
            assert_eq!(
                copy.query(&sql, &[], None).unwrap().rows,
                source.query(&sql, &[], None).unwrap().rows
            );
        }
        let seq = copy
            .count("SELECT seq FROM sqlite_sequence WHERE name = 'artist'", &[])
            .unwrap();
        assert_eq!(seq, 2);
        let schema = copy.schema().unwrap();
        assert_eq!(schema.triggers.len(), 1);
        assert_eq!(schema.views.len(), 1);
    }

    #[test]
    fn keeps_reals_real() {
        let s = Session::memory().unwrap();
        s.connection()
            .execute_batch("CREATE TABLE t(v); INSERT INTO t VALUES (1.0);")
            .unwrap();
        assert!(s.dump().unwrap().contains("VALUES (1.0);"));
    }
}
