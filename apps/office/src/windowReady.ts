import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * The window starts hidden (tauri.conf.json "visible": false) so the owner never sees a blank frame.
 * Call this once the first screen has mounted: it shows and focuses the window. The Rust side shows it anyway
 * after 3 s if this never runs. In the browser preview there is no window to show, so it does nothing.
 */
export function showWindowWhenReady(): void {
  if (!isTauri()) return;
  const win = getCurrentWindow();
  void win.show().then(() => win.setFocus()).catch(() => {
    // Rust's 3-second fallback shows the window if this call fails.
  });
}
