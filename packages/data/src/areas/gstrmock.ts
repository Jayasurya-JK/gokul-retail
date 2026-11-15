import type { MockStore } from './store';
import type { GstrFacts, GstrHsnFact, GstrSlab } from '../gstr';
import type { Bill, BillLine } from '../types';
import { printNumber } from '../printed';
import { rateBp } from '../money';
import { descForHsn } from './hsn';

const UQC: Record<string, string> = { kg: 'KGS', g: 'GMS', l: 'LTR', ml: 'MLT', pc: 'PCS', tin: 'CAN', btl: 'BTL', pkt: 'PAC' };
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date | string) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };

/** "2026-11" to its first and last day and filing period ("112026"), same as `gstr::month_range` in Rust. */
export function monthRange(month: string): { from: string; to: string; fp: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error('Choose a month like 2026-11.');
  const y = Number(m[1]), mo = Number(m[2]);
  const last = new Date(y, mo, 0).getDate();
  return { from: `${y}-${pad(mo)}-01`, to: `${y}-${pad(mo)}-${pad(last)}`, fp: `${pad(mo)}${y}` };
}

const slabOf = (s: { rate: number; taxable: number; cgst: number; sgst: number; igst?: number; cess?: number }): GstrSlab => ({ rate: s.rate, taxable: s.taxable, cgst: s.cgst, sgst: s.sgst, igst: s.igst ?? 0, cess: s.cess ?? 0 });

function fiscalYear(iso: string): string { const d = new Date(iso); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${pad((y + 1) % 100)}`; }
/** The numbering of a mock bill ("GK-048201" style): financial year digits and a running number for the document summary. */
function seqOf(number: string): number { const m = /(\d+)$/.exec(number); return m ? Number(m[1]) : 0; }

/**
 * The facts GSTR-1 and GSTR-3B are built from (see gstr.ts), read from the mock store. Same shape and meaning as the Rust
 * `gstr::gstr_facts`: sums of what was saved on each bill and credit note.
 */
export function mockGstrFacts(store: MockStore, month: string): GstrFacts {
  const { from, to, fp } = monthRange(month);
  return mockGstrFactsFor(store, from, to, { month: month.trim(), fp });
}

/** The same facts for any date range (the HSN report uses it for the dates the owner picked). */
export function mockGstrFactsFor(store: MockStore, from: string, to: string, label: { month: string; fp: string }): GstrFacts {
  const inRange = (iso: string) => { const k = dayKey(iso); return k >= from && k <= to; };
  const fmt = store.settings.billPrefix;
  void fmt;
  const bills = store.bills.filter((b) => inRange(b.at));
  const notes = (store.creditNotes ?? []).filter((n) => inRange(n.at));
  const billByNumber = new Map(store.bills.map((b) => [b.number, b]));
  const stateCode = store.settings.stateCode ?? '33';

  const hsnFact = (b2b: boolean, l: BillLine): { key: string; f: GstrHsnFact } => {
    const hsn = l.hsn ?? '';
    const unit = l.unit;
    return { key: `${b2b}|${hsn}|${unit}|${rateBp(l.gstRate)}`, f: { b2b, hsn, desc: descForHsn(hsn), unit, uqc: UQC[unit] ?? 'OTH', rate: l.gstRate, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, value: 0 } };
  };
  const accumulate = (pairs: { b2b: boolean; l: BillLine }[]): GstrHsnFact[] => {
    const map = new Map<string, GstrHsnFact>();
    for (const { b2b, l } of pairs) {
      if (!l.tax) continue;
      const { key, f } = hsnFact(b2b, l);
      const cur = map.get(key) ?? f;
      cur.qty += l.qty; cur.taxable += l.tax.taxable; cur.cgst += l.tax.cgst; cur.sgst += l.tax.sgst; cur.igst += l.tax.igst; cur.cess += l.tax.cess; cur.value += l.amount;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => Number(b.b2b) - Number(a.b2b) || a.hsn.localeCompare(b.hsn) || a.unit.localeCompare(b.unit) || a.rate - b.rate);
  };
  const salesPairs = bills.filter((b) => b.status !== 'cancelled').flatMap((b) => b.lines.map((l) => ({ b2b: !!b.customerGstin, l })));
  const returnPairs = notes.flatMap((n) => { const orig = billByNumber.get(n.billNumber); return n.lines.map((l) => ({ b2b: !!(orig?.customerGstin ?? n.customerGstin), l })); });

  // purchases (cost is GST inclusive in the mock): input credit and nil rated inward supplies
  let taxable = 0, gst = 0, nil = 0;
  const items = new Map(store.items.map((i) => [i.id, i]));
  for (const p of store.purchases) {
    if (!inRange(p.date)) continue;
    for (const l of p.lines) {
      const it = items.get(l.itemId);
      const amount = Math.round((l.cost * l.qty) / 1000);
      const rate = it?.gstRate ?? 5;
      const tx = Math.round((amount * 10000) / (10000 + rateBp(rate)));
      taxable += tx; gst += amount - tx;
      if (rate === 0) nil += tx;
    }
  }
  const cgst = Math.floor(gst / 2);

  const shown = (n: string) => printNumber(n);
  const toBill = (b: Bill): GstrFacts['bills'][number] => ({
    number: b.number, shown: shown(b.number), fy: fiscalYear(b.at), seq: seqOf(b.number), at: b.at, day: dayKey(b.at), status: b.status, grand: b.totals.grand,
    place: b.placeOfSupply ?? stateCode, inter: b.supplyType === 'inter', gstin: b.customerGstin ?? '', name: b.customerName,
    slabs: b.status === 'cancelled' ? [] : b.totals.slabs.map(slabOf),
  });
  return {
    period: { month: label.month, from, to, fp: label.fp },
    shop: { name: store.settings.shopName, gstin: store.settings.gstin, address: store.settings.address, stateCode, stateName: '' },
    bills: bills.map(toBill),
    notes: notes.map((n) => {
      const orig = billByNumber.get(n.billNumber);
      return {
        number: n.number, shown: n.number, fy: fiscalYear(n.at), seq: seqOf(n.number), at: n.at, day: dayKey(n.at), grand: n.totals.grand,
        place: n.placeOfSupply ?? stateCode, inter: n.supplyType === 'inter', gstin: orig?.customerGstin ?? n.customerGstin ?? '', name: n.customerName,
        billNumber: n.billNumber, billShown: shown(n.billNumber), billAt: n.billAt ?? orig?.at ?? n.at, billGrand: orig?.totals.grand ?? 0, billInter: orig?.supplyType === 'inter',
        slabs: n.totals.slabs.map(slabOf),
      };
    }),
    hsn: { sales: accumulate(salesPairs), returns: accumulate(returnPairs) },
    purchases: { count: store.purchases.filter((p) => inRange(p.date)).length, taxable, cgst, sgst: gst - cgst, igst: 0, nilIntra: nil, nilInter: 0 },
  };
}
