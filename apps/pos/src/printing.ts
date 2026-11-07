import { useEffect, useState } from 'react';
import type { PrintKind, PrintOptions, PrinterStatus } from '@gokul/data';
import { api } from './store';

type Toaster = { show: (t: { tone: 'success' | 'error' | 'info' | 'warning'; title: string; detail?: string; duration?: number }) => void };

/** Printing never blocks and never throws: the record is already saved, so a problem is only a message. */
export async function printDoc(kind: PrintKind, id: string, opts: PrintOptions = {}): Promise<{ ok: boolean; message: string }> {
  try {
    return await api.printDocument(kind, id, opts);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'the printer could not be reached' };
  }
}

const nice = (m: string) => m.replace(/\.$/, '');

/** Fire and forget after a sale: the next bill can start at once; a failure becomes the "Bill saved. Printing failed" toast. */
export function printBillAfterSave(billId: string, opts: PrintOptions, toast: Toaster) {
  void printDoc('bill', billId, { ...opts, auto: true }).then((r) => {
    if (!r.ok) toast.show({ tone: 'error', title: `Bill saved. Printing failed: ${nice(r.message)}. Press Ctrl+P to reprint.`, duration: 9000 });
  });
}

/** Explicit print (reprint, report, credit note): says what happened either way. */
export async function printWithToast(kind: PrintKind, id: string, opts: PrintOptions, toast: Toaster, okTitle: string) {
  const r = await printDoc(kind, id, opts);
  if (r.ok) toast.show({ tone: 'success', title: okTitle, detail: r.message });
  else toast.show({ tone: 'error', title: `Printing failed: ${nice(r.message)}`, detail: 'Nothing was lost. Fix the printer and print again.', duration: 9000 });
  return r.ok;
}

const OFF: PrinterStatus = { configured: false, ready: false, state: 'none', name: '', mode: 'escpos', message: 'Checking the printer' };

/** The real state of the bill printer (configured and reachable), refreshed every 20 seconds and when the window is focused. */
export function usePrinterStatus(): PrinterStatus {
  const [s, setS] = useState<PrinterStatus>(OFF);
  useEffect(() => {
    let alive = true;
    const load = () => { api.printerStatus().then((x) => alive && setS(x)).catch(() => alive && setS({ ...OFF, state: 'error', message: 'Printer status is not available' })); };
    load();
    const t = window.setInterval(load, 20_000);
    window.addEventListener('focus', load);
    return () => { alive = false; window.clearInterval(t); window.removeEventListener('focus', load); };
  }, []);
  return s;
}
