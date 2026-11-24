//! Splits a script into statements with SQLite's own `sqlite3_complete`, so strings,
//! comments and CREATE TRIGGER bodies are handled exactly as SQLite does.

use std::ffi::CString;

/// True when `sql` ends a complete statement (SQLite's `sqlite3_complete`).
pub fn is_complete(sql: &str) -> bool {
    let Ok(sql) = CString::new(sql) else {
        return false;
    };
    // SAFETY: `sql` is a valid NUL-terminated string that outlives the call.
    unsafe { rusqlite::ffi::sqlite3_complete(sql.as_ptr()) != 0 }
}

pub fn split_statements(script: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut start = 0;
    for (i, _) in script.match_indices(';') {
        let piece = &script[start..=i];
        if is_complete(piece) {
            push_if_meaningful(&mut statements, piece);
            start = i + 1;
        }
    }
    push_if_meaningful(&mut statements, &script[start..]);
    statements
}

fn push_if_meaningful(out: &mut Vec<String>, piece: &str) {
    let trimmed = piece.trim();
    if !strip_comments(trimmed).replace(';', "").trim().is_empty() {
        out.push(trimmed.to_owned());
    }
}

/// Only used to detect comment-only pieces; real statements keep other text.
fn strip_comments(sql: &str) -> String {
    let mut out = String::with_capacity(sql.len());
    let mut rest = sql;
    loop {
        let line = rest.find("--");
        let block = rest.find("/*");
        let (at, is_line) = match (line, block) {
            (None, None) => {
                out.push_str(rest);
                return out;
            }
            (Some(l), Some(b)) => (l.min(b), l < b),
            (Some(l), None) => (l, true),
            (None, Some(b)) => (b, false),
        };
        out.push_str(&rest[..at]);
        rest = &rest[at..];
        if is_line {
            rest = rest.find('\n').map_or("", |n| &rest[n..]);
        } else if let Some(end) = rest[2..].find("*/") {
            rest = &rest[2 + end + 2..];
        } else {
            out.push_str(rest);
            return out;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn respects_strings_comments_and_trigger_bodies() {
        let parts = split_statements(
            "SELECT ';' AS a; -- note; here
             CREATE TRIGGER t AFTER INSERT ON x BEGIN SELECT 1; SELECT 2; END;
             /* only a comment; */
             SELECT 3",
        );
        assert_eq!(parts.len(), 3);
        assert!(parts[1].contains("END;"));
        assert!(parts[2].contains("SELECT 3"));
    }

    #[test]
    fn empty_and_comment_only_scripts_have_no_statements() {
        assert!(split_statements("").is_empty());
        assert!(split_statements("  ;; -- nothing\n /* here */").is_empty());
    }
}
