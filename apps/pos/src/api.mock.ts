import { createFakeBackend, PREVIEW_MOCK_MARKER, type Scenario } from "@gokul/ui/mock";
import type * as RealApi from "./api";

// PREVIEW ONLY. vite swaps this file in for ./api.ts in mode "preview-mock" (npm run preview:pos).
// It is never part of a production build: see tools/previewMockPlugin.ts and the bundle checks.
// Scenario: add ?scenario=fresh to the URL for a shop that is not set up yet (POS then asks the
// owner to open Office); default is a ready shop. State lives in this tab's memory.
export const previewMockMarker = PREVIEW_MOCK_MARKER;

const scenario: Scenario = new URLSearchParams(window.location.search).get("scenario") === "fresh" ? "fresh" : "ready";
const fake = createFakeBackend({ kind: "pos", scenario });
const ok = <T,>(f: () => T): Promise<T> =>
  new Promise((resolve, reject) => {
    try {
      resolve(f());
    } catch (e) {
      reject(e);
    }
  });

let lastUserId: number | null = null;

const api = {
  startupStatus: () => ok(() => fake.startupStatus()),
  listLoginUsers: () => ok(() => fake.listLoginUsers()),
  login: (userId: number, pin: string) => ok(() => fake.login(userId, pin)),
  currentSession: () => ok(() => fake.currentSession()),
  logout: () => ok(() => fake.logout()),
  lockSession: () => ok(() => fake.lockSession()),
  heartbeat: () => ok(() => fake.heartbeat()),
  changePin: (oldPin: string, newPin: string) => ok(() => fake.changePin(oldPin, newPin)),
  getStatusBar: () => ok(() => fake.getStatusBar()),
  getShopSettings: () => ok(() => fake.getShopSettings()),
  onCloseRequested: (handler: () => void): Promise<() => void> => {
    // A browser tab has no app window to intercept. Tests and screenshots call
    // window.__previewClose() to act like Alt+F4 / the window X button.
    const w = window as unknown as { __previewClose?: () => void };
    w.__previewClose = handler;
    return Promise.resolve(() => {
      if (w.__previewClose === handler) delete w.__previewClose; // StrictMode re-registers first
    });
  },
  closeWindow: (): Promise<void> => Promise.resolve(),
  readLastUserId: (): number | null => lastUserId,
  saveLastUserId: (id: number): void => {
    lastUserId = id;
  },
} satisfies typeof RealApi;

export const {
  startupStatus,
  listLoginUsers,
  login,
  currentSession,
  logout,
  lockSession,
  heartbeat,
  changePin,
  getStatusBar,
  getShopSettings,
  onCloseRequested,
  closeWindow,
  readLastUserId,
  saveLastUserId,
} = api;
