/**
 * Office logs out after 10 minutes without a key press (spec: idle_lock_secs_office default 600).
 * Rust enforces it too; this only hides the screen on time. The contract does not expose the
 * setting yet, so the default is repeated here.
 */
export const OFFICE_IDLE_MS = 600_000;

/** Step 5 (backup) switches this on. Until then the status bar says "Backup: not set up yet". */
export const BACKUP_CONFIGURED = false;
