// DEV-ONLY in-memory fake of the Rust command API (docs/specs/00-step3-login-security.md).
// Used by `npm run preview:office` / `preview:pos` (vite --mode preview-mock) so screens can be
// clicked and screenshotted in a normal browser. It mirrors the Rust rules (PIN policy, lockout
// ladder, guards, settings validation) closely enough to drive every screen state, but it is NOT
// the source of truth: the Rust tests are.
//
// Never imported by production code. Reachable only through `src/api.mock.ts` of each app, which
// vite swaps in for `src/api.ts` in mode "preview-mock" only (see tools/previewMockPlugin.ts).
// MARKER is searched for in the production bundles by the build checks.

import type { AppError, ErrorCode, FieldError, LoginUser, Role, Screen, SessionInfo, ShopSettings, StartupStatus, StatusBarInfo, UserRow } from "../api-types";

export const PREVIEW_MOCK_MARKER = "__GOKUL_PREVIEW_MOCK_7f3a9c__";

export type AppKind = "pos" | "office";
export type Scenario = "ready" | "fresh";

export interface FakeOptions {
  kind: AppKind;
  scenario?: Scenario;
  /** Seconds since 1970. Tests move it by hand. */
  now?: () => number;
}

interface FakeUser {
  id: number;
  name: string;
  role: Role;
  active: boolean;
  pin: string; // plain text is fine here: this is a throwaway fake
  failed: number;
  lockedUntil: number;
  lastFailedAt: number;
  mustChangePin: boolean;
  lastLoginAt: string | null;
}

interface FakeSession {
  userId: number;
  lastActivity: number;
}

export interface AuditRow {
  action: string;
  userId: number | null;
  app: AppKind;
}

const ALL_SCREENS: Screen[] = ["dashboard", "items", "stock", "production", "packing", "purchases", "reports", "users", "settings"];
const CASHIER_SCREENS: Screen[] = ["dashboard", "items", "stock"];
const DENY = new Set(["2580", "1004", "2000", "2024", "2025", "2026", "1122", "0123"]);
const LOCK_AFTER = 5;
const AGE_OUT = 24 * 3600;
const IDLE_OFFICE = 600;

/** Demo logins for the "ready" scenario (shown in the README, never in the UI). */
export const DEMO = {
  ownerPin: "739158",
  ravi: { name: "Ravi", pin: "4829" },
  anu: { name: "Anu", pin: "6073" }, // must change PIN on first login
} as const;

function fail(code: ErrorCode, message: string, extra: Partial<AppError> = {}): never {
  const e: AppError = { code, message, ...extra };
  throw e;
}

function ladder(attempts: number, role: Role): number {
  if (attempts < 5) return 0;
  if (attempts === 5) return 30;
  if (attempts === 6) return 120;
  if (attempts === 7) return 600;
  return role === "cashier" ? 1800 : 300;
}

/** Same rules as Rust `validate_pin`. Returns a message or null. */
export function pinProblem(pin: string, role: Role): string | null {
  if (!/^[0-9]+$/.test(pin)) return "PIN can have digits only.";
  if (pin.length < 4 || pin.length > 6) return "PIN must be 4 to 6 digits.";
  if (role === "owner" && pin.length !== 6) return "The owner PIN must be exactly 6 digits.";
  const d = [...pin].map(Number);
  const pairs = d.slice(1).map((x, i) => x - (d[i] ?? 0));
  const half = d.length / 2;
  const easy =
    pairs.every((p) => p === 0) ||
    pairs.every((p) => p === 1) ||
    pairs.every((p) => p === -1) ||
    (d.length % 2 === 0 && d.slice(0, half).join("") === d.slice(half).join("")) ||
    DENY.has(pin);
  return easy ? "This PIN is too easy to guess. Choose another." : null;
}

const GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function gstinCheckChar(first14: string): string {
  let sum = 0;
  [...first14].forEach((c, i) => {
    const p = GST_CHARS.indexOf(c) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  });
  return GST_CHARS[(36 - (sum % 36)) % 36] ?? "0";
}

/** Same rules as Rust `normalize_shop_settings`. */
export function validateSettings(input: ShopSettings): { clean: ShopSettings; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const line = (v: string, max: number, required: boolean, field: FieldError["field"], need: string, long: string): string => {
    const s = v.trim().replace(/\s+/g, " ");
    if (required && s === "") errors.push({ field, message: need });
    else if ([...s].length > max) errors.push({ field, message: long });
    return s;
  };
  const clean: ShopSettings = {
    shopName: line(input.shopName, 40, true, "shopName", "Enter the shop name.", "Shop name can be at most 40 characters."),
    addressLine1: line(input.addressLine1, 48, true, "addressLine1", "Enter the first address line.", "Address line can be at most 48 characters."),
    addressLine2: line(input.addressLine2, 48, false, "addressLine2", "", "Address line can be at most 48 characters."),
    addressLine3: line(input.addressLine3, 48, false, "addressLine3", "", "Address line can be at most 48 characters."),
    billFooter: line(input.billFooter, 48, false, "billFooter", "", "Footer line can be at most 48 characters."),
    phone: "",
    gstin: "",
    fssaiNo: "",
  };

  const rawPhone = input.phone.replace(/[ -]/g, "");
  if (rawPhone === "") errors.push({ field: "phone", message: "Enter the shop phone number." });
  else {
    const body = rawPhone.startsWith("+91") ? rawPhone.slice(3) : rawPhone;
    if (!/^[0-9]+$/.test(body)) errors.push({ field: "phone", message: "Phone can have digits only." });
    else {
      let digits = body;
      if (!rawPhone.startsWith("+91")) {
        if (body.length === 12 && body.startsWith("91")) digits = body.slice(2);
        else if (body.length === 11 && body.startsWith("0")) digits = body.slice(1);
      }
      if (digits.length !== 10) errors.push({ field: "phone", message: `Phone must be 10 digits. You typed ${digits.length}.` });
      else clean.phone = digits;
    }
  }

  const g = input.gstin.replace(/\s+/g, "").toUpperCase();
  if (g !== "") {
    if (g.length !== 15) errors.push({ field: "gstin", message: `GSTIN must be 15 characters. You typed ${g.length}.` });
    else if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g))
      errors.push({ field: "gstin", message: "GSTIN format is not right. It looks like 33ABCDE1234F1Z5. Check your GST certificate." });
    else if (gstinCheckChar(g.slice(0, 14)) !== g[14])
      errors.push({ field: "gstin", message: "One character in the GSTIN is wrong. Check each letter against your GST certificate." });
    else clean.gstin = g;
  }

  const f = input.fssaiNo.trim();
  if (f !== "") {
    if (!/^[0-9]{14}$/.test(f)) errors.push({ field: "fssaiNo", message: `FSSAI number must be 14 digits. You typed ${[...f].length}.` });
    else clean.fssaiNo = f;
  }
  return { clean, errors };
}

function cleanName(raw: string, field: "name" | "shopName", what: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  // eslint-disable-next-line no-control-regex
  if (s === "" || [...s].length > 40 || /[\u0000-\u001f\u007f]/.test(s)) {
    fail("VALIDATION", "Some fields need fixing.", { fields: [{ field, message: `Enter ${what} (1 to 40 characters).` }] });
  }
  return s;
}

const READY_SETTINGS: ShopSettings = {
  shopName: "Gokul Oils",
  addressLine1: "12 Main Road",
  addressLine2: "",
  addressLine3: "Erode 638001",
  gstin: "",
  fssaiNo: "",
  phone: "9876543210",
  billFooter: "Thank you, visit again",
};
const EMPTY_SETTINGS: ShopSettings = { shopName: "", addressLine1: "", addressLine2: "", addressLine3: "", gstin: "", fssaiNo: "", phone: "", billFooter: "" };

