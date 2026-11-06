/** Helpers for the sign-in and approval answers the Rust backend gives (plain-English messages). */

/** Seconds left when the message says the user is locked ("... locked for 42 s."), else `null`. */
export function lockedSeconds(message: string): number | null {
  const m = /locked for (\d+) s/i.exec(message);
  return m ? Number(m[1]) : null;
}

/** True when the backend refused the action only because it needs a manager or owner PIN ("A manager PIN is needed to ..."). */
export function needsManagerPin(message: string): boolean {
  return /manager PIN is needed/i.test(message);
}

/** "0:42" style countdown. */
export function countdownText(secs: number): string {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
