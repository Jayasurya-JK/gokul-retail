// Hide the console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod state;

use gokul_core::{paths, Db};
use state::AppState;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

pub const APP_NAME: &str = "Gokul Office";

fn log_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let builder = tauri_plugin_log::Builder::new().level(log::LevelFilter::Info);
    match paths::logs_dir() {
        Ok(path) => builder
            .clear_targets()
            .target(Target::new(TargetKind::Folder {
                path,
                file_name: Some("office".to_string()),
            }))
            .build(),
        Err(_) => builder.build(),
    }
}

fn main() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(log_plugin())
        .setup(|app| {
            let db = Db::open(&paths::default_db_path()?)?;
            log::info!("{APP_NAME} started, data version {}", db.schema_version()?);
            app.manage(AppState { db: Mutex::new(db) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::app_info::app_info])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        log::error!("{APP_NAME} stopped: {e}");
        std::process::exit(1);
    }
}
