/**
 * Tells a barcode scanner from a person typing, by keystroke timing alone.
 *
 * A USB "keyboard wedge" scanner (Retsol and most others) types the whole code in a few milliseconds and ends with Enter.
 * A person never types two characters less than about 40 ms apart. So: characters that follow each other within `gapMs`,
 * ended by Enter, with at least `minLen` characters, are a scan.
 *
 * The first character cannot be classified until the second one arrives, so the detector HOLDS it (the caller stops the
 * key from reaching the page). If the next key is slow, the held text was typing and `release` hands it back to be
 * inserted where it belongs. Nothing a person types is ever lost, and no scanner character leaks into a field.
 *
 * Pure logic with no DOM, so it can be unit tested (`npm test -w @gokul/pos`).
 */

export interface ScanConfig {
  /** Largest pause between two characters (ms) that still counts as the scanner typing. */
  gapMs: number;
  /** Fewest characters accepted as a scan. */
  minLen: number;
}

export const DEFAULT_SCAN: ScanConfig = { gapMs: 30, minLen: 3 };

/** What the caller must do for this key. */
export interface ScanStep {
  /** Stop the key reaching the page (it is held or part of a scan). */
  swallow: boolean;
  /** Text that turned out to be typing by hand: insert it now, before this key's normal effect. */
  release?: string;
  /** A finished scan. */
  scan?: string;
}

const SWALLOW: ScanStep = { swallow: true };

export class ScanDetector {
  private buf = '';
  private last = 0;
  cfg: ScanConfig;
  constructor(cfg: ScanConfig = DEFAULT_SCAN) {
    this.cfg = cfg;
  }

  /** True while characters are held back (a timer should call `flush` when it runs out). */
  get holding(): boolean {
    return this.buf.length > 0;
  }

  /**
   * One key. `key` is the character for a printable key, 'Enter', or anything else for other keys.
   * `t` is the event time in ms (`KeyboardEvent.timeStamp`).
   */
  key(key: string, t: number): ScanStep {
    if (key.length === 1) {
      if (this.buf === '') {
        this.buf = key;
        this.last = t;
        return SWALLOW;
      }
      if (t - this.last <= this.cfg.gapMs) {
        this.buf += key;
        this.last = t;
        return SWALLOW;
      }
      // too slow: what was held is typing; this key starts a new candidate
      const release = this.buf;
      this.buf = key;
      this.last = t;
      return { swallow: true, release };
    }
    if (key === 'Enter') {
      const code = this.buf;
      const fast = t - this.last <= this.cfg.gapMs;
      this.buf = '';
      if (code.length >= this.cfg.minLen && fast) return { swallow: true, scan: code };
      // a short or slow burst followed by Enter is a person: give the text back, Enter works as usual
      return code ? { swallow: false, release: code } : { swallow: false };
    }
    // any other key (Tab, arrows, F-keys, Ctrl shortcuts, key repeat): held text was typing
    const release = this.buf;
    this.buf = '';
    return release ? { swallow: false, release } : { swallow: false };
  }

  /** The hold timer ran out: whatever is held was typing. Returns the text to insert. */
  flush(): string {
    const r = this.buf;
    this.buf = '';
    return r;
  }

  /** Forget everything (screen change, focus lost). Returns text that was held. */
  reset(): string {
    return this.flush();
  }

  /**
   * How long the caller should wait before `flush`. One held character: just over the gap (a person pauses longer).
   * Several held characters with no Enter yet: a little longer, so a busy screen cannot cut a real scan in half.
   */
  get holdMs(): number {
    return this.buf.length >= 2 ? Math.max(120, this.cfg.gapMs * 3) : this.cfg.gapMs + 15;
  }
}
