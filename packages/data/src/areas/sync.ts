/**
 * Cloud backup and sync (docs/CLOUD-DB-AND-SYNC.md). The shop sends its changes to the cloud in the background; billing never waits.
 * The secret is write-only: screens send it when it changes and only ever read `hasSecret` back.
 */
export interface SyncStatus {
  enabled: boolean;
  url: string;
  hasSecret: boolean;
  /** ISO time of the last confirmed upload, or null */
  lastOkAt: string | null;
  /** Plain-English reason of the last failed upload, or null */
  lastError: string | null;
  /** Changes waiting to be sent */
  pending: number;
}

export interface SyncConfigInput {
  enabled: boolean;
  url: string;
  /** Empty or missing keeps the saved secret */
  secret?: string;
}

export interface SyncApi {
  syncStatus(): Promise<SyncStatus>;
  /** Owner or admin only. Turning sync on needs an https address and a secret. */
  syncSetConfig(input: SyncConfigInput): Promise<SyncStatus>;
  /** Sends what is waiting now (a few seconds). */
  syncNow(): Promise<SyncStatus>;
  /** Queues every row of every synced table, then sends. Can take a while on a big shop. */
  syncUploadEverything(): Promise<SyncStatus>;
}

/** Browser-preview twin of crates/core/src/sync.rs. */
export function createSyncMock(): SyncApi {
  let state: { enabled: boolean; url: string; secret: string; lastOkAt: string | null; lastError: string | null; pending: number } = {
    enabled: false, url: '', secret: '', lastOkAt: null, lastError: null, pending: 0,
  };
  const status = (): SyncStatus => ({
    enabled: state.enabled, url: state.url, hasSecret: state.secret !== '', lastOkAt: state.lastOkAt, lastError: state.lastError, pending: state.pending,
  });
  const sendAll = () => {
    if (state.enabled) {
      state.pending = 0;
      state.lastOkAt = new Date().toISOString();
      state.lastError = null;
    }
    return status();
  };
  return {
    syncStatus: async () => status(),
    syncSetConfig: async (input) => {
      const url = input.url.trim();
      const secret = (input.secret ?? '').trim();
      if (input.enabled && !url.startsWith('https://')) throw new Error('The cloud address must start with https://. Copy it from the Supabase function page.');
      if (input.enabled && secret === '' && state.secret === '') throw new Error('Enter the sync secret first. It is only shown once, when it is typed.');
      if (url !== '' && !url.startsWith('https://')) throw new Error('The cloud address must start with https://.');
      state = { ...state, enabled: input.enabled, url, secret: secret !== '' ? secret : state.secret };
      return status();
    },
    syncNow: async () => {
      if (!state.enabled) throw new Error('Turn cloud sync on first.');
      return sendAll();
    },
    syncUploadEverything: async () => {
      if (!state.enabled) throw new Error('Turn cloud sync on first.');
      state.pending = 4120;
      return sendAll();
    },
  };
}
