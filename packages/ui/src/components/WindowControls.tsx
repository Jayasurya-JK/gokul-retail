import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Minus, X } from 'lucide-react';
import { Button } from './Button';
import { Dialog } from './Overlay';

export interface WindowController {
  /** True only inside the installed desktop app. In the browser preview every call is skipped silently. */
  available: boolean;
  isFullscreen(): Promise<boolean>;
  setFullscreen(on: boolean): Promise<void>;
  minimize(): Promise<void>;
  /** Asks the window to close (the same as the title bar cross). */
  close(): Promise<void>;
}

/** The POS passes this so a bill in progress is never lost when the window is closed from the top strip. */
export interface CloseGuard {
  /** Items in bills that are not saved or held yet (0 means nothing to protect). */
  pendingItems(): number;
  /** Parks every bill in progress as a held bill. Throw if it fails: the window then stays open. */
  holdAll(): Promise<void>;
}

interface WindowControls {
  available: boolean; fullscreen: boolean; toggleFullscreen: () => void; minimize: () => void;
  /** Close with the same bill protection as the top strip's Close button. */
  requestClose: () => void;
}

const Ctx = createContext<WindowControls>({ available: false, fullscreen: false, toggleFullscreen: () => undefined, minimize: () => undefined, requestClose: () => undefined });

/** Pointer must sit within this many px of the top edge ... */
const EDGE_PX = 2;
/** ... for this long before the strip shows (a mouse flung past the edge does nothing). */
const EDGE_DWELL_MS = 150;
/** The top strip stays while the pointer is within this height; it hides after the pointer has been away this long. */
const STRIP_ZONE_PX = 44;
const STRIP_HIDE_MS = 350;
const STRIP_TOUCH_HIDE_MS = 4000;

/**
 * Full screen, minimize and close for the desktop window. Shift+F11 toggles full screen from anywhere (Esc is left alone, the POS uses it).
 * The apps start full screen. While full screen, pointer (or a touch) at the top edge slides in a slim strip with
 * Minimize and Close, which hides when the pointer leaves.
 */
