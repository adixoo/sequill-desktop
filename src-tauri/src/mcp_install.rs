//! The MCP dialog's "Add to …" button: puts Sequill's MCP server in an assistant's own
//! settings. The clients here are the ones `MCP_CLIENTS` (`src/lib/mcp.ts`) marks `oneClick`.

use serde_json::{Map, Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// The server's name in every client's settings; matches `MCP_SERVER_NAME` in `src/lib/mcp.ts`.
const SERVER_NAME: &str = "sequill";

type Res<T> = Result<T, String>;

/// Adds the server that `command args` starts to `client`; returns what was done, in a sentence.
pub fn install(client: &str, command: &str, args: &[String]) -> Res<String> {
    let entry = json!({ "command": command, "args": args });
    let config = || dirs::config_dir().ok_or("Sequill can't find your settings folder.");
    let home = || dirs::home_dir().ok_or("Sequill can't find your home folder.");
    match client {
        "claude-desktop" => {
            let mut folders = vec![config()?.join("Claude")];
            folders.extend(store_claude_folders());
            add_to_files(
                "Claude Desktop",
                &folders,
                "claude_desktop_config.json",
                "mcpServers",
                &entry,
            )
        }
        "cursor" => add_to_files(
            "Cursor",
            &[home()?.join(".cursor")],
            "mcp.json",
            "mcpServers",
            &entry,
        ),
        "vscode" => {
            let entry = json!({ "type": "stdio", "command": command, "args": args });
            add_to_files(
                "VS Code",
                &[config()?.join("Code").join("User")],
                "mcp.json",
                "servers",
                &entry,
            )
        }
        "windsurf" => {
            let folder = home()?.join(".codeium").join("windsurf");
            add_to_files(
                "Windsurf",
                &[folder],
                "mcp_config.json",
                "mcpServers",
                &entry,
            )
        }
        "gemini" => add_to_files(
            "Gemini CLI",
            &[home()?.join(".gemini")],
            "settings.json",
            "mcpServers",
            &entry,
        ),
        "claude-code" => {
            let mut add = vec!["mcp", "add", "--scope", "user", SERVER_NAME, "--", command];
            add.extend(args.iter().map(String::as_str));
            run_cli(
                "Claude Code",
                "claude",
                &["mcp", "remove", "--scope", "user", SERVER_NAME],
                &add,
            )
        }
        "codex" => {
            let mut add = vec!["mcp", "add", SERVER_NAME, "--", command];
            add.extend(args.iter().map(String::as_str));
            run_cli("Codex", "codex", &["mcp", "remove", SERVER_NAME], &add)
        }
        _ => Err(format!(
            "Sequill can't add itself to \"{client}\" on its own."
        )),
    }
}

/// Claude Desktop from the Microsoft Store keeps its settings inside its package.
fn store_claude_folders() -> Vec<PathBuf> {
    let Some(packages) = dirs::data_local_dir().map(|d| d.join("Packages")) else {
        return Vec::new();
    };
    let Ok(entries) = fs::read_dir(packages) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("Claude_"))
        .map(|e| e.path().join("LocalCache").join("Roaming").join("Claude"))
        .collect()
}

/// Writes the entry into `file` in each of `folders` that exists (the app is installed).
fn add_to_files(
    app: &str,
    folders: &[PathBuf],
    file: &str,
    key: &str,
    entry: &Value,
) -> Res<String> {
    let installed: Vec<&PathBuf> = folders.iter().filter(|f| f.is_dir()).collect();
    if installed.is_empty() {
        return Err(format!(
            "{app} isn't set up on this computer yet. Install it and open it once, then try again."
        ));
    }
    for folder in &installed {
        add_to_file(app, &folder.join(file), key, entry)?;
    }
    Ok(format!("Saved in {}", installed[0].join(file).display()))
}

fn add_to_file(app: &str, path: &Path, key: &str, entry: &Value) -> Res<()> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(format!("Couldn't read {}: {e}", path.display())),
    };
    let merged = with_server(&text, key, entry).map_err(|why| {
        format!("{app}'s settings file {why}, so Sequill left it alone. Follow the steps to add it by hand.")
    })?;
    // Write a copy, then swap it in, so a failed write never leaves half a file.
    let tmp = path.with_extension("sequill-tmp");
    fs::write(&tmp, merged)
        .and_then(|()| fs::rename(&tmp, path))
        .map_err(|e| format!("Couldn't save {}: {e}", path.display()))
}

