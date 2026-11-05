//! Office-only commands: first-run setup, owner PIN recovery, settings write, screen checks
//! and user administration. The POS app has none of these (and its capability file does not
//! allow them). Thin wrappers: the owner checks happen in `gokul_core::AppContext`.

use super::run;
use gokul_core::app::{RecoveryResult, SetupResult};
use gokul_core::auth::UserRow;
use gokul_core::settings::ShopSettings;
use gokul_core::{AppContext, AppError, Pin};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn setup_owner(
    ctx: State<'_, Arc<AppContext>>,
    shop_name: String,
    owner_name: String,
    pin: String,
) -> Result<SetupResult, AppError> {
    let pin = Pin::new(pin);
    run(&ctx, "setup_owner", move |c| {
        c.setup_owner(&shop_name, &owner_name, pin)
    })
    .await
}

#[tauri::command]
pub async fn recover_owner_pin(
    ctx: State<'_, Arc<AppContext>>,
    recovery_code: String,
    new_pin: String,
) -> Result<RecoveryResult, AppError> {
    let new_pin = Pin::new(new_pin);
    run(&ctx, "recover_owner_pin", move |c| {
        c.recover_owner_pin(&recovery_code, new_pin)
    })
    .await
}

#[tauri::command]
pub async fn save_shop_settings(
    ctx: State<'_, Arc<AppContext>>,
    settings: ShopSettings,
) -> Result<ShopSettings, AppError> {
    run(&ctx, "save_shop_settings", move |c| {
        c.save_shop_settings(&settings)
    })
    .await
}

#[tauri::command]
pub async fn open_screen(ctx: State<'_, Arc<AppContext>>, screen: String) -> Result<(), AppError> {
    run(&ctx, "open_screen", move |c| c.open_screen(&screen)).await
}

#[tauri::command]
pub async fn list_users(ctx: State<'_, Arc<AppContext>>) -> Result<Vec<UserRow>, AppError> {
    run(&ctx, "list_users", |c| c.list_users()).await
}

#[tauri::command]
pub async fn create_user(
    ctx: State<'_, Arc<AppContext>>,
    name: String,
    pin: String,
) -> Result<UserRow, AppError> {
    let pin = Pin::new(pin);
    run(&ctx, "create_user", move |c| c.create_user(&name, pin)).await
}

#[tauri::command]
pub async fn reset_pin(
    ctx: State<'_, Arc<AppContext>>,
    user_id: i64,
    new_pin: String,
) -> Result<UserRow, AppError> {
    let new_pin = Pin::new(new_pin);
    run(&ctx, "reset_pin", move |c| c.reset_pin(user_id, new_pin)).await
}

#[tauri::command]
pub async fn unlock_user(
    ctx: State<'_, Arc<AppContext>>,
    user_id: i64,
) -> Result<UserRow, AppError> {
    run(&ctx, "unlock_user", move |c| c.unlock_user(user_id)).await
}

#[tauri::command]
pub async fn deactivate_user(
    ctx: State<'_, Arc<AppContext>>,
    user_id: i64,
) -> Result<UserRow, AppError> {
    run(&ctx, "deactivate_user", move |c| c.deactivate_user(user_id)).await
}
