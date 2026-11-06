import { formatRupees, type Item } from '@gokul/data';
import { Barcode } from './Barcode';
import { unitText } from './shared';

export type LabelSize = '38x25' | '50x25' | '2up';
export interface LabelFields { name: boolean; mrp: boolean; price: boolean; dates: boolean; batch: boolean }

export const SIZES: { value: LabelSize; label: string; hint: string; w: number; h: number; across: number }[] = [
  { value: '38x25', label: '38 x 25 mm', hint: 'Small, one across', w: 38, h: 25, across: 1 },
  { value: '50x25', label: '50 x 25 mm', hint: 'Wide, one across', w: 50, h: 25, across: 1 },
  { value: '2up', label: '2-up 38 x 25', hint: 'Two across, 80 mm roll', w: 38, h: 25, across: 2 },
];

/** Preview scale: pixels per millimetre. */
export const MM = 5.4;

const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, ' ');

export function labelDates(item: Item) {
  const packed = new Date();
  const months = item.categoryId === 'oil' || item.categoryId === 'ghee' ? 6 : item.categoryId === 'jag' ? 4 : 9;
  return { pkd: fmt(packed), exp: fmt(addMonths(packed, months)) };
}
export const batchCode = (item: Item) => `GK${String(new Date().getFullYear()).slice(2)}${String(new Date().getMonth() + 1).padStart(2, '0')}${item.categoryId[0].toUpperCase()}`;

/** One label drawn to scale. Colours are fixed black on white because that is what the sticker prints. */
export function LabelCard({ item, size, fields }: { item: Item; size: LabelSize; fields: LabelFields }) {
  const s = SIZES.find((x) => x.value === size)!;
  const dates = labelDates(item);
  const per = item.loose ? `/${unitText(item.unit)}` : '';
  return (
    <div
      className="flex shrink-0 flex-col overflow-hidden rounded-[3px] bg-white text-black shadow-sm ring-1 ring-black/10"
      style={{ width: s.w * MM, height: s.h * MM, padding: 1.2 * MM }}
    >
      {fields.name && (
        <div className="font-bold leading-[1.1]" style={{ fontSize: 2.15 * MM, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.name.replace(' (Loose)', '')}
        </div>
      )}
      <div className="min-h-0 flex-1 py-[2px]"><Barcode code={item.barcode} className="h-full w-full" /></div>
      {(fields.mrp || fields.price) && (
        <div className="flex items-baseline justify-between font-semibold leading-none" style={{ fontSize: 2.1 * MM }}>
          {fields.mrp && <span className={fields.price ? 'font-normal' : ''} style={{ fontSize: fields.price ? 1.75 * MM : undefined }}>MRP {formatRupees(item.mrp, { decimals: false })}{per}</span>}
          {fields.price && <span style={{ fontSize: 2.5 * MM }}>{formatRupees(item.price, { decimals: false })}{per}</span>}
        </div>
      )}
      {(fields.dates || fields.batch) && (
        <div className="mt-[2px] flex items-center justify-between leading-none text-black/80" style={{ fontSize: 1.45 * MM }}>
          {fields.dates && <span className="truncate">Pkd {dates.pkd} Exp {dates.exp}</span>}
          {fields.batch && <span className="ml-1 shrink-0 font-medium">{batchCode(item)}</span>}
        </div>
      )}
    </div>
  );
}
