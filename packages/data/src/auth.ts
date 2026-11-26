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

/**
 * The rules for a PIN a person chooses (same as the Rust backend): 4 to 6 digits, not one digit repeated (1111),
 * not a straight run (1234, 4321, 123456). Returns a plain-words problem, or `null` when the PIN is fine.
 */
export function pinRuleProblem(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return 'The PIN must be 4 to 6 digits, numbers only.';
  const d = [...pin].map(Number);
  if (d.every((x) => x === d[0])) return 'That PIN is too easy to guess (the same digit repeated). Choose another.';
  const step = (n: number) => d.every((x, i) => i === 0 || x - d[i - 1] === n);
  if (step(1) || step(-1)) return 'That PIN is too easy to guess (digits in a row, like 1234). Choose another.';
  return null;
}
