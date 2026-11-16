//! Tells the UI when another process (the MCP server, an assistant) changed the databases,
//! so open grids and lists refresh without a reload, and hands it the server's requests to
//! show something (a table, a query, the schema).

use sequill_core::Store;
use serde_json::Value;
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// The events the frontend listens for (`src/shared/lib/sqlite/desktop.ts`).
pub const EXTERNAL_CHANGE_EVENT: &str = "sequill://external-change";
pub const SHOW_EVENT: &str = "sequill://show";
const POLL_INTERVAL: Duration = Duration::from_secs(1);

pub fn spawn(app: AppHandle, store: Arc<Mutex<Store>>) {
    thread::spawn(move || {
        loop {
            thread::sleep(POLL_INTERVAL);
            let (changes, requests) = {
                let mut store = store.lock().unwrap_or_else(PoisonError::into_inner);
                (store.external_changes(), store.take_ui_requests())
            };
            match changes {
                Ok(changes) if changes.any() => {
                    if let Err(error) = app.emit(EXTERNAL_CHANGE_EVENT, &changes) {
                        eprintln!("sequill: could not report outside changes: {error}");
                    }
                }
                Ok(_) => {}
                Err(error) => eprintln!("sequill: could not check for outside changes: {error}"),
            }
            match requests {
                Ok(requests) => requests.iter().for_each(|payload| show(&app, payload)),
                Err(error) => eprintln!("sequill: could not read requests to show: {error}"),
            }
        }
    });
}

/// Passes one request to the window and brings the window forward.
fn show(app: &AppHandle, payload: &str) {
    let request: Value = match serde_json::from_str(payload) {
        Ok(request) => request,
        Err(error) => {
            eprintln!("sequill: ignored a request to show something: {error}");
            return;
        }
    };
    if let Err(error) = app.emit(SHOW_EVENT, &request) {
        eprintln!("sequill: could not pass on a request to show something: {error}");
    }
    if let Some(window) = app.get_webview_window("main") {
        let focused = window.unminimize().and_then(|()| window.set_focus());
        if let Err(error) = focused {
            eprintln!("sequill: could not bring the window forward: {error}");
        }
    }
}
