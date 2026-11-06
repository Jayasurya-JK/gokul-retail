import { useEffect, useSyncExternalStore } from 'react';

/** One group of shortcut rows: label and the keys that do it. */
export type KeyRows = [string, string[]][];
export interface ScreenKeys { title: string; rows: KeyRows }

let current: ScreenKeys | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/**
 * A screen calls this once with its own keys (pass a constant). The F1 sheet lists them first, then the global keys,
 * so the sheet always answers "what can I press HERE".
 */
export function useScreenKeys(title: string, rows: KeyRows) {
  useEffect(() => {
    const mine = { title, rows };
    current = mine;
    emit();
    return () => {
      if (current === mine) { current = null; emit(); }
    };
  }, [title, rows]);
}

export function useCurrentScreenKeys(): ScreenKeys | null {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => current,
  );
}
