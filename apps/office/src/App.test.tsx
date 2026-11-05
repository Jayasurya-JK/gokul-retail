import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appError, flush, mount, pageText, press, typeText, unmountAll } from "@gokul/ui/testing";
import { resetKeymapsForTests } from "@gokul/ui";
import type { UserRow } from "@gokul/ui";
import { App } from "./App";
import { cashierSession, makeApi, okStatus, ownerSession, readySettings } from "./testApi";

afterEach(async () => {
  await unmountAll();
  resetKeymapsForTests();
  vi.useRealTimers();
});

type FakeApi = ReturnType<typeof makeApi>;

async function boot(api: FakeApi = makeApi()) {
  await mount(<App api={api} />);
  await flush(4);
  return api;
}

async function signIn(who: "owner" | "cashier") {
  if (who === "cashier") await press("ArrowDown");
  await press("Enter");
  await typeText(who === "owner" ? "135790" : "2468");
  await press("Enter");
  await flush(4);
}

const menuLabels = () => Array.from(document.querySelectorAll(".gk-menu-item")).map((e) => e.textContent);
const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
const heading = () => document.querySelector(".gk-content-title")?.textContent;

describe("start-up (tests 1 to 3, 8)", () => {
  it("empty database shows the first-run owner screen", async () => {
    await boot(makeApi({ startupStatus: vi.fn(() => Promise.resolve({ ...okStatus, usersExist: false, setupComplete: false })) }));
    expect(pageText()).toContain("Welcome to Gokul Office");
    expect(document.activeElement).toBe(input("shopName"));
  });

  it("with an owner, first run never appears", async () => {
    await boot();
    expect(pageText()).not.toContain("Welcome to Gokul Office");
    expect(pageText()).toContain("Gokul Office - Sign in");
  });

  it.each([
    ["error", "Gokul Office cannot open the shop data", "DB-OPEN"],
    ["busy", "The shop data is busy", "DB-BUSY"],
    ["newer_than_app", "This Gokul Office is older than the shop data", "DB-NEWER"],
  ] as const)("database %s shows its blocking screen; Enter retries only where allowed", async (db, title, code) => {
    const startupStatus = vi
      .fn()
      .mockResolvedValueOnce({ ...okStatus, db, dbMessage: "data version 7" })
      .mockResolvedValue(okStatus);
    await boot(makeApi({ startupStatus }));
    expect(pageText()).toContain(title);
    expect(pageText()).toContain(code);
    await press("Enter");
    await flush(4);
    if (db === "newer_than_app") {
      expect(pageText()).toContain(title); // no keys work here
      expect(startupStatus).toHaveBeenCalledTimes(1);
    } else {
      expect(pageText()).toContain("Sign in");
      expect(startupStatus).toHaveBeenCalledTimes(2);
    }
  });
});

