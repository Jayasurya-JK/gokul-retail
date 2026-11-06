import type { MillSheet, MillStockLine } from '@gokul/data';
import { fmtQty, longDay, PUNNAKU_LABEL, seedLabel } from './millUtil';

/**
 * The sheet in the layout of the owner's paper form, in black on white. Used for the print preview and the PDF.
 * Sections in paper order: Opening stock, Aravai (Operator) per operator, Aravai (Customer), Punnaku purchased, Closing stock.
 */
export function SheetPaper({ sheet, shop }: { sheet: MillSheet; shop: string }) {
  const by = (g: MillStockLine['group']) => sheet.stock.filter((l) => l.group === g);
  const operators = sheet.settings.operators.filter((o) => sheet.opRows.some((r) => r.operator === o));
  const unit = (l: MillStockLine) => (l.unit === 'L' ? 'L' : 'kg');
  const rs = (p?: number) => (p === undefined ? '' : (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
  const th = 'border border-black px-1.5 py-1 text-left text-[11px] font-semibold';
  const td = 'border border-black px-1.5 py-[3px] text-[12px]';
  const num = 'text-right tabular-nums';
  const h2 = 'mb-1 mt-4 text-[12px] font-bold uppercase tracking-wide';

  return (
    <div className="print-area mx-auto w-[794px] bg-white p-8 font-sans text-black" style={{ minHeight: 1000 }}>
      <div className="flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <div className="text-[18px] font-bold tracking-wide">{shop.toUpperCase()}</div>
          <div className="text-[12px]">Mill daily stock sheet</div>
        </div>
        <div className="text-right text-[12px]">
          <div className="font-semibold">{longDay(sheet.day)}</div>
          <div>Supervisor: {sheet.supervisor || '____________'}</div>
          <div className="mt-0.5 text-[11px]">{sheet.status === 'closed' ? 'CLOSED' : 'DRAFT'}</div>
        </div>
      </div>

      <h2 className={h2}>1. Opening stock</h2>
      <table className="w-full border-collapse">
        <tbody>
          {[by('seed'), by('punnaku'), [...by('other'), ...by('oil')]].map((group, gi) => (
            <tr key={gi}>
              {group.map((l) => (
                <td key={l.key} className={td}><span className="block text-[10px] text-neutral-600">{l.label}</span><span className={`block font-semibold ${num}`}>{fmtQty(l.opening)} {unit(l)}</span></td>
              ))}
              {Array.from({ length: Math.max(0, 5 - group.length) }).map((_, i) => <td key={`e${i}`} className={td} />)}
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className={h2}>2. Aravai (Operator)</h2>
      {operators.length === 0 && <div className="text-[12px] text-neutral-600">No operator rows today.</div>}
      {operators.map((o) => {
        const rows = sheet.opRows.filter((r) => r.operator === o);
        const t = (k: 'seedKg' | 'oilL' | 'cakeKg') => rows.reduce((a, r) => a + r[k], 0);
        return (
          <table key={o} className="mb-2 w-full border-collapse">
            <thead>
              <tr><th className={th} colSpan={6}>{o}</th></tr>
              <tr><th className={th}>Seed</th><th className={th}>Machine</th><th className={`${th} ${num}`}>Seed in (kg)</th><th className={`${th} ${num}`}>Oil out (L)</th><th className={`${th} ${num}`}>Punnaku out (kg)</th><th className={th}>Batch</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}><td className={td}>{seedLabel(r.seed)}</td><td className={td}>{r.machine}</td><td className={`${td} ${num}`}>{fmtQty(r.seedKg)}</td><td className={`${td} ${num}`}>{fmtQty(r.oilL)}</td><td className={`${td} ${num}`}>{fmtQty(r.cakeKg)}</td><td className={td}>{r.batchNumber}</td></tr>
              ))}
              <tr className="font-semibold"><td className={td} colSpan={2}>Total</td><td className={`${td} ${num}`}>{fmtQty(t('seedKg'))}</td><td className={`${td} ${num}`}>{fmtQty(t('oilL'))}</td><td className={`${td} ${num}`}>{fmtQty(t('cakeKg'))}</td><td className={td} /></tr>
            </tbody>
          </table>
        );
      })}

      <h2 className={h2}>3. Aravai (Customer)</h2>
      <table className="w-full border-collapse">
        <thead><tr><th className={th}>Customer</th><th className={th}>Seed</th><th className={th}>M</th><th className={`${th} ${num}`}>Seed (kg)</th><th className={`${th} ${num}`}>Oil back (L)</th><th className={`${th} ${num}`}>Punnaku (kg)</th><th className={th}>Cake</th><th className={`${th} ${num}`}>Rate/kg</th><th className={`${th} ${num}`}>Charge</th></tr></thead>
        <tbody>
          {sheet.custRows.length === 0 && <tr><td className={td} colSpan={9}>None today</td></tr>}
          {sheet.custRows.map((r, i) => (
            <tr key={i}><td className={td}>{r.customerName}</td><td className={td}>{seedLabel(r.seed)}</td><td className={td}>{r.machine}</td><td className={`${td} ${num}`}>{fmtQty(r.seedKg)}</td><td className={`${td} ${num}`}>{fmtQty(r.oilL)}</td><td className={`${td} ${num}`}>{fmtQty(r.cakeKg)}</td><td className={td}>{r.cakeMode === 'kept' ? 'Shop keeps' : 'Customer takes'}</td><td className={`${td} ${num}`}>{rs(r.rate)}</td><td className={`${td} ${num}`}>{rs(r.charge)}</td></tr>
          ))}
          {sheet.custRows.length > 0 && <tr className="font-semibold"><td className={td} colSpan={8}>Aravai charge billed to customers (GST included)</td><td className={`${td} ${num}`}>{rs(sheet.aravaiCharge)}</td></tr>}
        </tbody>
      </table>

      <h2 className={h2}>4. Punnaku purchased</h2>
      <table className="w-full border-collapse">
        <thead><tr><th className={th}>Punnaku</th><th className={`${th} ${num}`}>Qty (kg)</th><th className={th}>From</th><th className={th}>Note</th></tr></thead>
        <tbody>
          {sheet.punnakuRows.length === 0 && <tr><td className={td} colSpan={4}>None today</td></tr>}
          {sheet.punnakuRows.map((r, i) => (
            <tr key={i}><td className={td}>{PUNNAKU_LABEL[r.punnaku]}</td><td className={`${td} ${num}`}>{fmtQty(r.qtyKg)}</td><td className={td}>{r.supplierName}</td><td className={td}>{r.note}</td></tr>
          ))}
        </tbody>
      </table>

      <h2 className={h2}>5. Closing stock</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr><th className={th}>Item</th><th className={`${th} ${num}`}>Opening</th><th className={`${th} ${num}`}>Pressed</th><th className={`${th} ${num}`}>Bought</th><th className={`${th} ${num}`}>Kept</th><th className={`${th} ${num}`}>Sold / packed</th><th className={`${th} ${num}`}>Closing (calc.)</th><th className={`${th} ${num}`}>Counted</th><th className={`${th} ${num}`}>Diff.</th></tr>
        </thead>
        <tbody>
          {sheet.stock.map((l) => (
            <tr key={l.key}>
              <td className={td}>{l.label} <span className="text-[10px] text-neutral-600">({unit(l)})</span></td>
              <td className={`${td} ${num}`}>{fmtQty(l.opening)}</td><td className={`${td} ${num}`}>{l.pressed ? fmtQty(l.pressed) : ''}</td>
              <td className={`${td} ${num}`}>{l.purchased ? fmtQty(l.purchased) : ''}</td><td className={`${td} ${num}`}>{l.kept ? fmtQty(l.kept) : ''}</td>
              <td className={`${td} ${num}`}>{l.sold + l.packed ? fmtQty(l.sold + l.packed) : ''}</td>
              <td className={`${td} ${num} font-semibold`}>{fmtQty(l.computed)}</td>
              <td className={`${td} ${num}`}>{l.physical === null ? '' : fmtQty(l.physical)}</td>
              <td className={`${td} ${num} font-semibold`}>{l.variance ? fmtQty(l.variance) : l.variance === 0 ? '0' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sheet.note && <div className="mt-3 text-[12px]"><b>Note:</b> {sheet.note}</div>}
      <div className="mt-10 flex justify-between text-[12px]">
        <div className="w-56 border-t border-black pt-1">Supervisor</div>
        <div className="w-56 border-t border-black pt-1">Owner / manager{sheet.approvedBy ? `: ${sheet.approvedBy}` : ''}</div>
      </div>
    </div>
  );
}
