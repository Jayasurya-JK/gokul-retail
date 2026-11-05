// The ONLY file in Gokul POS that talks to Rust. Typed to the command API contract
// (docs/specs/00-step3-login-security.md). Rejections arrive as AppError.
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { withAppErrors } from "@gokul/ui";
import type { LoginUser, SessionInfo, ShopSettings, StartupStatus, StatusBarInfo } from "@gokul/ui";

const call = withAppErrors(invoke);

export const startupStatus = () => call<StartupStatus>("startup_status");
export const listLoginUsers = () => call<LoginUser[]>("list_login_users");
export const login = (userId: number, pin: string) => call<SessionInfo>("login", { userId, pin });
export const currentSession = () => call<SessionInfo | null>("current_session");
export const logout = () => call<void>("logout");
export const lockSession = () => call<void>("lock_session");
export const heartbeat = () => call<void>("heartbeat");
export const changePin = (oldPin: string, newPin: string) => call<SessionInfo>("change_pin", { oldPin, newPin });
export const getStatusBar = () => call<StatusBarInfo>("get_status_bar");
export const getShopSettings = () => call<ShopSettings>("get_shop_settings");

// Window close (Alt+F4 / X). Not a Rust command, but it must not be called from components either.
// Needs the permissions core:window:allow-close (and the close-requested event) in the capability
// file, which is on the backend side.
let forceClose = false;

export async function onCloseRequested(handler: () => void): Promise<() => void> {
  try {
    return await getCurrentWindow().onCloseRequested((event) => {
      if (forceClose) return;
      event.preventDefault();
      handler();
    });
  } catch {
    return () => undefined; // plain browser / tests: there is no window object
  }
}

export async function closeWindow(): Promise<void> {
  forceClose = true;
  try {
    await getCurrentWindow().close();
  } catch {
    forceClose = false;
  }
}

/** Per-PC convenience, not security: the user who signed in last is pre-chosen at the next login. */
const LAST_USER_KEY = "gokul.pos.lastUserId";

export function readLastUserId(): number | null {
  try {
    const v = window.localStorage.getItem(LAST_USER_KEY);
    const n = v === null ? NaN : Number(v);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

export function saveLastUserId(id: number): void {
  try {
    window.localStorage.setItem(LAST_USER_KEY, String(id));
  } catch {
    // storage blocked: the pre-choice is a convenience only
  }
}
