import type { BillFormatSettings, ShopSettings } from '@gokul/data';
import { cn } from '@gokul/ui';

const EN = {
  invoice: 'TAX INVOICE', no: 'Bill No', date: 'Date', cashier: 'Cashier', item: 'Item', amount: 'Amount', sub: 'Sub total',
  total: 'TOTAL', saved: 'You saved', gst: 'GST', taxable: 'Taxable', hsn: 'HSN', items: 'Items',
};
const TA = {
  invoice: 'வரி விலைப்பட்டியல்', no: 'பில் எண்', date: 'தேதி', cashier: 'காசாளர்', item: 'பொருள்', amount: 'தொகை', sub: 'துணை மொத்தம்',
  total: 'மொத்தம்', saved: 'நீங்கள் சேமித்தது', gst: 'ஜிஎஸ்டி', taxable: 'வரிக்குட்பட்ட', hsn: 'HSN', items: 'பொருட்கள்',
};

const LINES = [
  { name: 'Gingelly Oil 1 L', ta: 'நல்லெண்ணெய் 1 L', qty: '2 x 545.00', amt: '1,090.00', hsn: '1515' },
  { name: 'Groundnut Oil (loose)', ta: 'கடலை எண்ணெய் (தளர்வு)', qty: '1.500 L x 360.00', amt: '540.00', hsn: '1508' },
  { name: 'Palm Jaggery 500 g', ta: 'கருப்பட்டி 500 g', qty: '1 x 90.00', amt: '90.00', hsn: '1702' },
];

/** Live 80mm / 58mm thermal bill that reacts to the Bill format form. Sample items only. */
export function BillFormatPreview({ shop, fmt }: { shop: ShopSettings; fmt: BillFormatSettings }) {
  const t = fmt.language === 'ta' ? TA : EN;
  const ta = fmt.language === 'ta';
  const rule = <div className="my-1.5 border-t border-dashed border-neutral-400" />;
  return (
    <div
      className={cn('mx-auto bg-white px-4 py-5 font-mono text-[11.5px] leading-[1.45] text-neutral-900 shadow-pop', fmt.paper === '80mm' ? 'w-[302px]' : 'w-[222px]')}
      style={{ clipPath: 'polygon(0 0,100% 0,100% calc(100% - 6px),97% 100%,94% calc(100% - 6px),91% 100%,88% calc(100% - 6px),85% 100%,82% calc(100% - 6px),79% 100%,76% calc(100% - 6px),73% 100%,70% calc(100% - 6px),67% 100%,64% calc(100% - 6px),61% 100%,58% calc(100% - 6px),55% 100%,52% calc(100% - 6px),49% 100%,46% calc(100% - 6px),43% 100%,40% calc(100% - 6px),37% 100%,34% calc(100% - 6px),31% 100%,28% calc(100% - 6px),25% 100%,22% calc(100% - 6px),19% 100%,16% calc(100% - 6px),13% 100%,10% calc(100% - 6px),7% 100%,4% calc(100% - 6px),1% 100%,0 calc(100% - 6px))' }}
    >
      <div className="text-center">
        {shop.logo && <img src={shop.logo} alt="" className="mx-auto mb-1 h-10 w-auto object-contain grayscale" />}
        <div className="text-[15px] font-bold uppercase tracking-wide">{shop.name || 'Shop name'}</div>
        {fmt.header && <div className="italic">{fmt.header}</div>}
        <div>{[shop.address, shop.city, shop.pincode].filter(Boolean).join(', ')}</div>
        <div>Ph: {shop.phone}</div>
        <div className="font-semibold">GSTIN: {shop.gstin}</div>
        {shop.fssai && <div>FSSAI: {shop.fssai}</div>}
      </div>
      {rule}
      <div className="text-center text-[12.5px] font-bold tracking-widest">{t.invoice}</div>
      {rule}
      <div className="flex justify-between"><span>{t.no}: <b>GK-048301</b></span><span>06/11/2026</span></div>
      <div className="flex justify-between"><span>{t.cashier}: Karthik</span><span>11:42 AM</span></div>
      {rule}
      <div className="flex justify-between font-bold"><span>{t.item}</span><span>{t.amount}</span></div>
      <div className="mt-1 space-y-1.5">
        {LINES.map((l) => (
          <div key={l.name}>
            <div className="font-semibold">{ta ? l.ta : l.name}{fmt.showHsn && <span className="font-normal text-neutral-500"> ({l.hsn})</span>}</div>
            <div className="flex justify-between"><span>{l.qty}</span><span className="font-semibold">{l.amt}</span></div>
          </div>
        ))}
      </div>
      {rule}
      <div className="flex justify-between"><span>{t.items} 3</span><span>{t.sub}  1,720.00</span></div>
      <div className="mt-1 flex items-baseline justify-between border-y border-neutral-900 py-1 font-sans text-[16px] font-extrabold">
        <span>{t.total}</span><span>{'₹'}1,720.00</span>
      </div>
      {fmt.showSavings && <div className="mt-1 text-center font-semibold">{t.saved} {'₹'}70.00</div>}
      {fmt.showGstSummary && (
        <>
          {rule}
          <div className="grid grid-cols-[34px_1fr_1fr_1fr] gap-x-1 text-[10.5px]">
            <span className="font-bold">{t.gst}</span><span className="text-right font-bold">{t.taxable}</span><span className="text-right font-bold">CGST</span><span className="text-right font-bold">SGST</span>
            <span>5%</span><span className="text-right">1,638.10</span><span className="text-right">40.95</span><span className="text-right">40.95</span>
          </div>
        </>
      )}
      {rule}
      <div className="text-center">{fmt.footer || ' '}</div>
      {fmt.showQr && (
        <div className="mt-2 flex flex-col items-center gap-1">
          <div className="grid h-16 w-16 grid-cols-8 grid-rows-8 gap-px bg-white p-0.5" aria-hidden>
            {Array.from({ length: 64 }, (_, i) => <span key={i} className={(i * 7 + (i >> 3) * 3) % 5 < 2 ? 'bg-neutral-900' : 'bg-white'} />)}
          </div>
          <span className="text-[10px]">Scan to pay by UPI</span>
        </div>
      )}
    </div>
  );
}
