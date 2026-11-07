import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useToast } from '@gokul/ui';
import { formatQty, formatRupees, type HardwareSettings } from '@gokul/data';
import { ScanDetector, DEFAULT_SCAN } from './scanDetector';
import { api, useSession } from './store';


/**
 * Barcode scanner support for the whole counter.
 *
 * A USB keyboard-wedge scanner (Retsol) types the code very fast and ends with Enter. `ScanRouter` listens for keys on the
 * whole window (before any field sees them), tells a scan from typing by timing (`ScanDetector`), keeps scanner characters
 * out of every input, and hands the finished code to the screen that is open:
 *  - Billing adds the item (even while a cell is being edited or the type-ahead is open),
 *  - Returns and Sales find the bill by its number,
 *  - any other screen shows the item's info.
 * Typing by hand behaves exactly as before: held characters are given back to the field after a few milliseconds.
 */

let hardware: HardwareSettings = { scanGapMs: DEFAULT_SCAN.gapMs, scanMinLen: DEFAULT_SCAN.minLen, scanBeep: true };
export const scannerSettings = () => hardware;

/* ---------- sound ---------- */
let audio: AudioContext | null = null;
/** A short falling two-tone beep: "that code is not known". */
export function beepError() {
  if (!hardware.scanBeep) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.setValueAtTime(330, t + 0.1);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.24);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  } catch {
    /* no sound device: the toast still tells the cashier */
  }
}

/* ---------- screens take scans ---------- */
type ScanHandler = (code: string) => void;
const handlers: { id: number; fn: { current: ScanHandler } }[] = [];
let nextId = 1;

/** A screen calls this to receive scanned codes while it is open. The newest screen wins. */
export function useScanHandler(fn: ScanHandler) {
  const ref = useRef<ScanHandler>(fn);
  ref.current = fn;
  useEffect(() => {
    const id = nextId++;
    handlers.push({ id, fn: ref });
    return () => {
      const i = handlers.findIndex((h) => h.id === id);
      if (i >= 0) handlers.splice(i, 1);
    };
  }, []);
}

/* ---------- putting held characters back ---------- */
function isEditable(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return !el.readOnly && !el.disabled && !['checkbox', 'radio', 'button', 'submit', 'range', 'file'].includes(el.type);
  return false;
}

let replaying = false;

function insertInto(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  el.focus();
  if (document.execCommand?.('insertText', false, text)) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, el.value.slice(0, start) + text + el.value.slice(end));
  try { el.setSelectionRange(start + text.length, start + text.length); } catch { /* number inputs have no selection */ }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Text that was held back but was only typing. Each character is first offered to the screen as an ordinary key press (so
 * hotkeys such as + and - still work), and if nothing used it, typed into the field that has focus (or the scan box).
 */
function giveBack(text: string) {
  for (const key of text) {
    const target = document.activeElement ?? document.body;
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    replaying = true;
    try { target.dispatchEvent(ev); } finally { replaying = false; }
    if (ev.defaultPrevented) continue;
    const now = document.activeElement;
    if (isEditable(now)) { insertInto(now, key); continue; }
    const box = document.querySelector<HTMLInputElement>('[data-scan-input]');
    if (box) insertInto(box, key);
  }
}

/* ---------- the listener ---------- */
const NO_SCAN_ROUTES = ['/login', '/lock'];

export function ScanRouter() {
  const user = useSession((s) => s.user);
  const loc = useLocation();
  const toast = useToast();
  const route = useRef(loc.pathname);
  route.current = loc.pathname;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const det = useRef(new ScanDetector());
  const timer = useRef<number | undefined>(undefined);
  const signedIn = !!user;

  // scanner settings from Gokul Office, Settings, Printers
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    const load = () => {
      api.getHardware().then((h) => {
        if (!alive) return;
        hardware = h;
        det.current.cfg = { gapMs: h.scanGapMs, minLen: h.scanMinLen };
      }).catch(() => undefined);
    };
    load();
    window.addEventListener('focus', load);
    return () => { alive = false; window.removeEventListener('focus', load); };
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    const d = det.current;
    const stopTimer = () => { if (timer.current !== undefined) { window.clearTimeout(timer.current); timer.current = undefined; } };
    const armTimer = () => {
      stopTimer();
      if (!d.holding) return;
      timer.current = window.setTimeout(() => { timer.current = undefined; giveBack(d.flush()); }, d.holdMs);
    };

    const onScan = (code: string) => {
      const top = handlers[handlers.length - 1];
      if (top) { top.fn.current(code); return; }
      showItemInfo(code, toastRef.current);
    };

    const onKey = (e: KeyboardEvent) => {
      if (replaying || e.isComposing) return;
      if (NO_SCAN_ROUTES.some((r) => route.current.startsWith(r))) return;
      // Shift and Caps Lock arrive between the characters of a scanner that types capitals: they are not a break
      if (e.key === 'Shift' || e.key === 'CapsLock' || e.key === 'AltGraph') return;
      const plain = e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && !e.repeat;
      const key = plain ? e.key : e.key === 'Enter' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey ? 'Enter' : 'Other';
      const step = d.key(key, e.timeStamp);
      if (step.swallow) { e.preventDefault(); e.stopImmediatePropagation(); }
      if (step.release) giveBack(step.release);
      if (step.scan) onScan(step.scan);
      armTimer();
    };
    // capture on window: before any field, grid cell or dialog sees the key
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      stopTimer();
      giveBack(d.reset());
    };
  }, [signedIn]);

  // a screen change drops anything half-scanned
  useEffect(() => { det.current.reset(); }, [loc.pathname]);
  return null;
}

/** Scan on a screen that does not take scans: show what the item is. */
function showItemInfo(code: string, toast: ReturnType<typeof useToast>) {
  api.findItemByCode(code).then((item) => {
    if (!item) {
      beepError();
      toast.show({ tone: 'error', title: `Not found: ${code}`, detail: 'No item or bill has this code.' });
      return;
    }
    const unit = item.loose ? (item.unit === 'l' ? ' L' : ' kg') : '';
    const left = item.stock <= 0 ? 'no stock' : `stock ${formatQty(item.stock, item.loose)}${unit}`;
    toast.show({
      tone: 'info', title: item.name,
      detail: `${formatRupees(item.price, { decimals: false })}${item.loose ? ' per' + unit : ''} - code ${item.code} - ${left}`,
      duration: 6000,
    });
  }, () => { beepError(); toast.show({ tone: 'error', title: `Could not look up ${code}` }); });
}
