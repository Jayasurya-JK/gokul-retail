//! Which addresses the app window may show. Anything else (a link, a redirect, a dropped
//! file) is refused so the shop PC can never browse away from the app.

/// `scheme` and `host` come from the URL the window wants to open.
/// In a release build only the app's own address is allowed; debug builds also allow the
/// Vite dev server on localhost.
pub fn is_allowed(scheme: &str, host: Option<&str>, debug_build: bool) -> bool {
    match (scheme, host) {
        ("tauri", _) => true,
        ("http" | "https", Some("tauri.localhost")) => true,
        ("http", Some("localhost")) => debug_build,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_app_itself_is_allowed() {
        assert!(is_allowed("tauri", Some("localhost"), false));
        assert!(is_allowed("http", Some("tauri.localhost"), false));
        assert!(is_allowed("https", Some("tauri.localhost"), false));
        assert!(!is_allowed("https", Some("example.com"), false));
        assert!(!is_allowed("http", Some("localhost"), false));
        assert!(is_allowed("http", Some("localhost"), true));
        assert!(!is_allowed("file", None, true));
        assert!(!is_allowed("javascript", None, true));
    }
}
