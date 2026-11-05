import { vi } from "vitest";
import type { SessionInfo, ShopSettings, StartupStatus, UserRow } from "@gokul/ui";
import type { Api } from "./apiContext";

export const ALL = ["dashboard", "items", "stock", "production", "packing", "purchases", "reports", "users", "settings"] as const;

export const ownerSession: SessionInfo = {
  userId: 1,
  name: "Selvi",
  role: "owner",
  mustChangePin: false,
  allowedScreens: [...ALL],
};
export const cashierSession: SessionInfo = {
  userId: 2,
  name: "Ravi Kumar",
  role: "cashier",
  mustChangePin: false,
  allowedScreens: ["dashboard", "items", "stock"],
};

export const readySettings: ShopSettings = {
  shopName: "Gokul Oils",
  addressLine1: "12 Main Road",
  addressLine2: "",
  addressLine3: "Erode 638001",
  gstin: "",
  fssaiNo: "",
  phone: "9876543210",
  billFooter: "Thank you",
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
        { id: 1, name: "Selvi" },
        { id: 2, name: "Ravi Kumar" },
      ]),
    ),
    login: vi.fn((userId: number) => Promise.resolve(userId === 1 ? ownerSession : cashierSession)),
    currentSession: vi.fn(() => Promise.resolve(null)),
    logout: vi.fn(() => Promise.resolve()),
    lockSession: vi.fn(() => Promise.resolve()),
    heartbeat: vi.fn(() => Promise.resolve()),
    changePin: vi.fn(() => Promise.resolve(ownerSession)),
    getStatusBar: vi.fn(() => Promise.resolve({ shopName: "Gokul Oils", userName: null, lastBackupAt: null })),
    getShopSettings: vi.fn(() => Promise.resolve(readySettings)),
    setupOwner: vi.fn(() => Promise.resolve({ recoveryCode: "ABCD1234EFGH5678", session: ownerSession })),
    recoverOwnerPin: vi.fn(() => Promise.resolve({ recoveryCode: "WXYZ9876QRST5432" })),
    saveShopSettings: vi.fn((s: ShopSettings) => Promise.resolve(s)),
    openScreen: vi.fn(() => Promise.resolve()),
    listUsers: vi.fn(() => Promise.resolve([] as UserRow[])),
    createUser: vi.fn(),
    resetPin: vi.fn(),
    unlockUser: vi.fn(),
    deactivateUser: vi.fn(),
    onCloseRequested: vi.fn(() => Promise.resolve(() => undefined)),
    closeWindow: vi.fn(() => Promise.resolve()),
  };
  return { ...base, ...over } as unknown as Api & Record<keyof Api, ReturnType<typeof vi.fn>>;
}
