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

// ---------- states and GSTIN (same rules as crates/core/src/gst.rs) ----------

/** GST state and union-territory codes (the first two characters of a GSTIN). 25 and 28 are old codes older GSTINs still carry (confirm with CA). */
export const GST_STATES: { code: string; name: string }[] = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'],
  ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'],
  ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'],
  ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'],
  ['24', 'Gujarat'], ['25', 'Daman and Diu (old code)'], ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'],
  ['28', 'Andhra Pradesh (old code)'], ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'],
  ['34', 'Puducherry'], ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
  ['97', 'Other Territory'], ['99', 'Centre Jurisdiction'],
].map(([code, name]) => ({ code, name }));

export const stateName = (code: string): string | undefined => GST_STATES.find((s) => s.code === code)?.name;

/** "Tamil Nadu" (any case, "&" for "and") to "33". */
export function stateCodeForName(name: string): string | undefined {
  const norm = (s: string) => s.trim().toLowerCase().replace(/&/g, 'and');
  const want = norm(name);
  return want ? GST_STATES.find((s) => norm(s.name) === want)?.code : undefined;
}

/** "Tamil Nadu (33)" */
export const stateLabel = (code: string): string => `${stateName(code) ?? 'Unknown state'} (${code})`;

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * The 15th character of a GSTIN, from the first 14 (the GSTN check-digit algorithm: base-36 values, weights 1 and 2 alternating,
 * each product split as quotient + remainder by 36, summed, then 36 minus the remainder of the sum by 36).
 */
export function gstinCheckChar(first14: string): string | null {
  let sum = 0;
  for (let i = 0; i < first14.length; i++) {
    const v = GSTIN_CHARS.indexOf(first14[i]);
    if (v < 0) return null;
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

/** What is wrong with this GSTIN, in words a shop owner can act on; null when it is valid. */
export function gstinProblem(raw: string, expectState?: string): string | null {
  const g = raw.trim().toUpperCase();
  if (g.length !== 15) return `A GSTIN has 15 letters and digits; this has ${g.length}. Example: 27AAPFU0939F1ZV.`;
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) {
    return 'This is not in the GSTIN pattern: 2 digits (state), 5 letters, 4 digits, 1 letter, 1 letter or digit, the letter Z, then a check character. Example: 27AAPFU0939F1ZV.';
  }
  const state = g.slice(0, 2);
  if (!stateName(state)) return `${state} is not a GST state code.`;
  const ch = gstinCheckChar(g.slice(0, 14));
  if (ch !== g[14]) return `The last character does not match the others (it should be ${ch}). Check the number against the registration certificate.`;
  if (expectState && expectState !== state) return `The GSTIN starts with ${state} (${stateName(state)}) but the state is ${expectState} (${stateName(expectState) ?? ''}).`;
  return null;
}

/** Full check: pattern, real state code and check character (the supplier form only checks the pattern). */
export const isRealGstin = (g: string): boolean => gstinProblem(g) === null;

/** Where a supply is made and what kind it is. */
export interface Supply { place: string; inter: boolean; gstin: string }

/**
 * Place of supply for a bill: the state the cashier chose, else the customer's state (their GSTIN prefix when registered, else the
 * state saved on the customer); a walk-in or a customer with no state is local (the shop's own state).
 */
export function supplyFor(shopState: string, customer: { gstin?: string; stateCode?: string } | undefined, override = ''): Supply {
  let gstin = (customer?.gstin ?? '').trim().toUpperCase();
  if (gstin && !isRealGstin(gstin)) gstin = '';
  let state = customer?.stateCode || (gstin ? gstin.slice(0, 2) : '');
  if (override.trim()) state = override.trim();
  const place = state || shopState;
  return { place, inter: place !== shopState, gstin };
}

/** Set-off of input tax credit against output tax (section 49), same as Rust `set_off`. Arguments and result are [IGST, CGST, SGST]. */
export function setOff(out: [number, number, number], itc: [number, number, number]): [number, number, number] {
  const o = out.map((x) => Math.max(0, x)) as [number, number, number];
  const c = itc.map((x) => Math.max(0, x)) as [number, number, number];
  const take = (ci: number, oi: number) => { const t = Math.min(c[ci], o[oi]); c[ci] -= t; o[oi] -= t; };
  take(0, 0); take(0, 1); take(0, 2); // IGST credit: IGST, CGST, SGST
  take(1, 1); take(1, 0); // CGST credit: CGST, IGST
  take(2, 2); take(2, 0); // SGST credit: SGST, IGST
  return o;
}
