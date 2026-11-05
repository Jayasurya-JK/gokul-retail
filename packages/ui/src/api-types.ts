// Types of the command API contract (docs/specs/00-step3-login-security.md, "Command API contract").
// Do not change without Head of IT approval. Rust structs serialise as camelCase.

export type Role = "owner" | "cashier";
export type Screen =
  | "dashboard"
  | "items"
  | "stock"
  | "production"
  | "packing"
  | "purchases"
  | "reports"
  | "users"
  | "settings";

export interface SessionInfo {
  userId: number;
  name: string;
  role: Role;
  mustChangePin: boolean;
  /** POS: always an empty list. */
  allowedScreens: Screen[];
}

export interface LoginUser {
  id: number;
  name: string;
}

export interface StartupStatus {
  db: "ok" | "newer_than_app" | "busy" | "error";
  setupComplete: boolean;
  usersExist: boolean;
  shopName: string | null;
  dbMessage: string | null;
}

export interface StatusBarInfo {
  shopName: string;
  userName: string | null;
  /** ISO local time, or null = never. */
  lastBackupAt: string | null;
}

export interface ShopSettings {
  shopName: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  gstin: string;
  fssaiNo: string;
  phone: string;
  billFooter: string;
}

export interface UserRow {
  id: number;
  name: string;
  role: Role;
  active: boolean;
  lockedSecondsLeft: number;
  mustChangePin: boolean;
  lastLoginAt: string | null;
}

export interface FieldError {
  field: keyof ShopSettings | "name" | "pin" | "newPin";
  message: string;
}

export type ErrorCode =
  | "NOT_LOGGED_IN"
  | "SESSION_EXPIRED"
  | "PERMISSION_DENIED"
  | "WRONG_PIN"
  | "LOCKED"
  | "PIN_INVALID"
  | "ALREADY_SETUP"
  | "SHOP_NOT_SET_UP"
  | "VALIDATION"
  | "NOT_FOUND"
  | "DB_BUSY"
  | "DB_NEWER"
  | "PIN_CHANGE_REQUIRED"
  | "INTERNAL";

export interface AppError {
  code: ErrorCode;
  /** Plain English, safe to show. */
  message: string;
  /** LOCKED */
  secondsLeft?: number;
  /** WRONG_PIN */
  attemptsBeforeLock?: number;
  /** VALIDATION, PIN_INVALID */
  fields?: FieldError[];
}

/** Commands both apps share. Each app's api.ts implements these (and only calls invoke there). */
export interface CommonApi {
  startupStatus(): Promise<StartupStatus>;
  listLoginUsers(): Promise<LoginUser[]>;
  login(userId: number, pin: string): Promise<SessionInfo>;
  currentSession(): Promise<SessionInfo | null>;
  logout(): Promise<void>;
  lockSession(): Promise<void>;
  heartbeat(): Promise<void>;
  changePin(oldPin: string, newPin: string): Promise<SessionInfo>;
  getStatusBar(): Promise<StatusBarInfo>;
  getShopSettings(): Promise<ShopSettings>;
}
