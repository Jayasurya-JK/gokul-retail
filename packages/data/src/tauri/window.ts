import { isTauri } from './select';

/**
 * The desktop window (Tauri). In the browser preview `available` is false and nothing is called, so a missing
 * window API can never throw. The functions reject quietly inside the app too; callers swallow the error.
 */
const win = async () => (await import('@tauri-apps/api/window')).getCurrentWindow();

export const windowController = {
  available: isTauri,
  isFullscreen: async (): Promise<boolean> => (isTauri ? (await win()).isFullscreen() : false),
  setFullscreen: async (on: boolean): Promise<void> => { if (isTauri) await (await win()).setFullscreen(on); },
  minimize: async (): Promise<void> => { if (isTauri) await (await win()).minimize(); },
  maximize: async (): Promise<void> => { if (isTauri) await (await win()).maximize(); },
  close: async (): Promise<void> => { if (isTauri) await (await win()).close(); },
};
