import { useEffect, useRef } from 'react';

/**
 * POS and Office are separate programs on ONE database, so what a screen shows can go stale while the other app works.
 * This runs `reload` whenever the window comes back to the front (focus or tab shown) and, unless `f5: false`, on F5.
 * Keep `reload` silent and cheap: it must not touch what the user is typing. Never cache anything between calls.
 */
export function useRefreshOnFocus(reload: () => void, opts: { f5?: boolean; minGapMs?: number } = {}) {
  const fn = useRef(reload);
  fn.current = reload;
  const f5 = opts.f5 ?? true;
  const gap = opts.minGapMs ?? 1500;
  useEffect(() => {
    let last = Date.now();
    const run = () => {
      const now = Date.now();
      if (now - last < gap) return;
      last = now;
      try { fn.current(); } catch { /* a failed refresh keeps the old data on screen */ }
    };
    const onVis = () => { if (document.visibilityState === 'visible') run(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F5' || e.shiftKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      e.preventDefault(); // the webview would reload the whole page
      last = Date.now();
      try { fn.current(); } catch { /* keep the old data */ }
    };
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', onVis);
    if (f5) window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', onVis);
      if (f5) window.removeEventListener('keydown', onKey);
    };
  }, [f5, gap]);
}
