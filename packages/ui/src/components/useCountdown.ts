import { useEffect, useState } from 'react';

/** Whole seconds left until `until` (a `Date.now()` time), ticking every 250 ms; 0 when there is nothing to wait for. */
export function useCountdown(until: number | null): number {
  const calc = () => (until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    if (!until) return undefined;
    const t = window.setInterval(() => {
      const n = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setLeft(n);
      if (n === 0) window.clearInterval(t);
    }, 250);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until]);
  return left;
}