export function WindowControlsProvider({ controller, closeGuard, children }: { controller: WindowController; closeGuard?: CloseGuard; children: ReactNode }) {
  const [fullscreen, setFs] = useState(false);
  const [strip, setStrip] = useState(false);
  const [confirmItems, setConfirmItems] = useState(0);
  const [closing, setClosing] = useState(false);

  const wantFs = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const run = useCallback((job: () => Promise<void>) => {
    queue.current = queue.current.then(job).catch(() => undefined);
    return queue.current;
  }, []);

  useEffect(() => {
    void controller.isFullscreen().then((f) => { wantFs.current = f; setFs(f); }).catch(() => undefined);
  }, [controller]);

  const toggleFullscreen = useCallback(() => {
    if (!controller.available) return;
    void run(async () => {
      const next = !wantFs.current;
      await controller.setFullscreen(next);
      wantFs.current = next; setFs(next); setStrip(false);
    });
  }, [controller, run]);
  const minimize = useCallback(() => { if (controller.available) void run(() => controller.minimize()); setStrip(false); }, [controller, run]);

  const doClose = useCallback(() => { void controller.close().catch(() => undefined); }, [controller]);
  const requestClose = useCallback(() => {
    if (!controller.available) return;
    setStrip(false);
    const n = closeGuard?.pendingItems() ?? 0;
    if (n > 0) setConfirmItems(n); else doClose();
  }, [controller, closeGuard, doClose]);

  useEffect(() => {
    if (!controller.available) return undefined; // in a browser Shift+F11 keeps its normal meaning
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F11' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); toggleFullscreen(); }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [controller, toggleFullscreen]);

  /* ---------- top edge: the slim Minimize / Close strip ---------- */
  useEffect(() => {
    if (!controller.available || !fullscreen) return undefined;
    let topTimer: number | undefined;
    let hideTimer: number | undefined;
    const clear = (t: number | undefined) => { if (t !== undefined) window.clearTimeout(t); };

    const onMove = (e: PointerEvent | MouseEvent) => {
      if ('pointerType' in e && e.pointerType !== 'mouse') return; // touch has its own handler below
      const y = e.clientY;
      // Top edge: dwell shows the strip; moving away hides it.
      if (y <= EDGE_PX) {
        clear(hideTimer); hideTimer = undefined;
        if (topTimer === undefined) topTimer = window.setTimeout(() => { topTimer = undefined; setStrip(true); }, EDGE_DWELL_MS);
      } else {
        clear(topTimer); topTimer = undefined;
        if (y > STRIP_ZONE_PX && hideTimer === undefined) hideTimer = window.setTimeout(() => { hideTimer = undefined; setStrip(false); }, STRIP_HIDE_MS);
        else if (y <= STRIP_ZONE_PX) { clear(hideTimer); hideTimer = undefined; }
      }
    };
    const onLeave = () => { clear(topTimer); topTimer = undefined; clear(hideTimer); hideTimer = window.setTimeout(() => { hideTimer = undefined; setStrip(false); }, STRIP_HIDE_MS); };

    // Touch or pen: a tap on the very top edge shows the strip; it hides on its own after a few seconds or a tap elsewhere.
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      if (e.clientY <= 24) { setStrip(true); clear(hideTimer); hideTimer = window.setTimeout(() => { hideTimer = undefined; setStrip(false); }, STRIP_TOUCH_HIDE_MS); }
      else if (e.clientY > STRIP_ZONE_PX) setStrip(false);
    };

    window.addEventListener('pointermove', onMove, true);
    document.addEventListener('mouseleave', onLeave);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('pointerdown', onDown, true);
      clear(topTimer); clear(hideTimer);
    };
  }, [controller, fullscreen, run]);

  // Leaving full screen (or Shift+F11) must never leave the strip behind.
  useEffect(() => { if (!fullscreen) setStrip(false); }, [fullscreen]);

  const closeAfterHold = async () => {
    setClosing(true);
    try { await closeGuard?.holdAll(); setConfirmItems(0); doClose(); } catch { /* bill stays open: nothing lost */ } finally { setClosing(false); }
  };

  const value = useMemo(() => ({ available: controller.available, fullscreen, toggleFullscreen, minimize, requestClose }), [controller.available, fullscreen, toggleFullscreen, minimize, requestClose]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {controller.available && (
        <div
          role="toolbar" aria-label="Window"
          aria-hidden={!strip}
          onPointerEnter={() => setStrip(true)}
          className={`fixed left-1/2 top-0 z-[9999] flex -translate-x-1/2 items-center gap-1 rounded-b-lg bg-chrome px-1.5 py-1 shadow-overlay transition-transform duration-150 ${strip ? 'translate-y-0' : '-translate-y-full pointer-events-none'}`}
        >
          <button type="button" tabIndex={-1} onClick={minimize} aria-label="Minimize" title="Minimize"
            className="flex h-8 w-14 items-center justify-center rounded-md text-chrome-ink hover:bg-white/15"><Minus size={16} /></button>
          <button type="button" tabIndex={-1} onClick={requestClose} aria-label="Close" title="Close"
            className="flex h-8 w-14 items-center justify-center rounded-md text-chrome-ink hover:bg-danger hover:text-white"><X size={16} /></button>
        </div>
      )}
      <Dialog
        open={confirmItems > 0}
        onOpenChange={(o) => { if (!o && !closing) setConfirmItems(0); }}
        title="A bill is still open"
        description={`${confirmItems} ${confirmItems === 1 ? 'item is' : 'items are'} on the counter and not saved yet.`}
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirmItems(0)} disabled={closing}>Keep billing</Button>
            <Button variant="secondary" onClick={() => { setConfirmItems(0); doClose(); }} disabled={closing}>Close anyway</Button>
            <Button data-autofocus onClick={() => void closeAfterHold()} disabled={closing}>Hold bill and close</Button>
          </>
        )}
      >
        <p className="text-sm text-muted">Hold it to bring it back later with Shift+F6, or keep billing.</p>
      </Dialog>
    </Ctx.Provider>
  );
}

export const useWindowControls = () => useContext(Ctx);
