import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";

/**
 * One keymap per screen, stacked: lock > dialog > screen > app.
 * The same binding list drives the key handler, the key legend and the F1 help,
 * so they can never disagree.
 *
 * Fields (inputs, lists) handle their own keys first and call stopPropagation
 * when they use a key. The keymap listens on window in the bubble phase.
 */

export const LAYER = { app: 0, screen: 1, dialog: 2, lock: 3 } as const;
export type Layer = (typeof LAYER)[keyof typeof LAYER];

export interface Binding {
  /** Key combos such as "F10", "Ctrl+S", "Alt+T", "Esc". The first one is shown in the legend. */
  keys: string[];
  /** Short label for the legend and help, e.g. "Save". */
  label: string;
  /** Missing `run` = hint only (shown in the legend, handled by a field such as a list). */
  run?: (e: KeyboardEvent) => void;
  /** Show in the bottom key legend (default true when there is a label). */
  legend?: boolean;
  /** Never show anywhere (e.g. reserved keys that must do nothing). */
  silent?: boolean;
  /** Binding is active only when this returns true. */
  when?: () => boolean;
}

export interface KeymapOptions {
  layer?: Layer;
  /** A modal keymap stops lower layers from seeing any key. */
  modal?: boolean;
  enabled?: boolean;
}

interface Entry {
  id: number;
  layer: Layer;
  modal: boolean;
  bindings: Binding[];
}

const entries = new Set<Entry>();
let nextId = 1;
let version = 0;
const listeners = new Set<() => void>();
let attached = false;

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const MOD_ORDER = ["Ctrl", "Alt", "Shift"] as const;

function canonKey(key: string): string {
  if (key === "Escape") return "Esc";
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/** "ctrl+s" -> "Ctrl+S". Used for bindings. */
export function canonCombo(combo: string): string {
  const parts = combo.split("+").map((p) => p.trim());
  const key = canonKey(parts[parts.length - 1] ?? "");
  const mods = MOD_ORDER.filter((m) => parts.slice(0, -1).some((p) => p.toLowerCase() === m.toLowerCase()));
  return [...mods, key].join("+");
}

/** Canonical combo for a keyboard event, e.g. "Ctrl+S". */
export function comboOf(e: KeyboardEvent): string {
  let key = e.key;
  // Alt/Ctrl+letter: trust the physical key so odd layouts still work.
  if ((e.altKey || e.ctrlKey) && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey && (key.length > 1 || e.ctrlKey || e.altKey)) mods.push("Shift");
  return [...mods, canonKey(key)].join("+");
}

/** True while an IME (Tamil typing tool) is composing; key handlers must ignore the event. */
export function isComposing(e: KeyboardEvent | React.KeyboardEvent): boolean {
  const native = "nativeEvent" in e ? e.nativeEvent : e;
  return native.isComposing || native.keyCode === 229;
}

function sortedEntries(): Entry[] {
  return [...entries].sort((a, b) => b.layer - a.layer || b.id - a.id);
}

function isActive(b: Binding): boolean {
  return b.when ? b.when() : true;
}

/** Runs the binding for `combo` (top layer first). Returns true if one ran. */
function dispatch(combo: string, e: KeyboardEvent): boolean {
  for (const entry of sortedEntries()) {
    for (const b of entry.bindings) {
      if (!b.run || !isActive(b)) continue;
      if (b.keys.some((k) => canonCombo(k) === combo)) {
        e.preventDefault();
        e.stopPropagation();
        b.run(e);
        return true;
      }
    }
    if (entry.modal) return false;
  }
  return false;
}

function onKeyDown(e: KeyboardEvent): void {
  if (isComposing(e)) return;
  dispatch(comboOf(e), e);
}

/** Mouse click on a legend hint: does exactly what the key does. */
export function pressKey(combo: string): boolean {
  const parts = canonCombo(combo).split("+");
  const key = parts[parts.length - 1] ?? "";
  const e = new KeyboardEvent("keydown", {
    key: key === "Esc" ? "Escape" : key,
    ctrlKey: parts.includes("Ctrl"),
    altKey: parts.includes("Alt"),
    shiftKey: parts.includes("Shift"),
    cancelable: true,
  });
  return dispatch(canonCombo(combo), e);
}

function attach(): void {
  if (attached || typeof window === "undefined") return;
  window.addEventListener("keydown", onKeyDown);
  attached = true;
}

function detachIfEmpty(): void {
  if (!attached || entries.size > 0) return;
  window.removeEventListener("keydown", onKeyDown);
  attached = false;
}

function signature(bindings: Binding[]): string {
  return bindings
    .map((b) => `${b.keys.join("|")}:${b.label}:${b.legend === false ? 0 : 1}:${b.silent ? 1 : 0}:${b.run ? 1 : 0}`)
    .join(";");
}

/** Register a keymap for as long as the component is mounted. */
export function useKeymap(bindings: Binding[], options: KeymapOptions = {}): void {
  const { layer = LAYER.screen, modal = false, enabled = true } = options;
  const entryRef = useRef<Entry | null>(null);
  const sigRef = useRef("");

  // Keep the newest closures in the entry on every render.
  useLayoutEffect(() => {
    if (!enabled) return;
    let entry = entryRef.current;
    if (entry === null) {
      entry = { id: nextId++, layer, modal, bindings };
      entryRef.current = entry;
      entries.add(entry);
      attach();
      sigRef.current = signature(bindings);
      emit();
      return;
    }
    entry.bindings = bindings;
    entry.layer = layer;
    entry.modal = modal;
    const sig = signature(bindings);
    if (sig !== sigRef.current) {
      sigRef.current = sig;
      emit();
    }
  });

  useEffect(() => {
    if (!enabled) return;
    return () => {
      const entry = entryRef.current;
      if (entry !== null) {
        entries.delete(entry);
        entryRef.current = null;
        detachIfEmpty();
        emit();
      }
    };
  }, [enabled]);
}

export interface ActiveBinding {
  keys: string[];
  label: string;
  legend: boolean;
}

/** Bindings the user can use right now (top layers first, stops at a modal layer). */
export function getActiveBindings(): ActiveBinding[] {
  const out: ActiveBinding[] = [];
  const seen = new Set<string>();
  for (const entry of sortedEntries()) {
    for (const b of entry.bindings) {
      if (b.silent || !isActive(b)) continue;
      const id = b.keys.map(canonCombo).join("|") + "/" + b.label;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ keys: b.keys, label: b.label, legend: b.legend !== false });
    }
    if (entry.modal) break;
  }
  return out;
}

