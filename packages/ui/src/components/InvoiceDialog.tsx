import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import type { InvoiceData } from '@gokul/data';
import { cn } from '../cn';
import { Button } from './Button';
import { Dialog } from './Overlay';
import { TaxInvoicePreview } from './TaxInvoicePreview';

/**
 * A tax invoice, bill of supply or credit note on screen as it prints: choose the A4 sheet or the thermal roll, then print it.
 * The preview is drawn here; the paper itself is drawn by the Rust print code, with the same particulars.
 */
export function InvoiceDialog({ open, data, initialLayout = 'a4', onClose, onPrint }: {
  open: boolean; data: InvoiceData | null; initialLayout?: 'a4' | 'thermal'; onClose: () => void;
  /** Print on an A4 printer ('a4') or on the bill printer ('thermal') */
  onPrint: (layout: 'a4' | 'thermal') => void;
}) {
  const [layout, setLayout] = useState<'a4' | 'thermal'>(initialLayout);
  useEffect(() => { if (open) setLayout(initialLayout); }, [open, initialLayout]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); onPrint(layout); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, layout, onPrint]);
  if (!data) return null;
  const word = data.kind === 'credit-note' ? 'credit note' : data.kind === 'bill-of-supply' ? 'bill of supply' : 'tax invoice';
  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="xl" title={`${data.title[0]}${data.title.slice(1).toLowerCase()} ${data.number}`}
      description={`${data.recipient.gstin ? 'B2B, ' : ''}${data.inter ? 'inter-state (IGST)' : 'local (CGST + SGST)'}. Check it, then print.`}
      bodyClassName="p-0"
      footer={<>
        <div className="mr-auto flex rounded-control border border-line-strong bg-surface p-0.5" role="group" aria-label="Paper">
          {(['a4', 'thermal'] as const).map((l) => (
            <button
              key={l} type="button" onClick={() => setLayout(l)}
              className={cn('rounded-[5px] px-3 py-1 text-sm font-medium transition-colors', layout === l ? 'bg-primary text-primary-fg' : 'text-muted hover:text-ink')}
            >{l === 'a4' ? 'A4 sheet' : 'Thermal roll'}</button>
          ))}
        </div>
        <Button onClick={onClose} kbd="Esc">Close</Button>
        <Button variant="primary" data-autofocus icon={<Printer size={15} />} onClick={() => onPrint(layout)} kbd="Ctrl+P">{layout === 'a4' ? `Print ${word} on A4` : `Print ${word} on the roll`}</Button>
      </>}
    >
      <div className="max-h-[calc(100vh-190px)] overflow-auto bg-surface-3 p-5">
        <TaxInvoicePreview data={data} layout={layout} />
      </div>
    </Dialog>
  );
}
