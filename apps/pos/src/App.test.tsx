import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appError, flush, mount, pageText, press, typeText, unmountAll } from "@gokul/ui/testing";
import { resetKeymapsForTests } from "@gokul/ui";
import { App } from "./App";
import { cashier, makeApi, okStatus } from "./testApi";

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

async function signIn() {
  await press("ArrowDown");
  await press("Enter");
  await flush(2);
  await typeText("2468");
  await press("Enter");
  await flush(4);
}

describe("start-up", () => {
  it("shows 'shop not set up' when there is no owner or the shop is not set up (test 1)", async () => {
    await boot(makeApi({ startupStatus: vi.fn(() => Promise.resolve({ ...okStatus, usersExist: false, setupComplete: false })) }));
    expect(pageText()).toContain("The shop is not set up yet");
    expect(pageText()).toContain("Ask the owner to open Gokul Office on this computer.");
    expect(pageText()).toContain("SHOP-NOT-SET-UP");
    expect(pageText()).not.toContain("Sign in");
  });

  it("Check again goes to login without restarting once the owner has saved Settings (test 4)", async () => {
    const startupStatus = vi
      .fn()
      .mockResolvedValueOnce({ ...okStatus, setupComplete: false })
      .mockResolvedValueOnce({ ...okStatus, setupComplete: false })
      .mockResolvedValue(okStatus);
    await boot(makeApi({ startupStatus }));
    await press("Enter");
    await flush(4);
    expect(pageText()).toMatch(/Still not set up \(checked at \d{1,2}:\d{2} (AM|PM)\)\./);
    await press("Enter");
    await flush(4);
    expect(pageText()).toContain("Gokul POS - Sign in");
  });

  it.each([
    ["error", "Gokul POS cannot open the shop data", "DB-OPEN"],
    ["busy", "The shop data is busy", "DB-BUSY"],
    ["newer_than_app", "This Gokul POS is older than the shop data", "DB-NEWER"],
  ] as const)("database %s shows its screen (test 3)", async (db, title, code) => {
    const startupStatus = vi
      .fn()
      .mockResolvedValueOnce({ ...okStatus, db, dbMessage: "data version 7" })
      .mockResolvedValue(okStatus);
    await boot(makeApi({ startupStatus }));
    expect(pageText()).toContain(title);
    expect(pageText()).toContain(code);
    await press("Enter");
    await flush(4);
    expect(pageText()).toContain(db === "newer_than_app" ? title : "Sign in");
  });

  it("login says the shop is not set up: back to the blocking screen", async () => {
    const startupStatus = vi
      .fn()
      .mockResolvedValueOnce(okStatus)
      .mockResolvedValue({ ...okStatus, setupComplete: false });
    await boot(makeApi({ startupStatus, login: vi.fn(() => Promise.reject(appError("SHOP_NOT_SET_UP", ""))) }));
    await signIn();
    await flush(4);
    expect(pageText()).toContain("The shop is not set up yet");
  });
});

describe("login", () => {
  it("pre-chooses the last user on this PC with focus on the PIN (test 10)", async () => {
    await boot(makeApi({ readLastUserId: vi.fn(() => 2) }));
    expect(pageText()).toContain("PIN for Ravi Kumar");
    expect(document.activeElement?.getAttribute("name")).toBe("pin");
  });

  it("signs in, remembers the user, opens the counter shell", async () => {
    const api = await boot();
    await signIn();
    expect(api.login).toHaveBeenCalledWith(2, "2468");
    expect(api.saveLastUserId).toHaveBeenCalledWith(2);
    expect(pageText()).toContain("Billing");
    expect(pageText()).toContain("The billing screen comes in the next update.");
    expect(document.querySelector(".gk-statusbar")?.textContent).toContain("Ravi Kumar (Cashier)");
    expect(document.querySelector(".gk-statusbar")?.textContent).toContain("Gokul Oils");
    expect(document.querySelector(".gk-statusbar")?.textContent).toContain("Backup: not set up yet");
  });

  it("a user whose PIN must change goes to the change-PIN screen first", async () => {
    const api = await boot(makeApi({ login: vi.fn(() => Promise.resolve({ ...cashier, mustChangePin: true })) }));
    await signIn();
    expect(pageText()).toContain("Change your PIN");
    await typeText("2468");
    await press("Enter");
    await typeText("1357");
    await press("Enter");
    await typeText("1357");
    await press("Enter");
    await flush(4);
    expect(api.changePin).toHaveBeenCalledWith("2468", "1357");
    expect(pageText()).toContain("Billing");
  });
});

