// Every command the window may call is listed here, so Tauri creates an explicit
// `allow-<name>` permission for each one. The capability file grants exactly these.
// A test in src/commands/mod.rs keeps this list, the command functions, the capability and
// the handler list in step.
const COMMANDS: &[&str] = &[
    "app_info",
    "startup_status",
    "list_login_users",
    "login",
    "current_session",
    "logout",
    "lock_session",
    "heartbeat",
    "change_pin",
    "get_status_bar",
    "get_shop_settings",
    "setup_owner",
    "recover_owner_pin",
    "save_shop_settings",
    "open_screen",
    "list_users",
    "create_user",
    "reset_pin",
    "unlock_user",
    "deactivate_user",
];

fn main() {
    let attributes = tauri_build::Attributes::new()
        .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS));
    if let Err(e) = tauri_build::try_build(attributes) {
        eprintln!("tauri build script failed: {e:#}");
        std::process::exit(1);
    }
}
