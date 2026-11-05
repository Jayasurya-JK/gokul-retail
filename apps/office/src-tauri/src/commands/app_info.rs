use crate::state::AppState;
use gokul_core::AppInfo;

#[tauri::command]
pub fn app_info(state: tauri::State<'_, AppState>) -> Result<AppInfo, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "The data file is busy. Please restart the app.".to_string())?;
    AppInfo::load(&db, crate::APP_NAME, env!("CARGO_PKG_VERSION")).map_err(|e| {
        log::error!("app_info failed: {e}");
        e.user_message()
    })
}
