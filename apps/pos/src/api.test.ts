import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import * as api from "./api";

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
});

// Command names and camelCase argument names from "Command API contract" in
// docs/specs/00-step3-login-security.md. POS only gets the shared commands.
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
];

describe("POS api.ts matches the command contract", () => {
  it.each(cases)("%s", async (_n, call, command, args) => {
    await call();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0]?.[0]).toBe(command);
    expect(invoke.mock.calls[0]?.[1]).toEqual(args);
  });

  it("has no Office-only commands", () => {
    for (const name of ["setupOwner", "saveShopSettings", "listUsers", "createUser", "resetPin"]) {
      expect(name in api).toBe(false);
    }
  });

  it("remembers the last user without throwing when storage is blocked", () => {
    api.saveLastUserId(5);
    expect(api.readLastUserId()).toBe(5);
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(api.readLastUserId()).toBeNull();
    spy.mockRestore();
  });
});
