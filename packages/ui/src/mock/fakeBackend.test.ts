import { describe, expect, it } from "vitest";
import { createFakeBackend, DEMO, pinProblem, validateSettings } from "./fakeBackend";
import type { AppError, ShopSettings } from "../api-types";

function clock() {
  let t = 1_800_000_000;
  return { now: () => t, advance: (s: number) => void (t += s) };
}

async function err(f: () => unknown): Promise<AppError> {
  try {
    await f();
  } catch (e) {
    return e as AppError;
  }
  throw new Error("expected an error");
}

const shop: ShopSettings = {
  shopName: "Gokul Oils",
  addressLine1: "12 Main Road",
  addressLine2: "",
  addressLine3: "",
  gstin: "",
  fssaiNo: "",
  phone: "98765 43210",
  billFooter: "",
};

const ids = (b: ReturnType<typeof createFakeBackend>) => Object.fromEntries(b.listLoginUsers().map((u) => [u.name, u.id])) as Record<string, number>;

describe("preview fake backend mirrors the contract", () => {
  it("login list carries the role; a wrong recovery code returns tries left", () => {
    const b = createFakeBackend({ kind: "office", scenario: "ready" });
    const list = b.listLoginUsers();
    expect(list.some((u) => u.role === "owner")).toBe(true);
    expect(list.every((u) => u.role === "owner" || u.role === "cashier")).toBe(true);
    let err: AppError | undefined;
    try {
      b.recoverOwnerPin("WRONGCODE0000000", "135790");
    } catch (e) {
      err = e as AppError;
    }
    expect(err?.code).toBe("WRONG_PIN");
    expect(err?.attemptsBeforeLock).toBeGreaterThan(0);
  });

  it("first run: POS refuses until Office has set up the shop", async () => {
    const pos = createFakeBackend({ kind: "pos", scenario: "fresh" });
    expect(pos.startupStatus()).toMatchObject({ setupComplete: false, usersExist: false });
    expect((await err(() => pos.login(1, "739158"))).code).toBe("SHOP_NOT_SET_UP");

    const office = createFakeBackend({ kind: "office", scenario: "fresh" });
    const r = office.setupOwner("Gokul Oils", "Gokul", "739158");
    expect(r.recoveryCode).toHaveLength(16);
    expect(r.session.allowedScreens).toHaveLength(9);
    expect((await err(() => office.setupOwner("X", "Y", "739158"))).code).toBe("ALREADY_SETUP");
    office.saveShopSettings(shop);
    expect(office.startupStatus().setupComplete).toBe(true);
  });

  it("lockout ladder matches Rust: 4 wrong tries count down, 5th locks 30 s, then 120, 600", async () => {
    const c = clock();
    const b = createFakeBackend({ kind: "pos", now: c.now });
    const ravi = ids(b)["Ravi"] ?? 0;
    for (const left of [4, 3, 2, 1]) {
      const e = await err(() => b.login(ravi, "1357"));
      expect([e.code, e.attemptsBeforeLock]).toEqual(["WRONG_PIN", left]);
    }
    let e = await err(() => b.login(ravi, "1357"));
    expect([e.code, e.secondsLeft]).toEqual(["LOCKED", 30]);
    c.advance(10);
    e = await err(() => b.login(ravi, DEMO.ravi.pin)); // right PIN is refused while locked
    expect([e.code, e.secondsLeft]).toEqual(["LOCKED", 20]);
    c.advance(20);
    e = await err(() => b.login(ravi, "1357"));
    expect(e.secondsLeft).toBe(120);
    c.advance(120);
    e = await err(() => b.login(ravi, "1357"));
    expect(e.secondsLeft).toBe(600);
  });

  it("counter ages out after 24 hours and a good login resets it", async () => {
    const c = clock();
    const b = createFakeBackend({ kind: "pos", now: c.now });
    const ravi = ids(b)["Ravi"] ?? 0;
    for (let i = 0; i < 4; i++) await err(() => b.login(ravi, "1357"));
    c.advance(24 * 3600 + 1);
    expect((await err(() => b.login(ravi, "1357"))).attemptsBeforeLock).toBe(4);
    b.login(ravi, DEMO.ravi.pin);
    b.logout();
    expect((await err(() => b.login(ravi, "1357"))).attemptsBeforeLock).toBe(4);
  });

  it("new cashier must change PIN; every guarded call says PIN_CHANGE_REQUIRED until then", async () => {
    const b = createFakeBackend({ kind: "pos" });
    const anu = ids(b)["Anu"] ?? 0;
    expect(b.login(anu, DEMO.anu.pin).mustChangePin).toBe(true);
    expect((await err(() => b.getShopSettings())).code).toBe("PIN_CHANGE_REQUIRED");
    b.heartbeat();
    const bad = await err(() => b.changePin(DEMO.anu.pin, "1234"));
    expect([bad.code, bad.fields?.[0]?.field]).toEqual(["PIN_INVALID", "newPin"]);
    expect(b.changePin(DEMO.anu.pin, "9274").mustChangePin).toBe(false);
    b.getShopSettings();
  });

  it("cashier on Office: limited menu, denied screens and owner commands", async () => {
    const b = createFakeBackend({ kind: "office" });
    const s = b.login(ids(b)["Ravi"] ?? 0, DEMO.ravi.pin);
    expect(s.allowedScreens).toEqual(["dashboard", "items", "stock"]);
    b.openScreen("stock");
    expect((await err(() => b.openScreen("settings"))).code).toBe("PERMISSION_DENIED");
    expect((await err(() => b.listUsers())).code).toBe("PERMISSION_DENIED");
    expect((await err(() => b.saveShopSettings(shop))).code).toBe("PERMISSION_DENIED");
    expect(b.audit().filter((a) => a.action === "permission_denied")).toHaveLength(3);
    expect(b.audit().every((a) => a.app === "office")).toBe(true);
  });

  it("owner admin: create, reset, unlock, deactivate; last owner is protected", async () => {
    const c = clock();
    const b = createFakeBackend({ kind: "office", now: c.now });
    const owner = ids(b)["Gokul"] ?? 0;
    const ravi = ids(b)["Ravi"] ?? 0;
    for (let i = 0; i < 5; i++) await err(() => b.login(ravi, "1357"));
    b.login(owner, DEMO.ownerPin);
    expect(b.listUsers().find((u) => u.id === ravi)?.lockedSecondsLeft).toBe(30);
    expect(b.unlockUser(ravi).lockedSecondsLeft).toBe(0);
    const row = b.createUser("Meena", "4096");
    expect([row.role, row.mustChangePin]).toEqual(["cashier", true]);
    expect((await err(() => b.createUser("meena", "4096"))).fields?.[0]?.field).toBe("name");
    expect(b.resetPin(row.id, "8153").mustChangePin).toBe(true);
    expect(b.deactivateUser(row.id).active).toBe(false);
    expect(b.listLoginUsers().some((u) => u.id === row.id)).toBe(false);
    expect((await err(() => b.deactivateUser(owner))).code).toBe("VALIDATION");
  });

  it("owner recovery: code works once, new code returned, old PIN dead", async () => {
    const b = createFakeBackend({ kind: "office", scenario: "fresh" });
    const r = b.setupOwner("Gokul Oils", "Gokul", "739158");
    b.logout();
    expect((await err(() => b.recoverOwnerPin("AAAA-BBBB-CCCC-DDDD", "586204"))).code).toBe("WRONG_PIN");
    const next = b.recoverOwnerPin(r.recoveryCode, "586204");
    expect(next.recoveryCode).not.toBe(r.recoveryCode);
    const owner = b.listLoginUsers()[0]?.id ?? 0;
    expect((await err(() => b.login(owner, "739158"))).code).toBe("WRONG_PIN");
    b.login(owner, "586204");
    b.logout();
    expect((await err(() => b.recoverOwnerPin(r.recoveryCode, "864209"))).code).toBe("WRONG_PIN");
  });

  it("Office idle logout after 10 minutes; POS never idles; lock ends the session", async () => {
    const c = clock();
    const o = createFakeBackend({ kind: "office", now: c.now });
    o.login(ids(o)["Gokul"] ?? 0, DEMO.ownerPin);
    c.advance(601);
    expect((await err(() => o.getShopSettings())).code).toBe("SESSION_EXPIRED");
    const p = createFakeBackend({ kind: "pos", now: c.now });
    p.login(ids(p)["Ravi"] ?? 0, DEMO.ravi.pin);
    c.advance(86_400);
    p.getShopSettings();
    p.lockSession();
    expect((await err(() => p.getShopSettings())).code).toBe("NOT_LOGGED_IN");
    expect(p.currentSession()).toBeNull();
  });

  it("PIN policy table", () => {
    const cases: [string, "owner" | "cashier", boolean][] = [
      ["4829", "cashier", true],
      ["739158", "owner", true],
      ["4829", "owner", false],
      ["1111", "cashier", false],
      ["1234", "cashier", false],
      ["4321", "cashier", false],
      ["1212", "cashier", false],
      ["2580", "cashier", false],
      ["12a4", "cashier", false],
      ["123", "cashier", false],
      ["1234567", "cashier", false],
    ];
    for (const [pin, role, good] of cases) expect(pinProblem(pin, role) === null, `${pin} ${role}`).toBe(good);
  });

  it("settings validation names the field, normalises, and checks the GSTIN check digit", () => {
    expect(validateSettings({ ...shop, phone: "12" }).errors.map((e) => e.field)).toEqual(["phone"]);
    expect(validateSettings({ ...shop, shopName: " ", addressLine1: "" }).errors.map((e) => e.field)).toEqual(["shopName", "addressLine1"]);
    expect(validateSettings({ ...shop, fssaiNo: "123" }).errors.map((e) => e.field)).toEqual(["fssaiNo"]);
    expect(validateSettings({ ...shop, billFooter: "x".repeat(49) }).errors.map((e) => e.field)).toEqual(["billFooter"]);
    expect(validateSettings({ ...shop, gstin: "27AAPFU0939F1ZX" }).errors.map((e) => e.field)).toEqual(["gstin"]);
    const ok = validateSettings({ ...shop, gstin: "27aapfu0939f1zv", phone: "+91 98765-43210" });
    expect(ok.errors).toEqual([]);
    expect([ok.clean.gstin, ok.clean.phone]).toEqual(["27AAPFU0939F1ZV", "9876543210"]);
  });
});
