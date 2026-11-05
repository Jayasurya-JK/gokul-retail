import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopSettings } from "@gokul/ui";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import * as api from "./api";

const settings: ShopSettings = {
  shopName: "a",
  addressLine1: "b",
  addressLine2: "",
  addressLine3: "",
  gstin: "",
  fssaiNo: "",
  phone: "9876543210",
  billFooter: "",
};

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
});

// Command names and camelCase argument names from "Command API contract" in
// docs/specs/00-step3-login-security.md.
const cases: [string, () => Promise<unknown>, string, Record<string, unknown> | undefined][] = [
  ["startupStatus", () => api.startupStatus(), "startup_status", undefined],
  ["listLoginUsers", () => api.listLoginUsers(), "list_login_users", undefined],
  ["login", () => api.login(3, "2468"), "login", { userId: 3, pin: "2468" }],
  ["currentSession", () => api.currentSession(), "current_session", undefined],
  ["logout", () => api.logout(), "logout", undefined],
  ["lockSession", () => api.lockSession(), "lock_session", undefined],
  ["heartbeat", () => api.heartbeat(), "heartbeat", undefined],
  ["changePin", () => api.changePin("1111", "2222"), "change_pin", { oldPin: "1111", newPin: "2222" }],
  ["getStatusBar", () => api.getStatusBar(), "get_status_bar", undefined],
  ["getShopSettings", () => api.getShopSettings(), "get_shop_settings", undefined],
  ["setupOwner", () => api.setupOwner("Shop", "Owner", "135790"), "setup_owner", { shopName: "Shop", ownerName: "Owner", pin: "135790" }],
  ["recoverOwnerPin", () => api.recoverOwnerPin("CODE", "135790"), "recover_owner_pin", { recoveryCode: "CODE", newPin: "135790" }],
  ["saveShopSettings", () => api.saveShopSettings(settings), "save_shop_settings", { settings }],
  ["openScreen", () => api.openScreen("stock"), "open_screen", { screen: "stock" }],
  ["listUsers", () => api.listUsers(), "list_users", undefined],
  ["createUser", () => api.createUser("Meena", "2468"), "create_user", { name: "Meena", pin: "2468" }],
  ["resetPin", () => api.resetPin(4, "2468"), "reset_pin", { userId: 4, newPin: "2468" }],
  ["unlockUser", () => api.unlockUser(4), "unlock_user", { userId: 4 }],
  ["deactivateUser", () => api.deactivateUser(4), "deactivate_user", { userId: 4 }],
];

describe("Office api.ts matches the command contract", () => {
  it.each(cases)("%s", async (_n, call, command, args) => {
    await call();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0]?.[0]).toBe(command);
    expect(invoke.mock.calls[0]?.[1]).toEqual(args);
  });

  it("every failure arrives as an AppError", async () => {
    invoke.mockRejectedValueOnce({ code: "LOCKED", message: "x", secondsLeft: 9 });
    await expect(api.login(1, "1111")).rejects.toMatchObject({ code: "LOCKED", secondsLeft: 9 });
    invoke.mockRejectedValueOnce("boom");
    await expect(api.heartbeat()).rejects.toMatchObject({ code: "INTERNAL", message: "boom" });
  });
});