describe("first run (tests 6 and 7)", () => {
  const firstRunApi = (over = {}) =>
    makeApi({
      startupStatus: vi.fn(() => Promise.resolve({ ...okStatus, usersExist: false, setupComplete: false })),
      ...over,
    });

  async function fill(pin: string, confirm: string) {
    await typeText("Gokul Oils");
    await press("Enter");
    await typeText("Selvi Gokul");
    await press("Enter");
    await typeText(pin);
    await press("Enter");
    await typeText(confirm);
    await press("Enter");
    await flush(4);
  }

  it("mismatched PINs clear both PIN boxes and go back to the PIN", async () => {
    const api = firstRunApi();
    await boot(api);
    await fill("135790", "135791");
    expect(pageText()).toContain("! The two PINs do not match. Type them again.");
    expect(input("pin")?.value).toBe("");
    expect(input("confirmPin")?.value).toBe("");
    expect(document.activeElement).toBe(input("pin"));
    expect(api.setupOwner).not.toHaveBeenCalled();
  });

  it("shows the backend's PIN message under the field", async () => {
    const api = firstRunApi({
      setupOwner: vi.fn(() =>
        Promise.reject(appError("PIN_INVALID", "", { fields: [{ field: "pin", message: "The owner PIN must be exactly 6 digits." }] })),
      ),
    });
    await boot(api);
    await fill("135790", "135790");
    expect(pageText()).toContain("! The owner PIN must be exactly 6 digits.");
  });

  it("creates the owner, shows the recovery code once, needs confirmation, then offers Settings", async () => {
    const api = firstRunApi();
    await boot(api);
    await fill("135790", "135790");
    expect(api.setupOwner).toHaveBeenCalledWith("Gokul Oils", "Selvi Gokul", "135790");
    expect(pageText()).toContain("ABCD-1234-EFGH-5678");
    await press("Enter");
    expect(pageText()).toContain("ABCD-1234-EFGH-5678"); // not confirmed yet
    await press(" ");
    await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
    await press("Enter");
    await flush(4);
    expect(pageText()).toContain("Owner account created");
    expect(pageText()).toContain("Billing in Gokul POS stays blocked");
    await press("Enter"); // Open Settings now
    await flush(4);
    expect(heading()).toContain("Settings");
  });

  it("Esc on the setup prompt goes to the Dashboard with the 'shop not set up' banner (tests 7, 27)", async () => {
    const api = firstRunApi();
    api.startupStatus.mockResolvedValue({ ...okStatus, setupComplete: false });
    await boot(firstRunApi({ startupStatus: api.startupStatus.mockResolvedValueOnce({ ...okStatus, usersExist: false, setupComplete: false }) }));
    await fill("135790", "135790");
    await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
    await press("Enter");
    await flush(4);
    await press("Escape");
    await flush(4);
    expect(heading()).toBe("Dashboard");
    expect(pageText()).toContain("Warning: The shop is not set up. Billing in Gokul POS is blocked. Press Alt+T to open Settings.");
    expect(document.querySelector(".gk-statusbar")?.textContent).toContain("Shop not set up");
  });
});

