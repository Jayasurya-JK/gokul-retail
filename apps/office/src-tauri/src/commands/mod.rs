//! Thin Tauri commands. They only call gokul-core; no business rules here.
//! Every command runs on a blocking thread so hashing or a busy database never freezes the
//! window, and a panic inside a command becomes an INTERNAL error, not a crash.

pub mod admin;
pub mod session;

use gokul_core::{AppContext, AppError, Error};
use std::sync::Arc;
use tauri::State;

/// Run one core call off the UI thread and turn its error into the UI's `AppError`.
pub async fn run<T, F>(
    ctx: &State<'_, Arc<AppContext>>,
    name: &'static str,
    f: F,
) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce(&AppContext) -> gokul_core::Result<T> + Send + 'static,
{
    let ctx = Arc::clone(ctx.inner());
    match tauri::async_runtime::spawn_blocking(move || f(&ctx)).await {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(e)) => {
            let app: AppError = (&e).into();
            if app.is_internal() {
                log::error!("{name} failed: {e}");
            }
            Err(app)
        }
        Err(join_error) => {
            log::error!("{name} stopped unexpectedly: {join_error}");
            Err(AppError::from(Error::Internal(
                "the command stopped unexpectedly".to_string(),
            )))
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::path::Path;

    /// Commands only Office has (the POS app must not).
    const OFFICE_ONLY: &[&str] = &[
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
    const HAS_OFFICE_COMMANDS: bool = true;

    fn read(rel: &str) -> String {
        let p = Path::new(env!("CARGO_MANIFEST_DIR")).join(rel);
        std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()))
    }

    fn command_fns() -> BTreeSet<String> {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/commands");
        let mut out = BTreeSet::new();
        for entry in std::fs::read_dir(dir).expect("dir") {
            let path = entry.expect("entry").path();
            if path.file_name().is_some_and(|n| n == "mod.rs") {
                continue;
            }
            let text = std::fs::read_to_string(&path).expect("read");
            let mut lines = text.lines();
            while let Some(line) = lines.next() {
                if line.trim() == "#[tauri::command]" {
                    let sig = lines.next().expect("fn line");
                    let name = sig
                        .trim_start_matches("pub ")
                        .trim_start_matches("async ")
                        .trim_start_matches("fn ")
                        .split('(')
                        .next()
                        .expect("name");
                    out.insert(name.to_string());
                }
            }
        }
        out
    }

    fn quoted(text: &str) -> Vec<String> {
        text.split('"')
            .skip(1)
            .step_by(2)
            .map(str::to_string)
            .collect()
    }

    #[test]
    fn commands_manifest_capability_and_handler_agree() {
        let fns = command_fns();
        assert!(!fns.is_empty());

        let build = read("build.rs");
        let list = build
            .split("const COMMANDS")
            .nth(1)
            .and_then(|s| s.split("];").next())
            .expect("COMMANDS in build.rs");
        let manifest: BTreeSet<String> = quoted(list).into_iter().collect();
        assert_eq!(
            fns, manifest,
            "build.rs COMMANDS differ from the command functions"
        );

        let cap = read("capabilities/default.json");
        let allowed: BTreeSet<String> = quoted(&cap)
            .into_iter()
            .filter_map(|s| s.strip_prefix("allow-").map(|n| n.replace('-', "_")))
            .collect();
        assert_eq!(
            fns, allowed,
            "capability permissions differ from the commands"
        );

        let main = read("src/main.rs");
        let core = std::fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../crates/core/src/app.rs"),
        )
        .expect("core app.rs");
        for name in &fns {
            assert!(
                main.contains(&format!("::{name},")),
                "{name} is not in generate_handler!"
            );
            assert!(
                core.contains(&format!("pub fn {name}(")),
                "{name} is not a core command"
            );
        }
        for file in std::fs::read_dir(Path::new(env!("CARGO_MANIFEST_DIR")).join("src/commands"))
            .expect("dir")
        {
            let path = file.expect("entry").path();
            if path.file_name().is_some_and(|n| n == "mod.rs") {
                continue;
            }
            let text = std::fs::read_to_string(&path).expect("read");
            for chunk in text.split("#[tauri::command]").skip(1) {
                let name = chunk
                    .trim_start()
                    .trim_start_matches("pub ")
                    .trim_start_matches("async ")
                    .trim_start_matches("fn ")
                    .split('(')
                    .next()
                    .expect("name");
                assert!(
                    chunk.contains(&format!("c.{name}(")),
                    "{name} must be a thin call to AppContext::{name}"
                );
            }
        }

        for name in OFFICE_ONLY {
            assert_eq!(
                fns.contains(*name),
                HAS_OFFICE_COMMANDS,
                "{name}: wrong app for this command"
            );
        }
    }

    #[test]
    fn capability_and_config_are_locked_down() {
        let cap = read("capabilities/default.json");
        assert!(!cap.contains("core:default"));
        assert!(cap.contains("\"windows\": [\"main\"]"));
        for plugin in [
            "fs:", "shell:", "http:", "dialog:", "opener:", "process:", "updater:",
        ] {
            assert!(!cap.contains(plugin), "capability must not grant {plugin}");
        }
        let conf = read("tauri.conf.json");
        assert!(conf.contains("\"freezePrototype\": true"));
        assert!(conf.contains("\"withGlobalTauri\": false"));
        assert!(!conf.contains("unsafe-eval"));
        assert!(conf.contains("script-src 'self';"));
        assert!(conf.contains("object-src 'none'"));
        assert!(conf.contains("frame-src 'none'"));
        assert_eq!(conf.matches("\"label\"").count(), 1);
        assert!(
            !conf.contains("\"url\""),
            "no window may load a remote address"
        );
    }
}
