//! Reading other databases' scripts beyond tables: splitting them into statements the way
//! their own tools do (PostgreSQL's `$tag$` bodies, MySQL's `DELIMITER` and `/*!…*/` lines,
//! SQL Server's `GO` batches), and recognising the objects SQLite can't run (enums,
//! functions, procedures, triggers, views, sequences, types), which an imported schema keeps
//! as SQL text (`schema::OBJECTS_TABLE`).

use crate::dump::quote_ident;
use crate::schema::{ExtraObject, OBJECTS_TABLE};

/// The statements of `script`, written for `dialect`, each as written (trimmed).
pub fn split_script(dialect: &str, script: &str) -> Vec<String> {
    let dialect = dialect.to_ascii_lowercase();
    match dialect.as_str() {
        "mssql" => split_go_batches(script),
        "mysql" => split(&unwrap_mysql_conditionals(script), false, true),
        _ => split(script, true, false),
    }
}

/// SQL Server: `GO` lines end batches; a batch that creates a routine is one statement,
/// others split on semicolons.
fn split_go_batches(script: &str) -> Vec<String> {
    let mut batches = vec![String::new()];
    for line in script.lines() {
        if line.trim().eq_ignore_ascii_case("go") {
            batches.push(String::new());
        } else {
            let batch = batches.last_mut().expect("one batch at least");
            batch.push_str(line);
            batch.push('\n');
        }
    }
    let mut out = Vec::new();
    for batch in batches {
        let words = leading_words(&batch, 4);
        let routine = matches!(words.first().map(String::as_str), Some("CREATE" | "ALTER"))
            && words.iter().skip(1).any(|w| {
                matches!(
                    w.as_str(),
                    "PROCEDURE" | "PROC" | "FUNCTION" | "TRIGGER" | "VIEW"
                )
            });
        if routine {
            push_statement(&mut out, &batch);
        } else {
            out.extend(split(&batch, false, false));
        }
    }
    out
}