describe("POS shell (test 20)", () => {
  it("legend has 12 fixed F-key slots and Ctrl+L Lock", async () => {
    await boot();
    await signIn();
    const slots = Array.from(document.querySelectorAll("[data-slot]")).map((e) => e.getAttribute("data-slot"));
    expect(slots).toHaveLength(12);
    expect(document.querySelector('[data-slot="F1"]')?.textContent).toBe("F1Help");
    expect(document.querySelector('[data-slot="F2"]')?.textContent).toBe("F2");
    expect(document.querySelector(".gk-legend")?.textContent).toContain("Ctrl+LLock");
  });

  it("F2-F12 do nothing (but never reach the browser); Esc does nothing; focus stays on the counter", async () => {
    await boot();
    await signIn();
    const before = document.activeElement;
    for (const k of ["F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"]) {
      const ev = await press(k);
      expect(ev.defaultPrevented).toBe(true);
    }
    await press("Escape");
    expect(document.activeElement).toBe(before);
    expect(pageText()).toContain("Billing");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("F1 shows the keys and Esc closes the list", async () => {
    await boot();
    await signIn();
    await press("F1");
    expect(pageText()).toContain("Keys on this screen");
    await press("Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("Ctrl+L locks, hides the screen, keeps it, and the PIN unlocks (test 16)", async () => {
    const api = await boot();
    await signIn();
    const counter = document.activeElement;
    await press("l", { ctrl: true });
    await flush(2);
    expect(api.lockSession).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".gk-lock")).not.toBeNull();
    expect(pageText()).toContain("Locked at");
    await typeText("2468");
    await press("Enter");
    await flush(4);
    expect(document.querySelector(".gk-lock")).toBeNull();
    expect(document.activeElement).toBe(counter);
  });

  it("wrong PIN on lock counts down; lock-out blocks until the time is up", async () => {
    const login = vi
      .fn()
      .mockResolvedValueOnce(cashier)
      .mockRejectedValueOnce(appError("WRONG_PIN", "", { attemptsBeforeLock: 1 }))
      .mockRejectedValueOnce(appError("LOCKED", "", { secondsLeft: 30 }));
    await boot(makeApi({ login }));
    await signIn();
    await press("l", { ctrl: true });
    await flush(2);
    await typeText("1111");
    await press("Enter");
    await flush(3);
    expect(pageText()).toContain("Wrong PIN. 1 try left.");
    await typeText("1111");
    await press("Enter");
    await flush(3);
    expect(pageText()).toContain("cannot sign in until");
  });

  it("POS never locks by itself, and the heartbeat is rare (spec decision)", async () => {
    vi.useFakeTimers();
    const api = await boot();
    await signIn();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * 3_600_000);
    });
    expect(document.querySelector(".gk-lock")).toBeNull();
    for (let i = 0; i < 5; i++) await press("F2");
    expect(api.heartbeat.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("a dead session shows the PIN screen with the counter kept underneath", async () => {
    const api = await boot();
    await signIn();
    api.heartbeat.mockRejectedValueOnce(appError("SESSION_EXPIRED", ""));
    await press("a", { alt: true }); // any key: heartbeat goes out
    await flush(3);
    expect(document.querySelector(".gk-lock")).not.toBeNull();
  });

  it("window close asks 'Close Gokul POS?'; Esc stays, Enter closes", async () => {
    const api = makeApi();
    let closeHandler: () => void = () => undefined;
    api.onCloseRequested.mockImplementation((h: () => void) => {
      closeHandler = h;
      return Promise.resolve(() => undefined);
    });
    await boot(api);
    await signIn();
    await act(async () => closeHandler());
    expect(pageText()).toContain("Close Gokul POS?");
    await press("Escape");
    expect(api.closeWindow).not.toHaveBeenCalled();
    await act(async () => closeHandler());
    await press("Enter");
    expect(api.closeWindow).toHaveBeenCalledTimes(1);
  });

  it("Esc on the lock screen switches user", async () => {
    const api = await boot();
    await signIn();
    await press("l", { ctrl: true });
    await flush(2);
    await press("Escape");
    await flush(3);
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(pageText()).toContain("Gokul POS - Sign in");
  });
});