function newRecoveryCode(rnd: () => number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 16; i++) s += alphabet[Math.floor(rnd() * alphabet.length)];
  return s;
}

export function createFakeBackend(opts: FakeOptions) {
  const kind = opts.kind;
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  const users: FakeUser[] = [];
  const audit: AuditRow[] = [];
  let settings: ShopSettings = { ...EMPTY_SETTINGS };
  let recoveryCode = "";
  let session: FakeSession | null = null;
  let nextId = 1;

  const log = (action: string, userId: number | null) => audit.push({ action, userId, app: kind });
  const addUser = (name: string, role: Role, pin: string, mustChangePin: boolean): FakeUser => {
    const u: FakeUser = { id: nextId++, name, role, active: true, pin, failed: 0, lockedUntil: 0, lastFailedAt: 0, mustChangePin, lastLoginAt: null };
    users.push(u);
    return u;
  };

  if ((opts.scenario ?? "ready") === "ready") {
    settings = { ...READY_SETTINGS };
    addUser("Gokul", "owner", DEMO.ownerPin, false);
    addUser(DEMO.ravi.name, "cashier", DEMO.ravi.pin, false);
    addUser(DEMO.anu.name, "cashier", DEMO.anu.pin, true);
    recoveryCode = "DEMOCODE23456789";
  }

  const byId = (id: number): FakeUser => users.find((u) => u.id === id) ?? fail("NOT_FOUND", "That user was not found.");
  const isSetUp = () => settings.shopName !== "" && settings.addressLine1 !== "" && validateSettings(settings).errors.every((e) => e.field !== "phone");
  const lockedLeft = (u: FakeUser) => Math.max(0, u.lockedUntil - now());
  const infoOf = (u: FakeUser): SessionInfo => ({
    userId: u.id,
    name: u.name,
    role: u.role,
    mustChangePin: u.mustChangePin,
    allowedScreens: kind === "pos" ? [] : u.role === "owner" ? [...ALL_SCREENS] : [...CASHIER_SCREENS],
  });
  const rowOf = (u: FakeUser): UserRow => ({
    id: u.id,
    name: u.name,
    role: u.role,
    active: u.active,
    lockedSecondsLeft: lockedLeft(u),
    mustChangePin: u.mustChangePin,
    lastLoginAt: u.lastLoginAt,
  });
  const stamp = () => new Date(now() * 1000).toISOString().slice(0, 19);

  /** Idle limit: POS never, Office 10 minutes. */
  const requireLogin = (allowPending = false): FakeUser => {
    if (!session) fail("NOT_LOGGED_IN", "Please sign in.");
    const u = users.find((x) => x.id === session?.userId);
    if (!u || !u.active) {
      session = null;
      fail("NOT_LOGGED_IN", "Please sign in.");
    }
    if (kind === "office" && now() - session.lastActivity > IDLE_OFFICE) {
      session = null;
      log("session_idle_logout", u.id);
      fail("SESSION_EXPIRED", "You were signed out after being idle. Please sign in again.");
    }
    if (u.mustChangePin && !allowPending) fail("PIN_CHANGE_REQUIRED", "Please set a new PIN before continuing.");
    session.lastActivity = now();
    return u;
  };
  const requireOwner = (): FakeUser => {
    const u = requireLogin();
    if (u.role !== "owner") {
      log("permission_denied", u.id);
      fail("PERMISSION_DENIED", "Only the owner can do this.");
    }
    return u;
  };
  const requireOffice = () => {
    if (kind !== "office") fail("PERMISSION_DENIED", "Only the owner can do this.");
  };

  /** Reserve an attempt (lockout ladder). Returns the user to verify against. */
  const beginAttempt = (u: FakeUser): void => {
    if (now() < u.lockedUntil) fail("LOCKED", `Too many wrong tries. Locked for ${lockedLeft(u)} seconds.`, { secondsLeft: lockedLeft(u) });
    if (u.failed > 0 && now() - u.lastFailedAt > AGE_OUT) u.failed = 0;
  };
  const failAttempt = (u: FakeUser, recoveryCodeTry = false): never => {
    u.failed += 1;
    u.lastFailedAt = now();
    const secs = ladder(u.failed, u.role);
    log("login_failed", u.id);
    if (secs > 0) {
      u.lockedUntil = now() + secs;
      log("login_locked", u.id);
      fail("LOCKED", `Too many wrong tries. Locked for ${secs} seconds.`, { secondsLeft: secs });
    }
    fail("WRONG_PIN", recoveryCodeTry ? "Wrong recovery code." : "Wrong PIN.", { attemptsBeforeLock: LOCK_AFTER - u.failed });
  };
  const pinOrThrow = (pin: string, role: Role, field: "pin" | "newPin"): void => {
    const m = pinProblem(pin, role);
    if (m) fail("PIN_INVALID", m, { fields: [{ field, message: m }] });
  };
  const start = (u: FakeUser): SessionInfo => {
    session = { userId: u.id, lastActivity: now() };
    return infoOf(u);
  };
  const success = (u: FakeUser) => {
    u.failed = 0;
    u.lockedUntil = 0;
    u.lastLoginAt = stamp();
  };

  return {
    audit: (): readonly AuditRow[] => audit,

    startupStatus: (): StartupStatus => ({
      db: "ok",
      setupComplete: isSetUp(),
      usersExist: users.length > 0,
      shopName: settings.shopName || null,
      dbMessage: null,
    }),
    listLoginUsers: (): LoginUser[] => users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name })),

    login(userId: number, pin: string): SessionInfo {
      if (!/^[0-9]{4,6}$/.test(pin)) fail("PIN_INVALID", "PIN must be 4 to 6 digits.", { fields: [{ field: "pin", message: "PIN must be 4 to 6 digits." }] });
      if (kind === "pos" && !isSetUp()) fail("SHOP_NOT_SET_UP", "The shop is not set up yet. Ask the owner to open Gokul Office.");
      const u = users.find((x) => x.id === userId);
      if (!u || !u.active) fail("NOT_FOUND", "This user has been switched off. Choose another name.");
      beginAttempt(u);
      if (u.pin !== pin) return failAttempt(u);
      success(u);
      log("login_ok", u.id);
      return start(u);
    },
    currentSession(): SessionInfo | null {
      const u = session ? users.find((x) => x.id === session?.userId) : undefined;
      return u?.active ? infoOf(u) : null;
    },
    logout(): void {
      const u = requireLogin(true);
      log("logout", u.id);
      session = null;
    },
    lockSession(): void {
      const u = requireLogin(true);
      log("session_lock", u.id);
      session = null;
    },
    heartbeat(): void {
      requireLogin(true);
    },
    changePin(oldPin: string, newPin: string): SessionInfo {
      const u = requireLogin(true);
      pinOrThrow(newPin, u.role, "newPin");
      if (oldPin === newPin) {
        const m = "The new PIN must be different from the current PIN.";
        fail("PIN_INVALID", m, { fields: [{ field: "newPin", message: m }] });
      }
      beginAttempt(u);
      if (u.pin !== oldPin) return failAttempt(u);
      u.pin = newPin;
      u.mustChangePin = false;
      success(u);
      log("pin_changed", u.id);
      return infoOf(u);
    },
    getStatusBar(): StatusBarInfo {
      const u = session ? users.find((x) => x.id === session?.userId) : undefined;
      return { shopName: settings.shopName, userName: u?.active ? u.name : null, lastBackupAt: null };
    },
    getShopSettings(): ShopSettings {
      requireLogin();
      return { ...settings };
    },

    setupOwner(shopName: string, ownerName: string, pin: string): { recoveryCode: string; session: SessionInfo } {
      requireOffice();
      const shop = cleanName(shopName, "shopName", "the shop name");
      const name = cleanName(ownerName, "name", "a name");
      pinOrThrow(pin, "owner", "pin");
      if (users.length > 0) fail("ALREADY_SETUP", "The shop is already set up.");
      const u = addUser(name, "owner", pin, false);
      settings = { ...settings, shopName: shop };
      recoveryCode = newRecoveryCode(Math.random);
      log("setup_owner", u.id);
      return { recoveryCode, session: start(u) };
    },
    recoverOwnerPin(code: string, newPin: string): { recoveryCode: string } {
      requireOffice();
      pinOrThrow(newPin, "owner", "newPin");
      const owner = users.find((u) => u.role === "owner" && u.active);
      if (!owner || recoveryCode === "") fail("NOT_FOUND", "Recovery code was not found.");
      beginAttempt(owner);
      if (code.replace(/[\s-]/g, "").toUpperCase() !== recoveryCode) return failAttempt(owner, true);
      owner.pin = newPin;
      success(owner);
      recoveryCode = newRecoveryCode(Math.random);
      log("owner_recovery_used", owner.id);
      return { recoveryCode };
    },
    saveShopSettings(input: ShopSettings): ShopSettings {
      requireOffice();
      requireOwner();
      const { clean, errors } = validateSettings(input);
      if (errors.length > 0) fail("VALIDATION", "Some fields need fixing.", { fields: errors });
      settings = clean;
      log("settings_changed", session?.userId ?? null);
      return { ...settings };
    },
    openScreen(screen: Screen): void {
      requireOffice();
      const u = requireLogin();
      if (!ALL_SCREENS.includes(screen)) fail("NOT_FOUND", "Screen was not found.");
      if (u.role === "cashier" && !CASHIER_SCREENS.includes(screen)) {
        log("permission_denied", u.id);
        fail("PERMISSION_DENIED", "Only the owner can do this.");
      }
    },
    listUsers(): UserRow[] {
      requireOffice();
      requireOwner();
      return users.map(rowOf);
    },
    createUser(name: string, pin: string): UserRow {
      requireOffice();
      requireOwner();
      const n = cleanName(name, "name", "a name");
      pinOrThrow(pin, "cashier", "pin");
      if (users.some((u) => u.name.toLowerCase() === n.toLowerCase())) {
        fail("VALIDATION", "Some fields need fixing.", { fields: [{ field: "name", message: "A user with this name already exists." }] });
      }
      const u = addUser(n, "cashier", pin, true);
      log("user_created", u.id);
      return rowOf(u);
    },
    resetPin(userId: number, newPin: string): UserRow {
      requireOffice();
      requireOwner();
      const u = byId(userId);
      pinOrThrow(newPin, u.role, "newPin");
      u.pin = newPin;
      u.mustChangePin = u.role === "cashier";
      u.failed = 0;
      u.lockedUntil = 0;
      log("pin_reset", u.id);
      return rowOf(u);
    },
    unlockUser(userId: number): UserRow {
      requireOffice();
      requireOwner();
      const u = byId(userId);
      u.failed = 0;
      u.lockedUntil = 0;
      log("user_unlocked", u.id);
      return rowOf(u);
    },
    deactivateUser(userId: number): UserRow {
      requireOffice();
      const me = requireOwner();
      const u = byId(userId);
      const lastOwner = u.role === "owner" && users.filter((x) => x.role === "owner" && x.active && x.id !== u.id).length === 0;
      if (lastOwner || u.id === me.id) fail("VALIDATION", "At least one active owner is required.");
      u.active = false;
      log("user_deactivated", u.id);
      return rowOf(u);
    },
  };
}

export type FakeBackend = ReturnType<typeof createFakeBackend>;
