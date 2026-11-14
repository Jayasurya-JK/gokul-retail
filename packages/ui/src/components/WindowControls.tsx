import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface WindowController {
  /** True only inside the installed desktop app. In the browser preview every call is skipped silently. */
  available: boolean;
  isFullscreen(): Promise<boolean>;
  setFullscreen(on: boolean): Promise<void>;
  minimize(): Promise<void>;
}

interface WindowControls { available: boolean; fullscreen: boolean; toggleFullscreen: () => void; minimize: () => void }

const Ctx = createContext<WindowControls>({ available: false, fullscreen: false, toggleFullscreen: () => undefined, minimize: () => undefined });

/**
 * Full screen and minimize for the desktop window. Shift+F11 toggles full screen from anywhere (Esc is left alone, the POS uses it).
 * The apps start full screen with no taskbar; the user menu offers the same actions by mouse.
 */
export function WindowControlsProvider({ controller, children }: { controller: WindowController; children: ReactNode }) {
  const [fullscreen, setFs] = useState(false);

  useEffect(() => { void controller.isFullscreen().then(setFs).catch(() => undefined); }, [controller]);

  const toggleFullscreen = useCallback(() => {
    if (!controller.available) return;
    void controller.isFullscreen()
      .then((cur) => controller.setFullscreen(!cur).then(() => setFs(!cur)))
      .catch(() => undefined);
  }, [controller]);
  const minimize = useCallback(() => { if (controller.available) void controller.minimize().catch(() => undefined); }, [controller]);

  useEffect(() => {
    if (!controller.available) return undefined; // in a browser Shift+F11 keeps its normal meaning
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F11' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); toggleFullscreen(); }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [controller, toggleFullscreen]);

  const value = useMemo(() => ({ available: controller.available, fullscreen, toggleFullscreen, minimize }), [controller.available, fullscreen, toggleFullscreen, minimize]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWindowControls = () => useContext(Ctx);