/// `text` (a JSON settings file, maybe empty) with `entry` as `key.sequill`; everything else kept.
fn with_server(text: &str, key: &str, entry: &Value) -> Result<String, &'static str> {
    let mut root: Value = if text.trim().is_empty() {
        Value::Object(Map::new())
    } else {
        serde_json::from_str(text).map_err(|_| "has text that isn't plain JSON (comments?)")?
    };
    let servers = root
        .as_object_mut()
        .ok_or("isn't a JSON object")?
        .entry(key)
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or("has an unexpected server list")?;
    servers.insert(SERVER_NAME.into(), entry.clone());
    Ok(serde_json::to_string_pretty(&root).expect("JSON values always serialize") + "\n")
}

/// Runs the client's own "remove" (an old entry would block "add"), then its "add".
fn run_cli(app: &str, program: &str, remove: &[&str], add: &[&str]) -> Res<String> {
    let _ = run(program, remove); // nothing to remove the first time
    let out = run(program, add).map_err(|e| match e.kind() {
        // shortcut: only looks on PATH, which apps opened from the macOS Dock don't share with
        // the terminal; search the usual install folders if people report this.
        std::io::ErrorKind::NotFound => format!(
            "Sequill couldn't find {app}. Install it, or copy the command below into a terminal."
        ),
        _ => format!("Couldn't start {app}: {e}"),
    })?;
    if out.status.success() {
        return Ok(format!("Added with {program} {}", add[..2].join(" ")));
    }
    let said = String::from_utf8_lossy(&out.stderr);
    let said = said.trim();
    let said = if said.is_empty() {
        String::from_utf8_lossy(&out.stdout).trim().to_owned()
    } else {
        said.to_owned()
    };
    Err(format!("{app} said: {said}"))
}

/// Runs `program args` without a console window; on Windows also tries the npm `.cmd` shim.
fn run(program: &str, args: &[&str]) -> std::io::Result<std::process::Output> {
    let output = |name: &str| {
        let mut cmd = Command::new(name);
        cmd.args(args);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        cmd.output()
    };
    match output(program) {
        Err(e) if cfg!(windows) && e.kind() == std::io::ErrorKind::NotFound => {
            output(&format!("{program}.cmd"))
        }
        result => result,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry() -> Value {
        json!({ "command": "C:\\Sequill\\sequill.exe", "args": ["mcp"] })
    }

    #[test]
    fn creates_the_file_from_nothing() {
        let out: Value =
            serde_json::from_str(&with_server("  ", "mcpServers", &entry()).unwrap()).unwrap();
        assert_eq!(out, json!({ "mcpServers": { "sequill": entry() } }));
    }

    #[test]
    fn keeps_other_servers_and_settings_and_replaces_its_own() {
        let text = r#"{"preferences":{"x":1},"mcpServers":{"other":{"command":"o"},"sequill":{"command":"old"}}}"#;
        let out: Value =
            serde_json::from_str(&with_server(text, "mcpServers", &entry()).unwrap()).unwrap();
        assert_eq!(
            out,
            json!({
                "preferences": { "x": 1 },
                "mcpServers": { "other": { "command": "o" }, "sequill": entry() }
            })
        );
    }

    #[test]
    fn leaves_files_it_cannot_read_alone() {
        assert!(with_server("// comment\n{}", "servers", &entry()).is_err());
        assert!(with_server("[]", "servers", &entry()).is_err());
        assert!(with_server(r#"{"servers":[]}"#, "servers", &entry()).is_err());
    }

    #[test]
    fn says_when_the_app_is_missing() {
        let missing = std::env::temp_dir().join("sequill-no-such-app");
        let err =
            add_to_files("Cursor", &[missing], "mcp.json", "mcpServers", &entry()).unwrap_err();
        assert!(err.contains("Cursor isn't set up"));
    }

    #[test]
    fn unknown_clients_are_refused() {
        assert!(install("jetbrains", "x", &[]).is_err());
    }
}
