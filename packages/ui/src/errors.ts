import type { AppError, ErrorCode } from "./api-types";

const CODES: ReadonlySet<string> = new Set<ErrorCode>([
  "NOT_LOGGED_IN",
  "SESSION_EXPIRED",
  "PERMISSION_DENIED",
  "WRONG_PIN",
  "LOCKED",
  "PIN_INVALID",
  "ALREADY_SETUP",
  "SHOP_NOT_SET_UP",
  "VALIDATION",
  "NOT_FOUND",
  "DB_BUSY",
  "DB_NEWER",
  "PIN_CHANGE_REQUIRED",
  "INTERNAL",
]);

export function isAppError(value: unknown): value is AppError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { code?: unknown; message?: unknown };
  return typeof v.code === "string" && CODES.has(v.code) && typeof v.message === "string";
}

/** Turns anything thrown by invoke() into an AppError. Never throws. */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (isAppError(parsed)) return parsed;
    } catch {
      // not JSON: fall through
    }
    return { code: "INTERNAL", message: value };
  }
  return { code: "INTERNAL", message: "" };
}

const FALLBACK: Record<ErrorCode, string> = {
  NOT_LOGGED_IN: "Please sign in again.",
  SESSION_EXPIRED: "You were signed out because the screen was idle. Enter your PIN to continue.",
  PERMISSION_DENIED: "You cannot do this. Ask the owner.",
  WRONG_PIN: "Wrong PIN.",
  LOCKED: "Too many wrong PINs. Wait, or ask the owner to unlock.",
  PIN_INVALID: "This PIN is not allowed. Choose another.",
  ALREADY_SETUP: "This computer already has an owner. Sign in instead.",
  SHOP_NOT_SET_UP: "The shop is not set up yet. Ask the owner.",
  VALIDATION: "Some fields need fixing.",
  NOT_FOUND: "That no longer exists. Go back and try again.",
  DB_BUSY: "The shop data is busy. Wait a minute and try again.",
  DB_NEWER: "This app is older than the shop data. Install the newer version.",
  PIN_CHANGE_REQUIRED: "You must choose a new PIN before you continue.",
  INTERNAL: "Something went wrong. Nothing was changed. Try again, or call IT.",
};

/** Seconds as plain words: "45 seconds", "2 minutes". */
export function secondsInWords(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 90) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.ceil(s / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

/** One plain sentence for staff. Uses the backend message when it has one. */
export function plainMessage(error: AppError): string {
  if (error.code === "LOCKED" && typeof error.secondsLeft === "number") {
    return `Too many wrong PINs. Try again in ${secondsInWords(error.secondsLeft)}, or ask the owner to unlock.`;
  }
  if (error.code === "WRONG_PIN" && typeof error.attemptsBeforeLock === "number") {
    const n = error.attemptsBeforeLock;
    return `Wrong PIN. ${n} ${n === 1 ? "try" : "tries"} left.`;
  }
  const own = error.message.trim();
  return own.length > 0 ? own : FALLBACK[error.code];
}

/** Message for a field from a VALIDATION / PIN_INVALID error, if the backend named it. */
export function fieldMessage(error: AppError, field: string): string | undefined {
  return error.fields?.find((f) => f.field === field)?.message;
}

export type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/** Wraps Tauri's `invoke` so every failure arrives as an AppError (used only inside each app's api.ts). */
export function withAppErrors(invoke: Invoke): Invoke {
  return async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    try {
      return await invoke<T>(cmd, args);
    } catch (e) {
      throw toAppError(e);
    }
  };
}

/** Codes that mean "the session is gone": the app must show the PIN lock screen. */
export function isSessionGone(error: AppError): boolean {
  return error.code === "SESSION_EXPIRED" || error.code === "NOT_LOGGED_IN";
}