/** React hook: the active bindings, updated when keymaps change. */
export function useActiveBindings(): ActiveBinding[] {
  const v = useSyncExternalStore(subscribe, () => version);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getActiveBindings(), [v]);
}

/** Test helper: forget every registered keymap. */
export function resetKeymapsForTests(): void {
  entries.clear();
  detachIfEmpty();
  emit();
}

// ---------------------------------------------------------------------------
// WebView2 browser keys that must never reach the page (reload would kill an open bill).

const BLOCKED = new Set(
  [
    "F5",
    "Ctrl+R",
    "Ctrl+Shift+R",
    "F3",
    "Ctrl+F",
    "Ctrl+G",
    "Ctrl+P",
    "Ctrl+J",
    "Ctrl+U",
    "Ctrl+H",
    "Ctrl+Shift+I",
    "F7",
    "Alt+ArrowLeft",
    "Alt+ArrowRight",
    "BrowserBack",
    "BrowserForward",
    "Ctrl+Shift+P",
    "Ctrl+N",
    "Ctrl+Shift+N",
    "Ctrl+T",
    "Ctrl+W",
    "Ctrl+O",
    "Ctrl+Shift+Delete",
    "F11",
  ].map(canonCombo),
);

/** True for keys the browser would act on. F12 is blocked too, except in dev (devtools). */
export function isBlockedBrowserKey(e: KeyboardEvent, dev: boolean): boolean {
  const combo = comboOf(e);
  if (combo === "F12") return !dev;
  if (e.ctrlKey && !e.altKey && ["+", "=", "-", "_", "0"].includes(e.key)) return true; // zoom
  return BLOCKED.has(combo);
}

/**
 * Install once at app start. Capture phase, so it runs before anything else.
 * Returns a function that removes the handlers (used by tests).
 */
export function installBrowserKeyBlock(options: { dev?: boolean } = {}): () => void {
  const dev = options.dev ?? false;
  const onKey = (e: KeyboardEvent): void => {
    if (isBlockedBrowserKey(e, dev)) e.preventDefault();
  };
  const onWheel = (e: WheelEvent): void => {
    if (e.ctrlKey) e.preventDefault();
  };
  const onContext = (e: Event): void => {
    if (!dev) e.preventDefault();
  };
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("wheel", onWheel, { capture: true, passive: false });
  window.addEventListener("contextmenu", onContext, true);
  return () => {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("wheel", onWheel, true);
    window.removeEventListener("contextmenu", onContext, true);
  };
}

// ---------------------------------------------------------------------------
// Error beep: short WebAudio tone, no audio file.

let audioCtx: AudioContext | null = null;

export function beep(): void {
  try {
    if (typeof AudioContext === "undefined") return;
    audioCtx ??= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch {
    // no audio device: silently ignore, the message on screen is the real signal
  }
}
