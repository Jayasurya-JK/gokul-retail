// Hide the console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use gokul_core::{nav, paths, AppContext, AppKind};
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

pub const APP_NAME: &str = "Gokul POS";

fn log_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let builder = tauri_plugin_log::Builder::new().level(log::LevelFilter::Info);
    match paths::logs_dir() {
        Ok(path) => builder
            .clear_targets()
            .target(Target::new(TargetKind::Folder {
                path,
                file_name: Some("pos".to_string()),
            }))
            .build(),
        Err(_) => builder.build(),
    }
}

/// The window may only ever show the app itself, never another web page.
fn navigation_guard<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::<R>::new("navigation-guard")
        .on_navigation(|_webview, url| {
            nav::is_allowed(url.scheme(), url.host_str(), cfg!(debug_assertions))
        })
        .build()
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
        .plugin(navigation_guard())
        .setup(|app| {
            // If the data file cannot be opened the app still starts; the start-up screen
            // reports the problem and lets staff retry (startup_status).
            let ctx = Arc::new(AppContext::production(AppKind::Pos));
            let status = ctx.startup_status();
            log::info!("{APP_NAME} started, data file state: {:?}", status.db);
            app.manage(ctx);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::session::app_info,
            commands::session::startup_status,
            commands::session::list_login_users,
            commands::session::login,
            commands::session::current_session,
            commands::session::logout,
            commands::session::lock_session,
            commands::session::heartbeat,
            commands::session::change_pin,
            commands::session::get_status_bar,
            commands::session::get_shop_settings,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        log::error!("{APP_NAME} stopped: {e}");
        std::process::exit(1);
    }
}
