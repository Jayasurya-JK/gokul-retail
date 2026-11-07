import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';

/** One grid column: a stable id, its default CSS track and the smallest width the user may drag it to. */
export interface ColSpec { id: string; track: string; min: number }

/** Rows of a resizable grid use `gridTemplateColumns: ROW_COLS`; the hook sets `--rc` on the grid root. */
export const ROW_COLS = 'var(--rc)';
const ROW_SELECTOR = '[style*="var(--rc)"]';
const MAX_FIT = 640;
const storeKey = (k: string) => `gokul.cols.${k}`;

function readStore(key: string): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(key)) ?? '{}') as unknown;
    if (v && typeof v === 'object') {
      const out: Record<string, number> = {};
      for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === 'number' && n >= 20 && n <= 2000) out[k] = n;
      return out;
    }
  } catch { /* storage unavailable */ }
  return {};
}
function writeStore(key: string, w: Record<string, number>) {
  try {
    if (Object.keys(w).length === 0) localStorage.removeItem(storeKey(key)); else localStorage.setItem(storeKey(key), JSON.stringify(w));
  } catch { /* storage unavailable */ }
}

/** Smallest width a column may be dragged to, taken from its default track. */
export function minFromTrack(track: string): number {
  const m = /^(?:minmax\()?\s*(\d+(?:\.\d+)?)px/.exec(track.trim());
  const n = m ? Number(m[1]) : 0;
  return Math.max(36, Math.min(n || 60, 72));
}

/** Turns a `gridTemplateColumns` string (px, fr, minmax, repeat) into column specs. */
export function parseTracks(cols: string, ids: string[]): ColSpec[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of cols) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ' ' && depth === 0) { if (cur) parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) parts.push(cur);
  const tracks: string[] = [];
  for (const p of parts) {
    const rep = /^repeat\(\s*(\d+)\s*,\s*(.+)\)$/.exec(p);
    if (rep) for (let i = 0; i < Number(rep[1]); i += 1) tracks.push(rep[2].trim()); else tracks.push(p);
  }
  return tracks.map((track, i) => ({ id: ids[i] ?? String(i), track, min: minFromTrack(track) }));
}

export interface ResizableColumns {
  /** Spread on the element that contains the header row and the data rows. */
  rootProps: { style: CSSProperties; onMouseOver: (e: RMouseEvent) => void; ref: (el: HTMLElement | null) => void };
  /** Spread on the header row so a right click offers Reset columns. */
  headerProps: { onContextMenu: (e: RMouseEvent) => void };
  /** The current `gridTemplateColumns` (also exposed as the `--rc` variable). */
  template: string;
  /** Sum of the narrowest widths, so the scroll area is never narrower than its columns. */
  minTotal: number;
  start: (i: number, e: RPointerEvent<HTMLElement>) => void;
  fit: (i: number) => void;
  reset: () => void;
  customised: boolean;
  menu: ReactNode;
}

/**
 * Drag-to-resize columns for the CSS-grid tables. Widths are remembered per `key` (screen) and column id.
 * Rows should use `gridTemplateColumns: ROW_COLS`.
 */
