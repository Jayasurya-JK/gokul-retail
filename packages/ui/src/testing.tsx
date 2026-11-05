// Test helpers shared by the UI tests of both apps (no extra test library needed).
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import type { AppError, ErrorCode } from "./api-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  host: HTMLElement;
  root: Root;
  unmount: () => Promise<void>;
}

const mounted: Mounted[] = [];

export async function mount(ui: ReactElement): Promise<Mounted> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(ui);
  });
  const m: Mounted = {
    host,
    root,
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
  mounted.push(m);
  return m;
}

export async function unmountAll(): Promise<void> {
  while (mounted.length > 0) {
    const m = mounted.pop();
    if (m) await m.unmount();
  }
  document.body.innerHTML = "";
}

/** Let pending promises and 0 ms timers finish. */
export async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
      else await new Promise<void>((r) => setTimeout(r, 0));
    });
  }
}

export interface PressOptions {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** Dispatch on this element instead of the focused one. */
  target?: Element;
}

function codeFor(key: string): string {
  if (/^[a-zA-Z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (/^\d$/.test(key)) return `Digit${key}`;
  return key === "Escape" ? "Escape" : key;
}

const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

function setInputValue(el: HTMLInputElement, value: string): void {
  nativeValue?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Press one key on the focused element. Returns the keydown event (check `defaultPrevented`). */
export async function press(key: string, opts: PressOptions = {}): Promise<KeyboardEvent> {
  const target = opts.target ?? document.activeElement ?? document.body;
  const ev = new KeyboardEvent("keydown", {
    key,
    code: codeFor(key),
    ctrlKey: opts.ctrl ?? false,
    altKey: opts.alt ?? false,
    shiftKey: opts.shift ?? false,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    target.dispatchEvent(ev);
    if (!ev.defaultPrevented && target instanceof HTMLInputElement && !opts.ctrl && !opts.alt) {
      if (key.length === 1) setInputValue(target, target.value + key);
      else if (key === "Backspace") setInputValue(target, target.value.slice(0, -1));
    }
    target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
  });
  return ev;
}

/** Type text one key at a time, like a keyboard (a scanner is just this, very fast). */
export async function typeText(text: string, opts: { settle?: boolean } = {}): Promise<void> {
  for (const ch of text) await press(ch);
  // A person pauses between fields; without this the scanner-burst guard would see two fields as one scan.
  if (opts.settle !== false) {
    await act(async () => {
      if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(40);
      else await new Promise<void>((r) => setTimeout(r, 40));
    });
  }
}

/** Text of the whole page. */
export function pageText(): string {
  return document.body.textContent ?? "";
}

export function activeLabel(): string {
  const el = document.activeElement;
  if (!el) return "(none)";
  return `${el.tagName.toLowerCase()}${el.getAttribute("name") ? `[${el.getAttribute("name")}]` : ""}${
    el.getAttribute("aria-label") ? `{${el.getAttribute("aria-label")}}` : ""
  }`;
}

/** Build the object Rust would reject with. */
export function appError(code: ErrorCode, message = "", extra: Partial<AppError> = {}): AppError {
  return { code, message, ...extra };
}
