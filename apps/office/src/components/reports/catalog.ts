import type { ReportId } from '@gokul/data';

export type ReportFilter = 'category' | 'cashier' | 'mode';
export interface ReportDef {
  id: ReportId;
  name: string;
  hint: string;
  filters: ReportFilter[];
  /** false = a point-in-time report, the date range does not apply */
  dated?: boolean;
  soon?: boolean;
}
export interface ReportGroup { name: string; reports: ReportDef[] }

export const reportGroups: ReportGroup[] = [
  { name: 'Sales', reports: [
    { id: 'daily-summary', name: 'Daily summary', hint: 'Bills, GST and net sales for every day', filters: ['cashier', 'mode'] },
    { id: 'bill-wise', name: 'Bill-wise', hint: 'Every bill in the period', filters: ['cashier', 'mode'] },
    { id: 'item-wise', name: 'Item-wise', hint: 'What sold, how much, how often', filters: ['category', 'cashier', 'mode'] },
    { id: 'category-wise', name: 'Category-wise', hint: 'Sales split by item category', filters: ['category', 'cashier', 'mode'] },
    { id: 'cashier-wise', name: 'Cashier-wise', hint: 'Sales, discounts and tender per cashier', filters: ['mode'] },
    { id: 'payment-mode', name: 'Payment mode', hint: 'Cash, UPI, card and credit', filters: ['cashier'] },
    { id: 'hourly-heatmap', name: 'Hourly heatmap', hint: 'Busy and quiet hours by weekday', filters: ['cashier', 'mode'] },
  ] },
  { name: 'GST', reports: [
    { id: 'gstr1', name: 'GSTR-1 summary', hint: 'B2B and B2C outward supplies', filters: [] },
    { id: 'gstr3b', name: 'GSTR-3B summary', hint: 'Output tax, input credit and tax payable', filters: [] },
    { id: 'hsn-wise', name: 'HSN-wise', hint: 'GSTR-1 table 12 HSN summary', filters: ['category'] },
    { id: 'tax-rate', name: 'Tax-rate-wise', hint: 'Taxable value and GST per slab', filters: [] },
  ] },
  { name: 'Stock', reports: [
    { id: 'stock-summary', name: 'Stock summary', hint: 'On-hand stock against reorder level', filters: ['category'], dated: false },
    { id: 'stock-valuation', name: 'Stock valuation', hint: 'Stock value at cost and at selling price', filters: ['category'], dated: false },
    { id: 'stock-movement', name: 'Stock movement', hint: 'Every in and out, item by item', filters: ['category'], soon: true },
    { id: 'low-dead', name: 'Low and dead stock', hint: 'Fast movers running out, slow movers stuck', filters: ['category'], soon: true },
  ] },
  { name: 'Profit', reports: [
    { id: 'item-margin', name: 'Item-wise margin', hint: 'Profit and margin on each item', filters: ['category'] },
    { id: 'daily-profit', name: 'Daily profit', hint: 'Gross profit for every day', filters: ['category'] },
  ] },
  { name: 'Cash', reports: [
    { id: 'cash-book', name: 'Day-wise cash book', hint: 'Opening, receipts, payments, closing', filters: [] },
    { id: 'day-close', name: 'Day close history', hint: 'Past day-end closings and differences', filters: [], soon: true },
  ] },
  { name: 'Production', reports: [
    { id: 'yield', name: 'Yield report', hint: 'Oil and cake yield for each pressing batch', filters: [] },
  ] },
];

export const allReports: ReportDef[] = reportGroups.flatMap((g) => g.reports);