/// `/*!40101 SET … */` and `/*!50003 CREATE*/` are MySQL code in comments; keep the code.
fn unwrap_mysql_conditionals(script: &str) -> String {
    let mut out = String::with_capacity(script.len());
    let mut rest = script;
    while let Some(start) = rest.find("/*!") {
        out.push_str(&rest[..start]);
        let body = &rest[start + 3..];
        let digits = body.bytes().take_while(u8::is_ascii_digit).count();
        let body = &body[digits..];
        match body.find("*/") {
            Some(end) => {
                out.push_str(&body[..end]);
                rest = &body[end + 2..];
            }
            None => {
                out.push_str(body);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

fn push_statement(out: &mut Vec<String>, piece: &str) {
    let piece = piece.trim();
    if !piece.is_empty() {
        out.push(piece.to_owned());
    }
}

fn find_bytes(haystack: &[u8], from: usize, needle: &[u8]) -> Option<usize> {
    haystack[from.min(haystack.len())..]
        .windows(needle.len().max(1))
        .position(|w| w == needle)
        .map(|p| from + p)
}

fn line_end(bytes: &[u8], from: usize) -> usize {
    find_bytes(bytes, from, b"\n").unwrap_or(bytes.len())
}

/// Splits on the statement delimiter outside strings, quoted names and comments.
/// `dollar`: PostgreSQL-style `$tag$…$tag$` bodies. `mysql`: `DELIMITER x` lines and
/// backslash escapes in strings.
fn split(text: &str, dollar: bool, mysql: bool) -> Vec<String> {
    let b = text.as_bytes();
    let mut out = Vec::new();
    let mut delimiter: Vec<u8> = b";".to_vec();
    let (mut start, mut i) = (0, 0);
    while i < b.len() {
        let line_start = i == 0 || b[i - 1] == b'\n';
        if mysql
            && line_start
            && b.len() - i >= 10
            && b[i..i + 10].eq_ignore_ascii_case(b"DELIMITER ")
        {
            push_statement(&mut out, &text[start..i]);
            let end = line_end(b, i);
            delimiter = text[i + 10..end].trim().as_bytes().to_vec();
            if delimiter.is_empty() {
                delimiter = b";".to_vec();
            }
            (start, i) = (end, end);
            continue;
        }
        match b[i] {
            q @ (b'\'' | b'"' | b'`') => {
                i += 1;
                while i < b.len() {
                    // A MySQL backslash escape, or a doubled quote, stays inside.
                    let escaped = mysql && b[i] == b'\\' && q == b'\'';
                    if escaped || (b[i] == q && b.get(i + 1) == Some(&q)) {
                        i += 2;
                    } else if b[i] == q {
                        i += 1;
                        break;
                    } else {
                        i += 1;
                    }
                }
                continue;
            }
            b'-' if b.get(i + 1) == Some(&b'-') => {
                i = line_end(b, i);
                continue;
            }
            b'/' if b.get(i + 1) == Some(&b'*') => {
                i = find_bytes(b, i + 2, b"*/").map_or(b.len(), |p| p + 2);
                continue;
            }
            b'$' if dollar => {
                let tag_len = b[i + 1..]
                    .iter()
                    .take_while(|c| c.is_ascii_alphanumeric() || **c == b'_')
                    .count();
                let starts_ok = b.get(i + 1).is_none_or(|c| !c.is_ascii_digit());
                if starts_ok && b.get(i + 1 + tag_len) == Some(&b'$') {
                    let tag = &b[i..i + tag_len + 2];
                    i = find_bytes(b, i + tag.len(), tag).map_or(b.len(), |p| p + tag.len());
                    continue;
                }
            }
            _ => {}
        }
        if b[i..].starts_with(&delimiter) {
            push_statement(&mut out, &text[start..i]);
            i += delimiter.len();
            start = i;
            continue;
        }
        i += 1;
    }
    push_statement(&mut out, &text[start..]);
    out
}

/// The first `n` words of a statement, upper-cased, after comments; a quoted name is one word.
fn leading_words(sql: &str, n: usize) -> Vec<String> {
    let mut words = Vec::new();
    let mut rest = sql;
    while words.len() < n {
        rest = rest.trim_start();
        if let Some(r) = rest.strip_prefix("--") {
            rest = r.find('\n').map_or("", |p| &r[p..]);
            continue;
        }
        if let Some(r) = rest.strip_prefix("/*") {
            rest = r.find("*/").map_or("", |p| &r[p + 2..]);
            continue;
        }
        let Some((word, after)) = read_word(rest) else {
            break;
        };
        words.push(word.to_ascii_uppercase());
        rest = after;
    }
    words
}

/// One word or quoted name ("…", `…`, […]), unquoted, and the text after it.
fn read_word(text: &str) -> Option<(String, &str)> {
    let text = text.trim_start();
    let first = text.chars().next()?;
    let close = match first {
        '"' => Some('"'),
        '`' => Some('`'),
        '[' => Some(']'),
        _ => None,
    };
    if let Some(close) = close {
        let end = text[1..].find(close)? + 1;
        return Some((text[1..end].to_owned(), &text[end + 1..]));
    }
    let end = text
        .find(|c: char| !(c.is_alphanumeric() || c == '_' || c == '$' || c == '@' || c == '='))
        .unwrap_or(text.len());
    if end == 0 {
        return Some((first.to_string(), &text[first.len_utf8()..]));
    }
    Some((text[..end].to_owned(), &text[end..]))
}

/// A possibly qualified name (`schema.name`), its last part unquoted, and the text after it.
fn read_name(text: &str) -> Option<(String, &str)> {
    let (mut name, mut rest) = read_word(text)?;
    while let Some(after_dot) = rest.strip_prefix('.') {
        let (part, after) = read_word(after_dot)?;
        name = part;
        rest = after;
    }
    Some((name, rest))
}

/// What kind of object a `CREATE` statement makes, if it's one SQLite can't run but an
/// imported schema keeps: its kind, name, table (triggers) and body (enums: the values).
pub fn object_of(sql: &str) -> Option<ExtraObject> {
    let mut rest = sql.trim_start();
    // Skip leading comments.
    loop {
        if let Some(r) = rest.strip_prefix("--") {
            rest = r.find('\n').map_or("", |p| &r[p..]).trim_start();
        } else if let Some(r) = rest.strip_prefix("/*") {
            rest = r.find("*/").map_or("", |p| &r[p + 2..]).trim_start();
        } else {
            break;
        }
    }
    let (first, mut rest) = read_word(rest)?;
    if !first.eq_ignore_ascii_case("CREATE") {
        return None;
    }
    // CREATE [OR REPLACE | OR ALTER] [DEFINER=…] [TEMP] [MATERIALIZED] [UNIQUE] KIND
    let kind = loop {
        let (word, after) = read_word(rest)?;
        rest = after;
        match word.to_ascii_uppercase().as_str() {
            "OR" | "REPLACE" | "ALTER" | "TEMP" | "TEMPORARY" | "MATERIALIZED" | "RECURSIVE"
            | "SQL" | "SECURITY" | "INVOKER" | "DEFINER" | "ALGORITHM" | "UNDEFINED" | "MERGE"
            | "TEMPTABLE" | "AGGREGATE" | "=" | "@" => {}
            w if w.starts_with("DEFINER") => {
                // DEFINER=`root`@`%`: skip the user and host.
                while rest.trim_start().starts_with(['`', '\'', '"', '@']) {
                    rest = read_word(rest.trim_start().trim_start_matches('@'))?.1;
                }
            }
            "FUNCTION" | "MACRO" => break "function",
            "PROCEDURE" | "PROC" => break "procedure",
            "TRIGGER" => break "trigger",
            "VIEW" => break "view",
            "SEQUENCE" => break "sequence",
            "TYPE" | "DOMAIN" => break "type",
            _ => return None,
        }
    };
    // IF NOT EXISTS
    let words = leading_words(rest, 3);
    if words == ["IF", "NOT", "EXISTS"] {
        for _ in 0..3 {
            rest = read_word(rest)?.1;
        }
    }
    let (name, after) = read_name(rest)?;
    let mut object = ExtraObject {
        kind: kind.to_owned(),
        name,
        table: None,
        body: sql.trim().trim_end_matches(';').trim_end().to_owned(),
    };
    let upper = after.to_ascii_uppercase();
    if kind == "trigger" {
        // The first ON word after the name names the table.
        let mut scan = after;
        while let Some((word, next)) = read_word(scan) {
            if word.eq_ignore_ascii_case("ON") {
                object.table = read_name(next).map(|(t, _)| t);
                break;
            }
            scan = next;
        }
    } else if kind == "type" && upper.trim_start().starts_with("AS ENUM") {
        object.kind = "enum".to_owned();
        let open = after.find('(')?;
        object.body =
            serde_json::to_string(&quoted_strings(&after[open..])).expect("strings serialize");
    }
    Some(object)
}

/// The '…' strings in `text` up to the first closing parenthesis outside them ('' unescaped).
fn quoted_strings(text: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            ')' => break,
            '\'' => {
                let mut value = String::new();
                while let Some(c) = chars.next() {
                    if c == '\'' {
                        if chars.peek() == Some(&'\'') {
                            chars.next();
                            value.push('\'');
                        } else {
                            break;
                        }
                    } else {
                        value.push(c);
                    }
                }
                values.push(value);
            }
            _ => {}
        }
    }
    values
}

/// A declared type as SQLite can store it: plain words with an optional (n) or (n, m) as
/// they are; anything else (`integer[]`, `VARCHAR(MAX)`, `ENUM('a','b')`) as a quoted string,
/// which SQLite keeps and reports exactly as written.
pub fn sqlite_type_name(declared: &str) -> String {
    let declared = declared.trim();
    let words_end = declared
        .find(|c: char| !(c.is_ascii_alphanumeric() || c == '_' || c == ' '))
        .unwrap_or(declared.len());
    let rest = &declared[words_end..];
    let plain_size = rest.is_empty()
        || rest
            .strip_prefix('(')
            .and_then(|r| r.strip_suffix(')'))
            .is_some_and(|inside| {
                inside.split(',').all(|n| {
                    let n = n.trim();
                    !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit())
                })
            });
    if plain_size {
        declared.to_owned()
    } else {
        format!("'{}'", declared.replace('\'', "''"))
    }
}

/// SQL that stores an imported schema's database type and objects (`OBJECTS_TABLE`).
pub fn objects_sql(dialect: &str, objects: &[ExtraObject]) -> String {
    let literal = |s: &str| format!("'{}'", s.replace('\'', "''"));
    let mut sql = format!(
        "CREATE TABLE {} (kind TEXT NOT NULL, name TEXT NOT NULL, tbl TEXT, body TEXT NOT NULL, PRIMARY KEY (kind, name));\n",
        quote_ident(OBJECTS_TABLE)
    );
    let rows = std::iter::once(("dialect", dialect, None, "")).chain(objects.iter().map(|o| {
        (
            o.kind.as_str(),
            o.name.as_str(),
            o.table.as_deref(),
            o.body.as_str(),
        )
    }));
    for (kind, name, table, body) in rows {
        sql.push_str(&format!(
            "INSERT OR REPLACE INTO {} VALUES ({}, {}, {}, {});\n",
            quote_ident(OBJECTS_TABLE),
            literal(kind),
            literal(name),
            table.map_or_else(|| "NULL".to_owned(), literal),
            literal(body)
        ));
    }
    sql
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_postgres_dollar_bodies_whole() {
        let script = "CREATE TABLE a (x int);\nCREATE FUNCTION f() RETURNS trigger AS $body$ BEGIN NEW.x := 1; RETURN NEW; END; $body$ LANGUAGE plpgsql;\nCREATE TABLE b (y text DEFAULT ';');";
        let parts = split_script("postgresql", script);
        assert_eq!(parts.len(), 3, "{parts:#?}");
        assert!(parts[1].ends_with("LANGUAGE plpgsql"));
        assert_eq!(parts[2], "CREATE TABLE b (y text DEFAULT ';')");
    }

    #[test]
    fn follows_mysql_delimiters_and_conditional_comments() {
        let script = "/*!40101 SET NAMES utf8 */;\nCREATE TABLE t (n int, s varchar(5) DEFAULT 'it\\'s;');\nDELIMITER ;;\nCREATE DEFINER=`root`@`%` PROCEDURE `bump`()\nBEGIN\n  UPDATE t SET n = n + 1;\nEND ;;\n/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `t_bi` BEFORE INSERT ON `t` FOR EACH ROW SET NEW.n = 0 */;;\nDELIMITER ;\nCREATE VIEW v AS SELECT n FROM t;";
        let parts = split_script("mysql", script);
        assert_eq!(parts.len(), 5, "{parts:#?}");
        let procedure = object_of(&parts[2]).unwrap();
        assert_eq!(
            (procedure.kind.as_str(), procedure.name.as_str()),
            ("procedure", "bump")
        );
        assert!(procedure.body.contains("UPDATE t SET n = n + 1;"));
        let trigger = object_of(&parts[3]).unwrap();
        assert_eq!(trigger.kind, "trigger");
        assert_eq!(trigger.name, "t_bi");
        assert_eq!(trigger.table.as_deref(), Some("t"));
        assert_eq!(object_of(&parts[4]).unwrap().kind, "view");
    }

    #[test]
    fn treats_sql_server_go_batches_as_routines() {
        let script = "CREATE TABLE [dbo].[t] ([n] INT);\nGO\nCREATE OR ALTER PROCEDURE [dbo].[bump] AS\nBEGIN\n  SET NOCOUNT ON;\n  UPDATE [dbo].[t] SET [n] = [n] + 1;\nEND\nGO\nCREATE TRIGGER [dbo].[t_audit] ON [dbo].[t] AFTER INSERT AS BEGIN SELECT 1; END\nGO";
        let parts = split_script("mssql", script);
        assert_eq!(parts.len(), 3, "{parts:#?}");
        let procedure = object_of(&parts[1]).unwrap();
        assert_eq!(
            (procedure.kind.as_str(), procedure.name.as_str()),
            ("procedure", "bump")
        );
        let trigger = object_of(&parts[2]).unwrap();
        assert_eq!(trigger.table.as_deref(), Some("t"));
    }

    #[test]
    fn reads_enums_sequences_and_types() {
        let e = object_of("CREATE TYPE public.mood AS ENUM ('sad', 'it''s ok', 'happy');").unwrap();
        assert_eq!((e.kind.as_str(), e.name.as_str()), ("enum", "mood"));
        assert_eq!(e.body, r#"["sad","it's ok","happy"]"#);
        let s = object_of("CREATE SEQUENCE IF NOT EXISTS order_ids START 1").unwrap();
        assert_eq!(
            (s.kind.as_str(), s.name.as_str()),
            ("sequence", "order_ids")
        );
        let t = object_of("CREATE TYPE point2 AS (x float8, y float8)").unwrap();
        assert_eq!(t.kind, "type");
        assert_eq!(
            object_of("CREATE MACRO add(a, b) AS a + b").unwrap().kind,
            "function"
        );
        assert!(object_of("CREATE TABLE t (x int)").is_none());
        assert!(object_of("CREATE EXTENSION pgcrypto").is_none());
    }

    #[test]
    fn stores_exotic_types_as_written() {
        assert_eq!(sqlite_type_name("VARCHAR(255)"), "VARCHAR(255)");
        assert_eq!(sqlite_type_name("NUMERIC(10, 2)"), "NUMERIC(10, 2)");
        assert_eq!(
            sqlite_type_name("timestamp with time zone"),
            "timestamp with time zone"
        );
        assert_eq!(sqlite_type_name("integer[]"), "'integer[]'");
        assert_eq!(sqlite_type_name("VARCHAR(MAX)"), "'VARCHAR(MAX)'");
        assert_eq!(sqlite_type_name("ENUM('a','b')"), "'ENUM(''a'',''b'')'");
    }
}
