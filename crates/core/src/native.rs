//! Native (Windows) message box for the one case where no screen exists yet: the shop database could not be opened.

/// Shows a modal error box and returns when the user closes it. Elsewhere it just prints (no desktop there).
pub fn show_error(title: &str, message: &str) {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK, MB_SETFOREGROUND, MB_TOPMOST};
        let wide = |s: &str| -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() };
        let (t, m) = (wide(title), wide(message));
        // SAFETY: both buffers are NUL-terminated UTF-16 that outlive the call; a null owner window is allowed.
        unsafe {
            MessageBoxW(std::ptr::null_mut(), m.as_ptr(), t.as_ptr(), MB_OK | MB_ICONERROR | MB_SETFOREGROUND | MB_TOPMOST);
        }
    }
    #[cfg(not(windows))]
    eprintln!("{title}: {message}");
}
