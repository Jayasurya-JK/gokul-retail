import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { cn } from '../cn';
import { Kbd } from '../components/Display';

const KEYBAR_STORE = 'gokul-pos-keybar';
const KEYBAR_EVENT = 'gokul-keybar-change';
const readKeyBar = () => { try { return localStorage.getItem(KEYBAR_STORE) === '1'; } catch { return false; } };

/** Where the setting really lives: the backend keeps it per counter. localStorage stays as the fallback (browser preview, signed out). */
export interface KeyBarBackend { get: () => Promise<string | null>; set: (v: string) => Promise<void> }
let keyBarBackend: KeyBarBackend | null = null;
export function configureKeyBar(b: KeyBarBackend) { keyBarBackend = b; }
/** Reads the counter's saved choice from the backend (call after sign-in). */
export async function reloadKeyBar() {
  try {
    const v = await keyBarBackend?.get();
    if (v === '1' || v === '0') {
      try { localStorage.setItem(KEYBAR_STORE, v); } catch { /* storage unavailable */ }
      window.dispatchEvent(new Event(KEYBAR_EVENT));
    }
  } catch { /* signed out or no backend: keep the local value */ }
}

/** Per-counter "Show key bar" setting (off by default). */
export function useKeyBar(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readKeyBar);
  useEffect(() => {
    const h = () => setOn(readKeyBar());
    window.addEventListener(KEYBAR_EVENT, h);
    return () => window.removeEventListener(KEYBAR_EVENT, h);
  }, []);
  const set = (v: boolean) => {
    try { localStorage.setItem(KEYBAR_STORE, v ? '1' : '0'); } catch { /* storage unavailable */ }
    setOn(v);
    window.dispatchEvent(new Event(KEYBAR_EVENT));
    void keyBarBackend?.set(v ? '1' : '0').catch(() => undefined);
  };
  return [on, set];
}

export interface FKey { key: string; label: string; onClick?: () => void; tone?: 'default' | 'primary' | 'danger'; disabled?: boolean }

export function FKeyBar({ keys }: { keys: FKey[] }) {
  return (
    <div className="flex h-10 shrink-0 items-stretch border-t border-line bg-surface">
      {keys.map((k, i) => (
        <button
          key={k.key}
          onClick={k.onClick}
          tabIndex={-1}
          disabled={k.disabled}
          className={cn(
            'group flex min-w-0 flex-1 items-center justify-center gap-2 px-1 text-sm font-medium transition-colors disabled:opacity-40',
            i > 0 && 'border-l border-line',
            k.tone === 'primary' ? 'bg-primary text-primary-fg hover:bg-primary-hover' : 'text-ink hover:bg-surface-3',
            k.tone === 'danger' && 'text-danger',
          )}
        >
          <Kbd tone={k.tone === 'primary' ? 'inverse' : 'default'}>{k.key}</Kbd>
          <span className="truncate">{k.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Billing-counter shell. Fills the window: top bar, work area (main + right panel),
 * and an optional F-key bar at the bottom (off unless the counter turns on "Show key bar"). Nothing here ever scrolls the page.
 */
/** The app puts its status bar (user, counter, today's sales ...) here once; every PosLayout screen shows it at the bottom. */
export const PosStatusContext = createContext<ReactNode>(null);

export function PosLayout({ topBar, side, keys, children, sideWidth }: {
  topBar: ReactNode; side?: ReactNode; keys: FKey[]; children: ReactNode; sideWidth?: number;
}) {
  const [showKeys] = useKeyBar();
  const status = useContext(PosStatusContext);
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-bg text-ink">
      <header className="flex h-16 shrink-0 items-center gap-1 bg-chrome px-3 text-chrome-ink shadow-[0_1px_0_rgb(0_0_0/0.25)]">{topBar}</header>
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
        {side && (
          <aside
            className="flex shrink-0 flex-col border-l border-line bg-surface"
            style={{ width: sideWidth ?? 'clamp(360px, 30vw, 440px)' }}
          >
            {side}
          </aside>
        )}
      </div>
      {showKeys && <FKeyBar keys={keys} />}
      {status}
    </div>
  );
}
