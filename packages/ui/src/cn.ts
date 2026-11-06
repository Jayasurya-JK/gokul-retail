import { useEffect } from 'react';

export type ClassValue = string | false | null | undefined;
export const cn = (...v: ClassValue[]) => v.filter(Boolean).join(' ');

/**
 * Makes the web view behave like a native window: no browser context menu (except in inputs),
 * and browser shortcuts that would break the app (reload, print, find, view-source) are blocked.
 */
export function useDesktopGuards() {
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (k === 'f5' || k === 'f3' || k === 'f7' || k === 'f12' && !e.defaultPrevented) e.preventDefault();
      if (ctrl && ['r', 'p', 'f', 'u', 's', 'g', 'j', 'o'].includes(k)) e.preventDefault();
      if (ctrl && e.shiftKey && ['r', 'i', 'c', 'j'].includes(k)) e.preventDefault();
      if (e.altKey && (k === 'arrowleft' || k === 'arrowright')) e.preventDefault();
    };
    window.addEventListener('contextmenu', onCtx);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);
}
