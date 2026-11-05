import { createFakeBackend, PREVIEW_MOCK_MARKER, type Scenario } from "@gokul/ui/mock";
import type * as RealApi from "./api";

// PREVIEW ONLY. vite swaps this file in for ./api.ts in mode "preview-mock" (npm run preview:office).
// It is never part of a production build: see tools/previewMockPlugin.ts and the bundle checks.
// Scenario: add ?scenario=fresh to the URL for a first-run shop; default is a ready shop.
// State lives in this tab's memory and resets on reload.
export const previewMockMarker = PREVIEW_MOCK_MARKER;

const scenario: Scenario = new URLSearchParams(window.location.search).get("scenario") === "fresh" ? "fresh" : "ready";
const fake = createFakeBackend({ kind: "office", scenario });
const ok = <T,>(f: () => T): Promise<T> =>
  new Promise((resolve, reject) => {
    try {
      resolve(f());
    } catch (e) {
      reject(e);
    }
  });

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
  setupOwner: (shopName: string, ownerName: string, pin: string) => ok(() => fake.setupOwner(shopName, ownerName, pin)),
  recoverOwnerPin: (recoveryCode: string, newPin: string) => ok(() => fake.recoverOwnerPin(recoveryCode, newPin)),
  saveShopSettings: (settings: Parameters<typeof RealApi.saveShopSettings>[0]) => ok(() => fake.saveShopSettings(settings)),
  openScreen: (screen: Parameters<typeof RealApi.openScreen>[0]) => ok(() => fake.openScreen(screen)),
  listUsers: () => ok(() => fake.listUsers()),
  createUser: (name: string, pin: string) => ok(() => fake.createUser(name, pin)),
  resetPin: (userId: number, newPin: string) => ok(() => fake.resetPin(userId, newPin)),
  unlockUser: (userId: number) => ok(() => fake.unlockUser(userId)),
  deactivateUser: (userId: number) => ok(() => fake.deactivateUser(userId)),
  onCloseRequested: (handler: () => void): Promise<() => void> => {
    void handler; // a browser tab has no app window to intercept
    return Promise.resolve(() => undefined);
  },
  closeWindow: (): Promise<void> => Promise.resolve(),
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
  setupOwner,
  recoverOwnerPin,
  saveShopSettings,
  openScreen,
  listUsers,
  createUser,
  resetPin,
  unlockUser,
  deactivateUser,
  onCloseRequested,
  closeWindow,
} = api;
