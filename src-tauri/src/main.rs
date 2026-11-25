// Release builds have no console window. `sequill mcp` still talks over the pipes an MCP
// client hands it, because Windows passes those to GUI programs too.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod mcp_install;
mod watch;

use commands::AppState;
use sequill_core::Store;
use std::sync::{Arc, Mutex};
use tauri::Manager;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("mcp") {
        std::process::exit(sequill_mcp::cli::main(&args[1..]));
    }
    run();
}

/// The window title: the app's name and version, so people can see which build they run.
fn window_title(info: &tauri::PackageInfo) -> String {
    let build = if cfg!(debug_assertions) {
        " (development build)"
    } else {
        ""
    };
    format!("{} {}{build}", info.name, info.version)
}

fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                window.set_title(&window_title(app.package_info()))?;
            }
            let dir =
                sequill_core::default_data_dir().ok_or("Could not find the app's data folder")?;
            let store = Arc::new(Mutex::new(Store::open(&dir)?));
            watch::spawn(app.handle().clone(), Arc::clone(&store));
            // Assistants reach the databases only through the app (`sequill mcp` relays).
            tauri::async_runtime::spawn(async move {
                if let Err(error) = sequill_mcp::host::serve(dir).await {
                    eprintln!("sequill: assistants can't connect over MCP: {error}");
                }
            });
            app.manage(AppState { store });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sqlite_version,
            commands::list_databases,
            commands::create_database,
            commands::create_design,
            commands::import_schema,
            commands::export_schema,
            commands::open_database_file,
            commands::export_database,
            commands::rename_database,
            commands::delete_database,
            commands::open_database,
            commands::schema,
            commands::count,
            commands::query,
            commands::exec_script,
            commands::explain_script,
            commands::transaction,
            commands::preview_design,
            commands::apply_design,
            commands::insert_many,
            commands::dump,
            commands::list_saved_queries,
            commands::upsert_saved_query,
            commands::delete_saved_query,
            commands::list_designs,
            commands::save_design,
            commands::mcp_status,
            commands::set_mcp_enabled,
            commands::set_mcp_allow_changes,
            commands::set_ui_state,
            commands::mcp_activity,
            commands::clear_mcp_activity,
            commands::set_mcp_history_days,
            commands::install_mcp,
        ])
        .run(tauri::generate_context!())
        .expect("Sequill could not start");
}