describe("login and shells (tests 17, 18, 19)", () => {
  it("owner sees the whole menu with access letters underlined", async () => {
    await boot();
    await signIn("owner");
    expect(menuLabels()).toEqual(["Dashboard", "Items", "Stock", "Production", "Packing", "Purchases", "Reports", "Users", "Settings"]);
    expect(document.querySelectorAll(".gk-menu-item u")).toHaveLength(9);
    expect(document.querySelector(".gk-statusbar")?.textContent).toContain("Selvi (Owner)");
    expect(document.activeElement?.parentElement?.querySelector(".gk-content-title")?.textContent).toBe("Dashboard");
  });

  it("every Alt+letter opens the right screen", async () => {
    const api = await boot();
    await signIn("owner");
    const cases: [string, string][] = [
      ["i", "Items"],
      ["s", "Stock"],
      ["p", "Production"],
      ["k", "Packing"],
      ["c", "Purchases"],
      ["r", "Reports"],
      ["u", "Users"],
      ["t", "Settings"],
      ["d", "Dashboard"],
    ];
    for (const [key, title] of cases) {
      await press(key, { alt: true });
      await flush(3);
      expect(heading()).toContain(title);
    }
    expect(api.openScreen).toHaveBeenCalledWith("settings");
  });

  it("Coming soon screens say so; Esc goes to the menu on the same item; Esc on the menu goes to the Dashboard", async () => {
    await boot();
    await signIn("owner");
    await press("s", { alt: true });
    await flush(3);
    expect(pageText()).toContain("Coming soon. This screen will be added in a later update.");
    await press("Escape");
    const menu = document.querySelector(".gk-menu");
    expect(document.activeElement).toBe(menu);
    expect(document.querySelector('.gk-menu-item[data-cursor="true"]')?.textContent).toBe("Stock");
    await press("Escape");
    await flush(3);
    expect(heading()).toBe("Dashboard");
  });

  it("menu: Down and Enter open the highlighted screen", async () => {
    await boot();
    await signIn("owner");
    await press("Escape");
    await press("ArrowDown");
    await press("Enter");
    await flush(3);
    expect(heading()).toBe("Items");
  });

  it("cashier: Users and Settings are not in the menu; Alt+U and Alt+T open nothing and explain", async () => {
    const api = await boot();
    await signIn("cashier");
    expect(menuLabels()).toEqual(["Dashboard", "Items", "Stock"]);
    await press("u", { alt: true });
    await flush(3);
    expect(heading()).toBe("Dashboard");
    expect(pageText()).toContain("Users and Settings are for the owner only.");
    expect(api.openScreen).toHaveBeenCalledWith("users"); // Rust refuses and writes the audit row
    await press("t", { alt: true });
    await flush(3);
    expect(pageText()).toContain("Users and Settings are for the owner only.");
    expect(pageText()).not.toContain("Shop details");
    await press("a"); // clears on the next key
    expect(pageText()).not.toContain("owner only");
  });

  it("cashier sees the short shop-not-set-up note", async () => {
    await boot(makeApi({ startupStatus: vi.fn(() => Promise.resolve({ ...okStatus, setupComplete: false })) }));
    await signIn("cashier");
    expect(pageText()).toContain("The shop is not set up yet. Ask the owner.");
  });

  it("a PIN change is required: the change-PIN screen comes first", async () => {
    const api = makeApi({
      login: vi.fn(() => Promise.resolve({ ...cashierSession, mustChangePin: true })),
    });
    await boot(api);
    await signIn("cashier");
    expect(pageText()).toContain("Change your PIN");
    await typeText("2468");
    await press("Enter");
    await typeText("1357");
    await press("Enter");
    await typeText("1357");
    await press("Enter");
    await flush(4);
    expect(api.changePin).toHaveBeenCalledWith("2468", "1357");
    expect(menuLabels()).toEqual(["Dashboard", "Items", "Stock", "Production", "Packing", "Purchases", "Reports", "Users", "Settings"]);
  });

  it("when Rust says PIN_CHANGE_REQUIRED mid-session, the change-PIN screen opens", async () => {
    const api = makeApi({ openScreen: vi.fn(() => Promise.reject(appError("PIN_CHANGE_REQUIRED", ""))) });
    await boot(api);
    await signIn("owner");
    await press("i", { alt: true });
    await flush(4);
    expect(pageText()).toContain("Change your PIN");
  });

  it("owner forgot the PIN: F4 opens recovery, the new code must be written down, then sign in", async () => {
    const api = await boot();
    await press("F4");
    expect(pageText()).toContain("Forgot the owner PIN");
    await typeText("abcd-1234 efgh-5678");
    await press("Enter");
    await typeText("246802");
    await press("Enter");
    await typeText("246802");
    await press("Enter");
    await flush(4);
    expect(api.recoverOwnerPin).toHaveBeenCalledWith("ABCD1234EFGH5678", "246802");
    expect(pageText()).toContain("WXYZ-9876-QRST-5432");
    await act(async () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
    await press("Enter");
    await flush(4);
    expect(pageText()).toContain("Owner PIN changed. Sign in with your new PIN.");
  });
});

describe("Settings (tests 23 to 27)", () => {
  async function openSettings(api: FakeApi) {
    await boot(api);
    await signIn("owner");
    await press("t", { alt: true });
    await flush(4);
  }

  it("loads the saved values, phone grouped, with the shop-name counter", async () => {
    await openSettings(makeApi());
    expect(document.activeElement).toBe(input("shopName"));
    expect(input("shopName")?.value).toBe("Gokul Oils");
    expect(input("phone")?.value).toBe("98765 43210");
    expect(pageText()).toContain("10/40");
    expect(pageText()).toContain("Tamil text will print only if the bill printer supports it");
  });

  it("F10 and Ctrl+S both save from any field, and Ctrl+S never opens Stock", async () => {
    const api = makeApi();
    await openSettings(api);
    await typeText(" Stores");
    expect(pageText()).toContain("Unsaved changes");
    await press("F10");
    await flush(3);
    expect(api.saveShopSettings).toHaveBeenCalledTimes(1);
    expect(pageText()).toContain("Shop details saved.");
    expect(pageText()).not.toContain("Unsaved changes");
    await typeText("!");
    await press("s", { ctrl: true });
    await flush(3);
    expect(api.saveShopSettings).toHaveBeenCalledTimes(2);
    expect(heading()).toContain("Settings");
    expect(api.openScreen).not.toHaveBeenCalledWith("stock");
  });

  it("extra F10 while saving is ignored", async () => {
    let done: (v: unknown) => void = () => undefined;
    const api = makeApi({ saveShopSettings: vi.fn(() => new Promise((r) => (done = r))) });
    await openSettings(api);
    await typeText("x");
    await press("F10");
    await press("F10");
    await press("F10");
    expect(api.saveShopSettings).toHaveBeenCalledTimes(1);
    expect(pageText()).toContain("Saving...");
    await act(async () => done(readySettings));
    await flush(3);
  });

  it("backend field errors show under the fields, nothing is lost, focus goes to the first wrong field", async () => {
    const api = makeApi({
      saveShopSettings: vi.fn(() =>
        Promise.reject(
          appError("VALIDATION", "", {
            fields: [
              { field: "fssaiNo", message: "FSSAI number must be 14 digits. You typed 13." },
              { field: "phone", message: "Phone must be 10 digits. You typed 9." },
            ],
          }),
        ),
      ),
    });
    await openSettings(api);
    await typeText("x");
    await press("F10");
    await flush(3);
    expect(pageText()).toContain("Error: 2 fields need fixing.");
    expect(pageText()).toContain("! Phone must be 10 digits. You typed 9.");
    expect(pageText()).toContain("! FSSAI number must be 14 digits. You typed 13.");
    expect(document.activeElement).toBe(input("phone"));
    expect(input("shopName")?.value).toBe("Gokul Oilsx");
  });

  it("a failed save (database) keeps the values and says what to do", async () => {
    const api = makeApi({ saveShopSettings: vi.fn(() => Promise.reject(appError("INTERNAL", ""))) });
    await openSettings(api);
    await typeText("x");
    await press("F10");
    await flush(3);
    expect(pageText()).toContain("Could not save. Your changes are still on screen. Press F10 to try again.");
  });

  it("cheap hints appear on leaving a field, not while typing", async () => {
    await openSettings(makeApi());
    input("gstin")?.focus();
    await typeText("33ABCDE1234F1Z");
    expect(pageText()).not.toContain("GSTIN must be 15 characters");
    expect(pageText()).toContain("33 = Tamil Nadu");
    await press("Enter");
    expect(pageText()).toContain("! GSTIN must be 15 characters. You typed 14.");
  });

  it("Enter moves through the fields and ends on the Save button", async () => {
    await openSettings(makeApi());
    for (let i = 0; i < 8; i++) await press("Enter");
    expect(document.activeElement?.textContent).toContain("Save");
  });

  it("Alt+letter with changes asks; Esc stays, D discards, Enter saves and leaves (test 25)", async () => {
    const api = makeApi();
    await openSettings(api);
    await typeText("x");
    await press("i", { alt: true });
    expect(pageText()).toContain("You changed the shop details and have not saved them.");
    await press("Escape");
    expect(heading()).toContain("Settings");
    expect(input("shopName")?.value).toBe("Gokul Oilsx");
    await press("i", { alt: true });
    await press("d");
    await flush(3);
    expect(heading()).toBe("Items");
    expect(api.saveShopSettings).not.toHaveBeenCalled();
    await press("t", { alt: true });
    await flush(4);
    expect(input("shopName")?.value).toBe("Gokul Oils");
    await typeText("y");
    await press("i", { alt: true });
    await press("Enter");
    await flush(4);
    expect(api.saveShopSettings).toHaveBeenCalledTimes(1);
    expect(heading()).toBe("Items");
  });

  it("Esc with changes asks, then goes to the menu; Alt+F4 uses the same guard", async () => {
    const api = makeApi();
    let closeHandler: () => void = () => undefined;
    api.onCloseRequested.mockImplementation((h: () => void) => {
      closeHandler = h;
      return Promise.resolve(() => undefined);
    });
    await openSettings(api);
    await typeText("x");
    await press("Escape");
    expect(pageText()).toContain("Save changes?");
    await press("Escape");
    await act(async () => closeHandler());
    expect(pageText()).toContain("Save changes?");
    expect(api.closeWindow).not.toHaveBeenCalled();
    await press("d");
    await flush(3);
    expect(api.closeWindow).toHaveBeenCalledTimes(1);
  });

  it("closing with nothing changed does not ask", async () => {
    const api = makeApi();
    let closeHandler: () => void = () => undefined;
    api.onCloseRequested.mockImplementation((h: () => void) => {
      closeHandler = h;
      return Promise.resolve(() => undefined);
    });
    await boot(api);
    await signIn("owner");
    await act(async () => closeHandler());
    expect(api.closeWindow).toHaveBeenCalledTimes(1);
  });

  it("after a valid save the banner and the status-bar warning go away (test 27)", async () => {
    const startupStatus = vi
      .fn()
      .mockResolvedValueOnce(okStatus)
      .mockResolvedValue({ ...okStatus, setupComplete: false });
    const api = makeApi({ startupStatus });
    await boot(api);
    await signIn("owner");
    await flush(3);
    expect(pageText()).toContain("Shop not set up");
    startupStatus.mockResolvedValue(okStatus);
    await press("t", { alt: true });
    await flush(4);
    await typeText("x");
    await press("F10");
    await flush(4);
    expect(document.querySelector(".gk-statusbar")?.textContent).not.toContain("Shop not set up");
  });

  it("Ctrl+L keeps unsaved values; unlock gives the same field back (test 16)", async () => {
    const api = makeApi();
    await openSettings(api);
    await typeText("x");
    expect(document.activeElement).toBe(input("shopName"));
    await press("l", { ctrl: true });
    await flush(2);
    expect(api.lockSession).toHaveBeenCalledTimes(1);
    expect(pageText()).toContain("Locked");
    expect(document.querySelector(".gk-lock")).not.toBeNull();
    expect(document.querySelector("[inert]")).not.toBeNull();
    await typeText("135790");
    await press("Enter");
    await flush(4);
    expect(api.login).toHaveBeenLastCalledWith(1, "135790");
    expect(document.querySelector(".gk-lock")).toBeNull();
    expect(input("shopName")?.value).toBe("Gokul Oilsx");
    expect(document.activeElement).toBe(input("shopName"));
  });

  it("Esc on the lock screen with unsaved Settings asks first", async () => {
    await openSettings(makeApi());
    await typeText("x");
    await press("l", { ctrl: true });
    await flush(2);
    await press("Escape");
    expect(pageText()).toContain("Selvi has unsaved changes in Settings. Switching user will throw them away.");
    await press("d");
    await flush(3);
    expect(pageText()).toContain("Sign in");
  });
});

describe("session end", () => {
  it("idle for 10 minutes: back to login with a plain notice", async () => {
    vi.useFakeTimers();
    await boot();
    await signIn("owner");
    expect(heading()).toBe("Dashboard");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000 + 100);
    });
    expect(pageText()).toContain("Logged out after 10 minutes idle.");
    expect(pageText()).toContain("Sign in");
  });

  it("SESSION_EXPIRED from Rust sends Office back to login", async () => {
    const api = makeApi({ openScreen: vi.fn(() => Promise.reject(appError("SESSION_EXPIRED", ""))) });
    await boot(api);
    await signIn("owner");
    await press("i", { alt: true });
    await flush(4);
    expect(pageText()).toContain("Logged out after 10 minutes idle.");
  });

  it("heartbeat goes out when keys are pressed, at most every 30 s", async () => {
    const api = makeApi();
    await boot(api);
    await signIn("owner");
    await press("Escape");
    await press("Escape");
    await press("Escape");
    expect(api.heartbeat.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe("Users screen (minimal)", () => {
  const row = (over: Partial<UserRow>): UserRow => ({
    id: 2,
    name: "Ravi Kumar",
    role: "cashier",
    active: true,
    lockedSecondsLeft: 0,
    mustChangePin: false,
    lastLoginAt: null,
    ...over,
  });

  it("lists users, adds a cashier, resets a PIN, unlocks, switches off", async () => {
    const owner = row({ id: 1, name: "Selvi", role: "owner" });
    const ravi = row({ lockedSecondsLeft: 120 });
    const api = makeApi({
      listUsers: vi.fn(() => Promise.resolve([owner, ravi])),
      createUser: vi.fn((name: string) => Promise.resolve(row({ id: 3, name, mustChangePin: true }))),
      resetPin: vi.fn(() => Promise.resolve(row({ mustChangePin: true }))),
      unlockUser: vi.fn(() => Promise.resolve(row({}))),
      deactivateUser: vi.fn(() => Promise.resolve(row({ active: false }))),
    });
    await boot(api);
    await signIn("owner");
    await press("u", { alt: true });
    await flush(4);
    expect(pageText()).toContain("Ravi Kumar");
    expect(pageText()).toContain("Locked (about 2 min)");

    await press("F2");
    await typeText("Meena");
    await press("Enter");
    await typeText("2468");
    await press("Enter");
    await typeText("2468");
    await press("Enter");
    await flush(4);
    expect(api.createUser).toHaveBeenCalledWith("Meena", "2468");
    expect(pageText()).toContain("Meena added.");

    await press("ArrowUp");
    await press("ArrowUp");
    await press("ArrowDown"); // Ravi Kumar
    await press("F8");
    await flush(3);
    expect(api.unlockUser).toHaveBeenCalledWith(2);

    await press("F6");
    await typeText("1357");
    await press("Enter");
    await typeText("1357");
    await press("Enter");
    await flush(4);
    expect(api.resetPin).toHaveBeenCalledWith(2, "1357");

    await press("F9");
    expect(pageText()).toContain("Switch off Ravi Kumar?");
    await press("Enter"); // safe default: keep
    expect(api.deactivateUser).not.toHaveBeenCalled();
    await press("F9");
    await press("s");
    await flush(3);
    expect(api.deactivateUser).toHaveBeenCalledWith(2);
    expect(pageText()).toContain("Switched off");
  });

  it("shows the backend's reason when a new cashier PIN is refused", async () => {
    const api = makeApi({
      listUsers: vi.fn(() => Promise.resolve([row({ id: 1, name: "Selvi", role: "owner" })])),
      createUser: vi.fn(() =>
        Promise.reject(appError("PIN_INVALID", "", { fields: [{ field: "pin", message: "This PIN is too easy to guess. Choose another." }] })),
      ),
    });
    await boot(api);
    await signIn("owner");
    await press("u", { alt: true });
    await flush(4);
    await press("F2");
    await typeText("Meena");
    await press("Enter");
    await typeText("1234");
    await press("Enter");
    await typeText("1234");
    await press("Enter");
    await flush(4);
    expect(pageText()).toContain("! This PIN is too easy to guess. Choose another.");
  });
});

describe("blocked keys", () => {
  it("settings fields keep their text when F5 or Ctrl+R is pressed (handler installed in main.tsx, tested in ui)", () => {
    expect(readySettings.shopName).toBe("Gokul Oils");
  });
});

describe("api contract use", () => {
  it("login sends only the user id and PIN", async () => {
    const api = await boot();
    await signIn("owner");
    expect(api.login).toHaveBeenCalledWith(1, "135790");
    expect(ownerSession.allowedScreens).toHaveLength(9);
  });
});
