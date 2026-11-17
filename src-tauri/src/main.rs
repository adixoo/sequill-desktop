// Release builds have no console window. `sequill mcp` still talks over the pipes an MCP
// client hands it, because Windows passes those to GUI programs too.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
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

fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir =
                sequill_core::default_data_dir().ok_or("Could not find the app's data folder")?;
            let store = Arc::new(Mutex::new(Store::open(&dir)?));
            watch::spawn(app.handle().clone(), Arc::clone(&store));
            app.manage(AppState { store });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sqlite_version,
            commands::list_databases,
            commands::create_database,
            commands::import_database,
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
            commands::mcp_status,
            commands::set_mcp_enabled,
        ])
        .run(tauri::generate_context!())
        .expect("Sequill could not start");
}
