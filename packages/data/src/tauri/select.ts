import type { Api } from '../api';
import { mockApi } from '../mockApi';
import { createTauriApi } from './tauriApi';

/** True inside the installed desktop app (Tauri), false in the browser preview (`npm run dev`). */
export const isTauri: boolean = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * The Api every screen should use: the real Rust/SQLite backend inside Tauri, the in-memory mock in the browser.
 * The backend covers the whole Api, so nothing falls back to the mock inside Tauri.
 */
export const api: Api = isTauri ? createTauriApi() : mockApi;
