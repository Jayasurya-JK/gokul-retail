// The ONLY file in Gokul Office that talks to Rust. Typed to the command API contract
// (docs/specs/00-step3-login-security.md). Rejections arrive as AppError.
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { withAppErrors } from "@gokul/ui";
import type {
  LoginUser,
  Screen,
  SessionInfo,
  ShopSettings,
  StartupStatus,
  StatusBarInfo,
  UserRow,
} from "@gokul/ui";

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

export const setupOwner = (shopName: string, ownerName: string, pin: string) =>
  call<{ recoveryCode: string; session: SessionInfo }>("setup_owner", { shopName, ownerName, pin });
export const recoverOwnerPin = (recoveryCode: string, newPin: string) =>
  call<{ recoveryCode: string }>("recover_owner_pin", { recoveryCode, newPin });
export const saveShopSettings = (settings: ShopSettings) => call<ShopSettings>("save_shop_settings", { settings });
export const openScreen = (screen: Screen) => call<void>("open_screen", { screen });
export const listUsers = () => call<UserRow[]>("list_users");
export const createUser = (name: string, pin: string) => call<UserRow>("create_user", { name, pin });
export const resetPin = (userId: number, newPin: string) => call<UserRow>("reset_pin", { userId, newPin });
export const unlockUser = (userId: number) => call<UserRow>("unlock_user", { userId });
export const deactivateUser = (userId: number) => call<UserRow>("deactivate_user", { userId });

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
