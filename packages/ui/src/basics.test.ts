// @vitest-environment node
import { describe, expect, it } from "vitest";
import { backendMessage, fieldMessage, isSessionGone, plainMessage, secondsInWords, toAppError } from "./errors";
import { digitsOnly, formatBackup, formatDateTime, formatPaise, formatTime } from "./format";
import { msToNextMinute } from "./hooks";
import { readFileSync } from "node:fs";

const rawCss = readFileSync(new URL("./theme.css", import.meta.url), "utf8");
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, ""); // comments may mention the banned words

describe("time and money formatting", () => {
  it("shows 12-hour time", () => {
    expect(formatTime(new Date(2026, 10, 5, 14, 32))).toBe("2:32 PM");
    expect(formatTime(new Date(2026, 10, 5, 0, 5))).toBe("12:05 AM");
    expect(formatTime(new Date(2026, 10, 5, 12, 0))).toBe("12:00 PM");
  });

  it("shows the status bar date and time", () => {
    expect(formatDateTime(new Date(2026, 10, 5, 14, 32))).toBe("Thu 05 Nov 2026  2:32 PM");
  });

  it("formats paise with Indian grouping", () => {
    expect(formatPaise(12345600)).toBe("₹1,23,456.00");
    expect(formatPaise(99)).toBe("₹0.99");
    expect(formatPaise(100000)).toBe("₹1,000.00");
    expect(formatPaise(-250)).toBe("-₹2.50");
  });

  it("keeps digits only", () => {
    expect(digitsOnly("98a76 5")).toBe("98765");
  });
});

describe("backup text (test 29)", () => {
  const now = new Date(2026, 10, 5, 14, 32);
  it("before backups exist", () => {
    expect(formatBackup(false, null, now)).toEqual({ text: "Backup: not set up yet", level: "normal" });
  });
  it("never is a red word", () => {
    expect(formatBackup(true, null, now)).toEqual({ text: "Backup: never", level: "danger" });
  });
  it("today and yesterday within 24 h are normal", () => {
    expect(formatBackup(true, "2026-11-05T09:10:00", now)).toEqual({ text: "Backup: Today 9:10 AM", level: "normal" });
    expect(formatBackup(true, "2026-11-04T18:05:00", now)).toEqual({ text: "Backup: Yesterday 6:05 PM", level: "normal" });
  });
  it("older than 24 h is a warning with the age in words", () => {
    expect(formatBackup(true, "2026-11-03T18:05:00", now)).toEqual({ text: "Backup: 1 day ago", level: "warn" });
    expect(formatBackup(true, "2026-11-01T09:00:00", now)).toEqual({ text: "Backup: 4 days ago", level: "warn" });
  });
});

describe("error helper", () => {
  it("turns anything into an AppError", () => {
    expect(toAppError({ code: "LOCKED", message: "x", secondsLeft: 5 }).code).toBe("LOCKED");
    expect(toAppError('{"code":"WRONG_PIN","message":"Wrong"}').code).toBe("WRONG_PIN");
    expect(toAppError("plain text").message).toBe("plain text");
    expect(toAppError(undefined).code).toBe("INTERNAL");
  });
  it("gives plain messages", () => {
    expect(plainMessage({ code: "WRONG_PIN", message: "", attemptsBeforeLock: 2 })).toBe("Wrong PIN. 2 tries left.");
    expect(plainMessage({ code: "WRONG_PIN", message: "", attemptsBeforeLock: 1 })).toBe("Wrong PIN. 1 try left.");
    expect(plainMessage({ code: "LOCKED", message: "", secondsLeft: 30 })).toContain("30 seconds");
    expect(plainMessage({ code: "INTERNAL", message: "" })).toContain("Nothing was changed");
    expect(plainMessage({ code: "VALIDATION", message: "Phone must be 10 digits." })).toBe("Phone must be 10 digits.");
  });
  it("an error on a field that is not on screen still shows the backend's words (QA-2)", () => {
    const err = { code: "VALIDATION" as const, message: "", fields: [{ field: "name" as const, message: "At least one active owner is required." }] };
    expect(plainMessage(err)).toBe("At least one active owner is required.");
    expect(plainMessage({ ...err, code: "PIN_INVALID" })).toBe("At least one active owner is required.");
    expect(plainMessage({ code: "VALIDATION", message: "" })).toBe("Some fields need fixing.");
  });
  it("backendMessage keeps the backend sentence even for WRONG_PIN (QA-3)", () => {
    expect(backendMessage({ code: "WRONG_PIN", message: "That recovery code is not right.", attemptsBeforeLock: 2 })).toBe(
      "That recovery code is not right.",
    );
  });
  it("words for time", () => {
    expect(secondsInWords(30)).toBe("30 seconds");
    expect(secondsInWords(120)).toBe("2 minutes");
  });
  it("finds field messages and dead sessions", () => {
    const err = { code: "VALIDATION" as const, message: "", fields: [{ field: "phone" as const, message: "bad" }] };
    expect(fieldMessage(err, "phone")).toBe("bad");
    expect(fieldMessage(err, "gstin")).toBeUndefined();
    expect(isSessionGone({ code: "SESSION_EXPIRED", message: "" })).toBe(true);
    expect(isSessionGone({ code: "WRONG_PIN", message: "" })).toBe(false);
  });
});

describe("clock", () => {
  it("waits for the next minute boundary", () => {
    expect(msToNextMinute(60_000 * 5 + 15_000)).toBe(45_000);
    expect(msToNextMinute(60_000 * 5)).toBe(60_000);
  });
});

describe("theme.css (design system section 10)", () => {
  // The one allowed mention is the global "turn everything off" reset.
  const cleaned = css.replace(/transition:\s*none;/g, "").replace(/animation:\s*none;/g, "");
  it("has no transition, animation or keyframes", () => {
    expect(cleaned).not.toMatch(/transition/);
    expect(cleaned).not.toMatch(/animation/);
    expect(cleaned).not.toMatch(/@keyframes/);
  });
  it("turns animation off globally", () => {
    expect(css).toMatch(/transition:\s*none/);
    expect(css).toMatch(/scroll-behavior:\s*auto/);
  });
  it("never removes the focus outline without a replacement, and has no text opacity or scale", () => {
    expect(css).not.toMatch(/outline:\s*none/);
    expect(css).not.toMatch(/opacity/);
    expect(css).not.toMatch(/transform/);
    expect(css).not.toMatch(/box-shadow/);
  });
  it("a focused selected row shows every muted cell in the selection text colour (UX Must 1)", () => {
    expect(css).toMatch(/\.gk-list:focus \.gk-list-row\[aria-selected="true"\] \.gk-muted[\s\S]*?color:\s*var\(--gk-select-text\)/);
    expect(css).toMatch(/--gk-select-bg: #003a9b/);
    expect(css).toMatch(/--gk-select-text: #ffffff/);
  });
  it("uses only weights 400 and 600", () => {
    const weights = [...css.matchAll(/font-weight:\s*(\d+)/g)].map((m) => m[1]);
    for (const w of weights) expect(["400", "600"]).toContain(w);
  });
  it("is light theme with the design tokens", () => {
    expect(css).toContain("--gk-text: #111111");
    expect(css).toContain("--gk-focus: #0a4fd1");
    expect(css).toContain("--gk-fs-caption: 0.875rem");
  });
});
