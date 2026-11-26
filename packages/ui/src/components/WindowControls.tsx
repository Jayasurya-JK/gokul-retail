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

/** The POS passes this so a bill in progress is never lost when the window is closed from its top-bar button. */
export interface CloseGuard {
  /** Items in bills that are not saved or held yet (0 means nothing to protect). */
  pendingItems(): number;
  /** Parks every bill in progress as a held bill. Throw if it fails: the window then stays open. */
  holdAll(): Promise<void>;
}

interface WindowControls {
  available: boolean; fullscreen: boolean; toggleFullscreen: () => void; minimize: () => void;
  /** Close with the same bill protection as the top-bar Close button. */
  requestClose: () => void;
}

const Ctx = createContext<WindowControls>({ available: false, fullscreen: false, toggleFullscreen: () => undefined, minimize: () => undefined, requestClose: () => undefined });

/**
 * Full screen, minimize and close for the desktop window. Shift+F11 toggles full screen from anywhere (Esc is left alone, the POS uses it).
 * The apps start full screen. Minimize and Close are the permanent <WindowButtons /> at the right end of each top bar.
 */
export function WindowControlsProvider({ controller, closeGuard, children }: { controller: WindowController; closeGuard?: CloseGuard; children: ReactNode }) {
  const [fullscreen, setFs] = useState(false);
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
      wantFs.current = next; setFs(next);
    });
  }, [controller, run]);
  const minimize = useCallback(() => { if (controller.available) void run(() => controller.minimize()); }, [controller, run]);

  const doClose = useCallback(() => { void controller.close().catch(() => undefined); }, [controller]);
  const requestClose = useCallback(() => {
    if (!controller.available) return;
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

  const closeAfterHold = async () => {
    setClosing(true);
    try { await closeGuard?.holdAll(); setConfirmItems(0); doClose(); } catch { /* bill stays open: nothing lost */ } finally { setClosing(false); }
  };

  const value = useMemo(() => ({ available: controller.available, fullscreen, toggleFullscreen, minimize, requestClose }), [controller.available, fullscreen, toggleFullscreen, minimize, requestClose]);
  return (
    <Ctx.Provider value={value}>
      {children}
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

/** Minimize and Close as two small square icon buttons, always visible at the right end of a top bar (POSBean style). Quiet on the green bar; Close turns red on hover. In the browser preview they do nothing. */
export function WindowButtons() {
  const win = useWindowControls();
  const box = 'flex h-8 w-9 shrink-0 items-center justify-center rounded-md text-chrome-ink transition-colors';
  return (
    <div className="ml-1 flex shrink-0 items-center gap-0.5">
      <button type="button" tabIndex={-1} onClick={win.minimize} aria-label="Minimize" title="Minimize" className={`${box} hover:bg-white/15`}><Minus size={16} /></button>
      <button type="button" tabIndex={-1} onClick={win.requestClose} aria-label="Close" title="Close" className={`${box} hover:bg-danger hover:text-white`}><X size={16} /></button>
    </div>
  );
}
