import { useEffect } from 'react';
import { ArrowRight, Printer } from 'lucide-react';
import { formatQty, isDecimalUnit, type CreditNote, type Settings } from '@gokul/data';
import { Badge, Button, Dialog, Money, ReceiptPreview } from '@gokul/ui';
import { dateTimeOf, noteReceipt, refundLabel } from './helpers';

/** Credit note: summary on the left, the 80mm paper on the right. */
export function CreditNoteDialog({ open, note, settings, onClose, onPrint, primary }: {
  open: boolean; note: CreditNote | null; settings: Settings; onClose: () => void; onPrint: () => void;
  /** Extra primary action shown after a return, e.g. "Continue to new bill" */
  primary?: { label: string; onClick: () => void };
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); onPrint(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onPrint]);
  if (!note) return null;
  const t = note.totals;
  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="lg" title={`Credit note ${note.number}`}
      description={`Against bill ${note.billNumber} - ${dateTimeOf(note.at)}`}
      bodyClassName="p-0"
      footer={<>
        <Button onClick={onClose} kbd="Esc">Close</Button>
        <Button icon={<Printer size={15} />} onClick={onPrint} kbd="Ctrl+P" variant={primary ? 'secondary' : 'primary'}>Print credit note</Button>
        {primary && <Button variant="primary" data-autofocus icon={<ArrowRight size={15} />} onClick={primary.onClick} kbd="Enter">{primary.label}</Button>}
      </>}
    >
      <div className="grid max-h-[520px] grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl bg-primary-soft px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">{refundLabel[note.refundMode]}</div>
            <Money paise={t.grand} className="text-2xl font-bold text-ink" />
            <div className="mt-0.5 text-xs text-muted">
              {note.refundMode === 'cash' && 'Hand this cash back to the customer.'}
              {note.refundMode === 'upi' && 'Send this amount back to the customer by UPI.'}
              {note.refundMode === 'credit_note' && 'Keep this note. The customer can use it on a future bill.'}
              {note.refundMode === 'exchange' && 'This credit goes to the new bill automatically.'}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Returned items</div>
            <ul className="divide-y divide-line rounded-control border border-line">
              {note.lines.map((l, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{l.name}</span>
                  <span className="num text-sm text-muted">{formatQty(l.qty, isDecimalUnit(l.unit))} {l.unit}</span>
                  <Money paise={l.amount} className="w-24 text-right text-sm font-semibold" />
                </li>
              ))}
            </ul>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Taxable value</dt><dd><Money paise={t.taxable} /></dd></div>
            {t.slabs.map((s) => (
              <div key={s.rate} className="flex justify-between text-muted"><dt>GST {s.rate}% reversed (CGST + SGST)</dt><dd><Money paise={s.cgst + s.sgst} /></dd></div>
            ))}
            {t.roundOff !== 0 && <div className="flex justify-between text-muted"><dt>Round off</dt><dd><Money paise={t.roundOff} sign /></dd></div>}
            <div className="flex justify-between border-t border-line pt-1.5 text-base font-semibold"><dt>Refund total</dt><dd><Money paise={t.grand} /></dd></div>
          </dl>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone="neutral">Reason: {note.reason}</Badge><Badge tone="neutral">By {note.by}</Badge>
          </div>
        </div>
        <div className="overflow-y-auto border-l border-line bg-surface-3 p-4">
          <ReceiptPreview data={noteReceipt(note)} settings={settings} />
        </div>
      </div>
    </Dialog>
  );
}
