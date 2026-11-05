//! Commands shared by both apps: start-up, sign-in, session and read-only settings.
//! Thin wrappers: every rule and every guard is in `gokul_core::AppContext`.
//! Keep this file identical in `apps/pos` and `apps/office`.

use super::run;
use gokul_core::app::{StartupStatus, StatusBarInfo};
use gokul_core::auth::LoginUser;
use gokul_core::session::SessionInfo;
use gokul_core::settings::ShopSettings;
use gokul_core::{AppContext, AppError, AppInfo, Pin};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn app_info(ctx: State<'_, Arc<AppContext>>) -> Result<AppInfo, AppError> {
    run(&ctx, "app_info", |c| {
        c.app_info(crate::APP_NAME, env!("CARGO_PKG_VERSION"))
    })
    .await
}

#[tauri::command]
pub async fn startup_status(ctx: State<'_, Arc<AppContext>>) -> Result<StartupStatus, AppError> {
    run(&ctx, "startup_status", |c| Ok(c.startup_status())).await
}

#[tauri::command]
pub async fn list_login_users(ctx: State<'_, Arc<AppContext>>) -> Result<Vec<LoginUser>, AppError> {
    run(&ctx, "list_login_users", |c| c.list_login_users()).await
}

#[tauri::command]
pub async fn login(
    ctx: State<'_, Arc<AppContext>>,
    user_id: i64,
    pin: String,
) -> Result<SessionInfo, AppError> {
    let pin = Pin::new(pin);
    run(&ctx, "login", move |c| c.login(user_id, pin)).await
}

#[tauri::command]
pub async fn current_session(
    ctx: State<'_, Arc<AppContext>>,
) -> Result<Option<SessionInfo>, AppError> {
    run(&ctx, "current_session", |c| c.current_session()).await
}

#[tauri::command]
pub async fn logout(ctx: State<'_, Arc<AppContext>>) -> Result<(), AppError> {
    run(&ctx, "logout", |c| c.logout()).await
}

#[tauri::command]
pub async fn lock_session(ctx: State<'_, Arc<AppContext>>) -> Result<(), AppError> {
    run(&ctx, "lock_session", |c| c.lock_session()).await
}

#[tauri::command]
pub async fn heartbeat(ctx: State<'_, Arc<AppContext>>) -> Result<(), AppError> {
    run(&ctx, "heartbeat", |c| c.heartbeat()).await
}

#[tauri::command]
pub async fn change_pin(
    ctx: State<'_, Arc<AppContext>>,
    old_pin: String,
    new_pin: String,
) -> Result<SessionInfo, AppError> {
    let (old_pin, new_pin) = (Pin::new(old_pin), Pin::new(new_pin));
    run(&ctx, "change_pin", move |c| c.change_pin(old_pin, new_pin))
        .await
        .map_err(|e| e.with_pin_field("newPin"))
}

#[tauri::command]
pub async fn get_status_bar(ctx: State<'_, Arc<AppContext>>) -> Result<StatusBarInfo, AppError> {
    run(&ctx, "get_status_bar", |c| c.get_status_bar()).await
}

#[tauri::command]
pub async fn get_shop_settings(ctx: State<'_, Arc<AppContext>>) -> Result<ShopSettings, AppError> {
    run(&ctx, "get_shop_settings", |c| c.get_shop_settings()).await
}
