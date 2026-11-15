/**
 * GST rules that are data, not code. The owner's list of rates lives in Settings (tax.rates); items, bills and purchases are
 * checked against the enabled ones. Same defaults as crates/core/src/gst.rs.
 *
 * Since 22 Sep 2025 ("GST 2.0") the main slabs are 0, 5, 18 and 40; 0.25 and 3 are special rates; 12 and 28 stay for old
 * bills and items (confirm with CA).
 */
export interface TaxRateEntry { rate: number; enabled: boolean; label: string }

export const DEFAULT_GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40] as const;

const DEFAULT_LABELS: Record<number, string> = {
  0: 'Exempt / nil rated',
  0.25: 'Special rate (rough diamonds) (confirm with CA)',
  3: 'Special rate (gold, silver) (confirm with CA)',
  5: 'Edible oils, ghee, pulses, oil cake',
  12: 'Older rate, kept for old bills (confirm with CA)',
  18: 'Standard rate',
  28: 'Older rate, kept for old bills (confirm with CA)',
  40: 'Demerit and luxury goods (from 22 Sep 2025) (confirm with CA)',
};

export const defaultRateEntries = (): TaxRateEntry[] => DEFAULT_GST_RATES.map((rate) => ({ rate, enabled: true, label: DEFAULT_LABELS[rate] ?? '' }));

/** The saved list with any default rate that is missing added back (enabled), sorted. */
export function mergeRateEntries(saved?: TaxRateEntry[]): TaxRateEntry[] {
  const out = (saved ?? []).map((r) => ({ ...r, label: r.label || DEFAULT_LABELS[r.rate] || '' }));
  for (const d of DEFAULT_GST_RATES) if (!out.some((r) => r.rate === d)) out.push({ rate: d, enabled: true, label: DEFAULT_LABELS[d] ?? '' });
  return out.sort((a, b) => a.rate - b.rate);
}

/** The rates an item, bill line or purchase may carry. */
export const enabledRates = (entries?: TaxRateEntry[]): number[] => mergeRateEntries(entries).filter((r) => r.enabled).map((r) => r.rate);

/** A percent the way people write it: 5, 0.25, 12.5 */
export const rateText = (r: number): string => `${Number.isInteger(r) ? r : r.toString()}%`;

/** A percentage 0..100 with at most two decimals. */
export const rateOk = (r: number): boolean => Number.isFinite(r) && r >= 0 && r <= 100 && Math.abs(Math.round(r * 100) - r * 100) < 1e-6;
