import { vi } from "vitest";
import type { SessionInfo, StartupStatus } from "@gokul/ui";
import type { Api } from "./apiContext";

export const cashier: SessionInfo = {
  userId: 2,
  name: "Ravi Kumar",
  role: "cashier",
  mustChangePin: false,
  allowedScreens: [],
};

export const okStatus: StartupStatus = {
  db: "ok",
  setupComplete: true,
  usersExist: true,
  shopName: "Gokul Oils",
  dbMessage: null,
};

/** A fake of src/api.ts. Override any function per test. */
export function makeApi(over: Partial<Record<keyof Api, unknown>> = {}): Api & Record<keyof Api, ReturnType<typeof vi.fn>> {
  const base = {
    startupStatus: vi.fn(() => Promise.resolve(okStatus)),
    listLoginUsers: vi.fn(() =>
      Promise.resolve([
        { id: 1, name: "Gokul", role: "owner" as const },
        { id: 2, name: "Ravi Kumar", role: "cashier" as const },
      ]),
    ),
    login: vi.fn(() => Promise.resolve(cashier)),
    currentSession: vi.fn(() => Promise.resolve(null)),
    logout: vi.fn(() => Promise.resolve()),
    lockSession: vi.fn(() => Promise.resolve()),
    heartbeat: vi.fn(() => Promise.resolve()),
    changePin: vi.fn(() => Promise.resolve(cashier)),
    getStatusBar: vi.fn(() => Promise.resolve({ shopName: "Gokul Oils", userName: "Ravi Kumar", lastBackupAt: null })),
    getShopSettings: vi.fn(),
    onCloseRequested: vi.fn(() => Promise.resolve(() => undefined)),
    closeWindow: vi.fn(() => Promise.resolve()),
    readLastUserId: vi.fn(() => null),
    saveLastUserId: vi.fn(),
  };
  return { ...base, ...over } as unknown as Api & Record<keyof Api, ReturnType<typeof vi.fn>>;
}
