import type { StockTakeLine } from '@gokul/data';

/** Items with no supplier on file are kept in one group at the end of the sheet. */
export const NO_SUPPLIER = 'No supplier';

export const lineSupplier = (l: StockTakeLine) => l.supplier?.trim() || NO_SUPPLIER;

/** Sheet order: supplier, then item name. Used by the paper and the on-screen entry table so they always match. */
export function orderForSheet(lines: StockTakeLine[]): StockTakeLine[] {
  return [...lines].sort((a, b) => {
    const sa = a.supplier?.trim() ?? '';
    const sb = b.supplier?.trim() ?? '';
    if (sa !== sb) {
      if (!sa) return 1;
      if (!sb) return -1;
      return sa.localeCompare(sb, 'en', { numeric: true, sensitivity: 'base' });
    }
    return a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' });
  });
}

const rs = (paise: number) => (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const th = 'border border-black px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide';
const td = 'border border-black px-2 py-[5px] text-[12px]';

/**
 * The blind count sheet in A4 paper form: S.No | Supplier | Item | Price | Count by staff.
 * It never shows the system quantity, so staff cannot copy it. One table per supplier, so a page
 * break falls between suppliers when a group does not fit and the column header repeats on each page.
 */
export function CountSheetPaper({ lines, shop, sheetNo, date, filterLabel }: {
  lines: StockTakeLine[]; shop: string; sheetNo: string; date: string; filterLabel: string;
}) {
  const groups: { supplier: string; rows: StockTakeLine[] }[] = [];
  for (const l of orderForSheet(lines)) {
    const supplier = lineSupplier(l);
    const last = groups[groups.length - 1];
    if (last && last.supplier === supplier) last.rows.push(l);
    else groups.push({ supplier, rows: [l] });
  }
  let serial = 0;

  return (
    <div className="print-area mx-auto w-[794px] bg-white p-8 font-sans text-black" style={{ minHeight: 1000 }}>
      <div className="flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <div className="text-[18px] font-bold tracking-wide">{shop.toUpperCase()}</div>
          <div className="text-[13px] font-semibold">Stock count sheet</div>
          <div className="text-[11px] text-neutral-700">Blind count - count the shelf and write the quantity</div>
        </div>
        <div className="text-right text-[12px]">
          <div>Sheet no: <span className="font-semibold">{sheetNo}</span></div>
          <div>Date: <span className="font-semibold">{date}</span></div>
          <div className="text-[11px] text-neutral-700">Filter: {filterLabel}</div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide">Do not write the system quantity</div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {groups.map((g) => (
          <table key={g.supplier} className="sheet-supplier w-full border-collapse">
            <thead>
              <tr>
                <th className={`${th} w-[42px] text-center`}>S.No</th>
                <th className={`${th} w-[150px]`}>Supplier</th>
                <th className={th}>Item</th>
                <th className={`${th} w-[90px] text-right`}>Price</th>
                <th className={`${th} w-[110px] text-center`}>Count by staff</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((l) => {
                serial += 1;
                return (
                  <tr key={l.itemId}>
                    <td className={`${td} text-center tabular-nums`}>{serial}</td>
                    <td className={td}>{g.supplier}</td>
                    <td className={td}>
                      <span className="font-medium">{l.name}</span>
                      <span className="ml-1 text-[10px] text-neutral-600">({l.code})</span>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>₹{rs(l.price)}</td>
                    <td className={`${td} align-middle`}><span className="ml-auto block h-7 w-[86px] border border-black" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
        {groups.length === 0 && <div className="py-6 text-center text-[12px] text-neutral-600">No items for this filter.</div>}
      </div>

      <div className="mt-10 flex justify-between text-[12px]">
        <div className="w-56 border-t border-black pt-1">Counted by</div>
        <div className="w-56 border-t border-black pt-1">Checked by</div>
      </div>
    </div>
  );
}
