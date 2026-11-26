import { useEffect, useReducer, useRef, useState } from 'react';

/**
 * Last result of every screen load, kept for the life of this app window (one session).
 * Keys carry the screen's filters, so each filter keeps its own last answer.
 */
const lastResult = new Map<string, unknown>();

/**
 * Stale-while-revalidate for a screen's data.
 * - `data` is the last result for `key` (read synchronously during render), so a screen opened before shows its
 *   old rows on the very first frame instead of an empty state.
 * - `data` is undefined only on the first-ever load of that key: draw the layout and a skeleton, never an empty state.
 * - `load` runs on mount and whenever `key` or `deps` change; its result replaces `data` when it arrives.
 * - A failed load keeps what is shown (report it through `onError`).
 * Nothing waits on this for billing: it is used only by read-only screens.
 */
export function useCachedLoad<T>(
  key: string,
  load: () => Promise<T>,
  deps: readonly unknown[] = [],
  opts: { onLoaded?: (value: T) => void; onError?: (e: unknown) => void } = {},
): { data: T | undefined; loading: boolean } {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [loading, setLoading] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    let live = true;
    setLoading(true);
    loadRef.current()
      .then((value) => {
        lastResult.set(key, value);
        if (!live) return;
        optsRef.current.onLoaded?.(value);
        bump();
      }, (e: unknown) => { if (live) optsRef.current.onError?.(e); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  return { data: lastResult.get(key) as T | undefined, loading };
}