export function useResizableColumns(key: string, specs: ColSpec[]): ResizableColumns {
  const [widths, setWidths] = useState<Record<string, number>>(() => readStore(key));
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const rootEl = useRef<HTMLElement | null>(null);
  const ids = specs.map((s) => `${s.id}:${s.track}`).join('|');
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const specsRef = useRef(specs);
  specsRef.current = specs;

  useEffect(() => { setWidths(readStore(key)); }, [key]);

  const trackOf = (s: ColSpec, w: Record<string, number>) => (w[s.id] ? `${w[s.id]}px` : s.track);
  const template = useMemo(() => specsRef.current.map((s) => trackOf(s, widths)).join(' '), [ids, widths]); // eslint-disable-line react-hooks/exhaustive-deps
  const minTotal = specs.reduce((n, s) => n + (widths[s.id] ?? s.min), 0);

  const commit = useCallback((next: Record<string, number>) => { setWidths(next); widthsRef.current = next; writeStore(key, next); }, [key]);

  const start = useCallback((i: number, e: RPointerEvent<HTMLElement>) => {
    const spec = specsRef.current[i];
    const cell = e.currentTarget.parentElement;
    if (!spec || !cell || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const w0 = cell.getBoundingClientRect().width;
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = 'col-resize';
    let last = widthsRef.current;
    const move = (ev: PointerEvent) => {
      const w = Math.round(Math.min(2000, Math.max(spec.min, w0 + ev.clientX - x0)));
      last = { ...widthsRef.current, [spec.id]: w };
      setWidths(last);
      widthsRef.current = last;
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.style.cursor = prevCursor;
      commit(last);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }, [commit]);

  /** Auto-fit: let this one column size to its widest content in every rendered row. */
  const fit = useCallback((i: number) => {
    const root = rootEl.current;
    const spec = specsRef.current[i];
    if (!root || !spec) return;
    const probe = specsRef.current.map((s, k) => (k === i ? 'max-content' : trackOf(s, widthsRef.current))).join(' ');
    const prev = root.style.getPropertyValue('--rc');
    root.style.setProperty('--rc', probe);
    let best = 0;
    root.querySelectorAll<HTMLElement>(ROW_SELECTOR).forEach((row) => {
      const c = row.children[i] as HTMLElement | undefined;
      if (c) best = Math.max(best, c.getBoundingClientRect().width);
    });
    root.style.setProperty('--rc', prev);
    if (best > 0) commit({ ...widthsRef.current, [spec.id]: Math.round(Math.min(MAX_FIT, Math.max(spec.min, best + 2))) });
  }, [commit]);

  const reset = useCallback(() => commit({}), [commit]);

  // Narrow cells that cut their text show the full value as a tooltip.
  const onMouseOver = useCallback((e: RMouseEvent) => {
    let el = e.target as HTMLElement | null;
    while (el && !(el.parentElement && el.parentElement.matches(ROW_SELECTOR))) el = el.parentElement;
    if (!el) return;
    const inner = el.firstElementChild instanceof HTMLElement ? el.firstElementChild : null;
    const cut = el.scrollWidth > el.clientWidth + 1 || (inner !== null && inner.scrollWidth > inner.clientWidth + 1);
    if (cut && el.textContent) el.title = el.textContent.trim();
    else if (el.title && el.title === el.textContent?.trim()) el.removeAttribute('title');
  }, []);

  const onContextMenu = useCallback((e: RMouseEvent) => { e.preventDefault(); e.stopPropagation(); setMenuAt({ x: e.clientX, y: e.clientY }); }, []);

  useEffect(() => {
    if (!menuAt) return undefined;
    const close = () => setMenuAt(null);
    const away = (ev: Event) => { if (!(ev.target instanceof Element && ev.target.closest('[data-col-menu]'))) close(); };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('blur', close); window.removeEventListener('keydown', onKey, true); };
  }, [menuAt]);

  const customised = Object.keys(widths).length > 0;
  const menu = menuAt ? (
    <div
      role="menu" data-col-menu="" onPointerDown={(e) => e.stopPropagation()}
      className="fixed z-[200] min-w-[170px] rounded-lg border border-line-strong bg-surface p-1 text-sm shadow-lg"
      style={{ left: Math.min(menuAt.x, window.innerWidth - 190), top: Math.min(menuAt.y, window.innerHeight - 50) }}
    >
      <button
        role="menuitem" type="button" tabIndex={-1} onClick={() => { reset(); setMenuAt(null); }}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-ink hover:bg-surface-2"
      >
        <RotateCcw size={14} className="text-muted" />Reset columns
      </button>
    </div>
  ) : null;

  return {
    rootProps: { style: { ['--rc' as string]: template } as CSSProperties, onMouseOver, ref: (el) => { rootEl.current = el; } },
    headerProps: { onContextMenu },
    template, minTotal, start, fit, reset, customised, menu,
  };
}

/** The drag handle at the right edge of a header cell. The cell must be `relative`. Double click auto-fits. */
export function ColResizer({ rc, index }: { rc: ResizableColumns; index: number }) {
  return (
    <span
      role="separator" aria-orientation="vertical" aria-label="Resize column"
      onPointerDown={(e) => rc.start(index, e)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => { e.stopPropagation(); rc.fit(index); }}
      className="group/rs absolute right-0 top-0 z-[1] flex h-full w-2.5 cursor-col-resize touch-none select-none items-stretch justify-center"
    >
      <span className="my-1.5 w-px rounded-full bg-line-strong opacity-30 transition-opacity group-hover/rs:bg-primary group-hover/rs:opacity-100" />
    </span>
  );
}
