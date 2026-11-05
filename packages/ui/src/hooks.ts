import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";

/** Always holds the newest value, for use inside event handlers and timers (updated after render). */
export function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Next minute boundary. Exported for tests. */
export function msToNextMinute(now: number): number {
  return 60_000 - (now % 60_000);
}

/**
 * Current time, re-rendered once a minute at the minute boundary (one setTimeout,
 * no setInterval, no seconds). Only the component using the hook re-renders.
 */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (): void => {
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msToNextMinute(Date.now()) + 20);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

function isBodyLike(el: Element | null): boolean {
  return el === null || el === document.body || el === document.documentElement;
}

/**
 * Focus is never left on <body>. If focus is lost (click on blank area, element removed,
 * window comes back after Alt+Tab), put it back on the last focused element, or on the
 * screen's initial target.
 */
export function useFocusGuard(fallback: () => HTMLElement | null): void {
  const fallbackRef = useLatest(fallback);
  useEffect(() => {
    let last: HTMLElement | null = null;
    const onFocusIn = (e: FocusEvent): void => {
      const t = e.target;
      if (t instanceof HTMLElement && !isBodyLike(t)) last = t;
    };
    const restore = (): void => {
      if (!isBodyLike(document.activeElement)) return;
      if (last !== null && last.isConnected && last.closest("[inert]") === null) {
        last.focus();
        if (!isBodyLike(document.activeElement)) return;
      }
      fallbackRef.current()?.focus();
    };
    const later = (): void => {
      setTimeout(restore, 0);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", later);
    window.addEventListener("focus", later);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", later);
      window.removeEventListener("focus", later);
    };
  }, [fallbackRef]);
}

/** Focus the element when the screen appears. Every screen declares one initial target. */
export function useInitialFocus(getTarget: () => HTMLElement | null, deps: readonly unknown[] = []): void {
  const getRef = useLatest(getTarget);
  useEffect(() => {
    getRef.current()?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Tells Rust the user is still there. Called at most every 30 s, and only while keys are
 * being pressed (no timer, no polling).
 */
export function useHeartbeat(send: () => void, minGapMs = 30_000): void {
  const sendRef = useLatest(send);
  useEffect(() => {
    let lastSent = 0;
    const onKey = (): void => {
      const now = Date.now();
      if (now - lastSent >= minGapMs) {
        lastSent = now;
        sendRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [minGapMs, sendRef]);
}

/**
 * Calls onIdle after `ms` without a key press or mouse click. One re-armed setTimeout,
 * not a polling loop. `ms <= 0` switches it off.
 */
export function useIdleTimer(ms: number, onIdle: () => void, enabled = true): void {
  const onIdleRef = useLatest(onIdle);
  useEffect(() => {
    if (!enabled || ms <= 0) return;
    let last = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const arm = (delay: number): void => {
      timer = setTimeout(() => {
        const remaining = ms - (Date.now() - last);
        if (remaining <= 0) onIdleRef.current();
        else arm(remaining);
      }, delay);
    };
    const touch = (): void => {
      last = Date.now();
    };
    arm(ms);
    window.addEventListener("keydown", touch, true);
    window.addEventListener("mousedown", touch, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", touch, true);
      window.removeEventListener("mousedown", touch, true);
    };
  }, [ms, enabled, onIdleRef]);
}

/** True only after `active` has been true for `ms` (loading text appears only if slow, so fast loads do not flicker). */
export function useDelayedFlag(active: boolean, ms = 300): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setShown(true), ms);
    return () => {
      clearTimeout(t);
      setShown(false);
    };
  }, [active, ms]);
  return active && shown;
}

/**
 * Counts down from `seconds` (every second under 2 minutes, otherwise every 30 s) and returns
 * the seconds left. Give the component a `key` that changes when a new lock starts.
 */
export function useCountdown(seconds: number): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const endAt = Date.now() + seconds * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const tick = (): void => {
      const l = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setLeft(l);
      if (l > 0) timer = setTimeout(tick, l <= 120 ? 1000 : 30_000);
    };
    timer = setTimeout(tick, seconds <= 120 ? 1000 : 30_000);
    return () => clearTimeout(timer);
  }, [seconds]);
  return left;
}

export interface ScreenLock {
  locked: { at: Date } | null;
  /** Lock now (Ctrl+L, idle, or the session ended). The screen underneath stays mounted. */
  lock: () => void;
  /** Unlocked: put focus back where it was. */
  release: () => void;
}

/**
 * Lock-screen state. Locking tells Rust (which clears the session) but the UI keeps all its
 * in-memory state; unlocking is a normal `login` for the same user.
 */
export function useScreenLock(lockSession: () => Promise<void>, fallbackFocus: () => HTMLElement | null): ScreenLock {
  const [locked, setLocked] = useState<{ at: Date } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const lockedRef = useLatest(locked);
  const lockSessionRef = useLatest(lockSession);
  const fallbackRef = useLatest(fallbackFocus);

  const lock = useCallback(() => {
    if (lockedRef.current !== null) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setLocked({ at: new Date() });
    lockSessionRef.current().catch(() => {
      // The screen is locked either way; Rust has no session if this failed because it was already gone.
    });
  }, [lockedRef, lockSessionRef]);

  const release = useCallback(() => {
    setLocked(null);
    setTimeout(() => {
      const el = opener.current;
      if (el && el.isConnected && !isBodyLike(el)) el.focus();
      else fallbackRef.current()?.focus();
    }, 0);
  }, [fallbackRef]);

  return { locked, lock, release };
}
