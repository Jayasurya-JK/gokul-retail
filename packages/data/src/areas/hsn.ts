import type { MockStore } from './store';
import dictionary from '../hsn/dictionary.json';
import { enabledRates } from '../gst';

/**
 * The HSN helper. The Rust core (crates/core/src/hsn.rs) is the source of truth; this is the browser-preview twin, using the same
 * keyword dictionary (../hsn/dictionary.json) and the same matching rules, proved by ../hsn/match_cases.json (scripts/hsn-checks.mjs).
 *
 * Nothing is applied by a suggestion: `suggestHsn` and `previewHsnImport` only read; `applyHsn` writes exactly the rows the owner
 * confirmed. Every suggested GST rate is a hint to verify with the CA.
 */
export type HsnConfidence = 'high' | 'medium' | 'low';

export interface HsnSuggestion {
  hsn: string;
  desc: string;
  confidence: HsnConfidence;
  /** Suggested GST rate to verify with the CA; null = none suggested */
  rate: number | null;
  rateNote: string;
  /** The words of the name that matched */
  matched: string;
  alternatives: { hsn: string; desc: string }[];
}

export interface HsnItemRow {
  itemId: string; code: string; name: string; category: string;
  /** Current HSN as saved (may be empty or not 4, 6 or 8 digits) */
  hsn: string; gstRate: number; missing: boolean;
  suggestion: HsnSuggestion | null;
}

export interface HsnSuggestResult {
  rows: HsnItemRow[];
  stats: { listed: number; withSuggestion: number; withoutSuggestion: number; missingTotal: number; agree: number; differ: number };
}

export interface HsnUpdate { itemId: string; hsn: string; /** Set the GST rate too (only when the owner ticked it) */ gstRate?: number }

export interface HsnImportRow { key: string; hsn: string; gstRate?: number }
export type HsnImportStatus = 'ok' | 'same' | 'unmatched' | 'ambiguous' | 'invalid';
export interface HsnImportPreviewRow {
  index: number; key: string; status: HsnImportStatus; message: string;
  itemId: string | null; code: string | null; name: string | null; currentHsn: string | null; currentRate: number | null;
  newHsn: string; newRate: number | null;
}
export interface HsnImportPreview { rows: HsnImportPreviewRow[]; stats: { ok: number; same: number; problems: number; total: number } }

export interface HsnApi {
  /** Suggestions for items, by default only those whose HSN is missing or not 4, 6 or 8 digits. Reads only. */
  suggestHsn(opts?: { onlyMissing?: boolean; includeInactive?: boolean }): Promise<HsnSuggestResult>;
  /** Writes the confirmed rows in one step (any bad row: nothing is written). Needs permission to manage items. */
  applyHsn(updates: HsnUpdate[]): Promise<{ ok: true; applied: number; ratesChanged: number }>;
  /** Matches a collected file (item name or code, HSN, GST rate) to items and says what would change. Reads only. */
  previewHsnImport(rows: HsnImportRow[]): Promise<HsnImportPreview>;
}

/* ------------------------------------------------------------------ matcher */

interface Entry {
  id: string; hsn: string; desc: string; keywords: string[]; exclude?: string[]; rate: number | null; rateNote: string;
  base: 'high' | 'medium' | 'low'; kind?: string; alt?: { hsn: string; desc: string }[];
}
const ENTRIES = (dictionary as { entries: Entry[] }).entries;

/** Lower case, every run of non-letters and non-digits becomes one space. */
export const normalizeText = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s: string): string[] => normalizeText(s).split(' ').filter(Boolean);

/** Whole-word match: the keyword's words appear one after another in the name. */
function containsRun(name: string[], kw: string[]): boolean {
  if (!kw.length || name.length < kw.length) return false;
  for (let i = 0; i + kw.length <= name.length; i++) if (kw.every((w, j) => name[i + j] === w)) return true;
  return false;
}

/** A plain description for an HSN code: the dictionary's wording for the first entry with that code (or its first four digits). */
export function descForHsn(hsn: string): string {
  const h = hsn.trim();
  const e = ENTRIES.find((x) => x.hsn === h) ?? (h.length > 4 ? ENTRIES.find((x) => x.hsn === h.slice(0, 4)) : undefined);
  return e?.desc ?? '';
}

export const hsnOk = (h: string): boolean => /^(\d{4}|\d{6}|\d{8})$/.test(h.trim());

export function suggestHsnFor(name: string): HsnSuggestion | null {
  const nt = tokens(name);
  if (!nt.length) return null;
  let hits: { score: number; e: Entry; kw: string }[] = [];
  for (const e of ENTRIES) {
    if ((e.exclude ?? []).some((x) => containsRun(nt, tokens(x)))) continue;
    let best: { score: number; kw: string } | null = null;
    for (const k of e.keywords) {
      const kt = tokens(k);
      if (!containsRun(nt, kt)) continue;
      const nk = normalizeText(k);
      const score = kt.length * 100 + nk.length;
      if (!best || score > best.score || (score === best.score && nk > best.kw)) best = { score, kw: nk };
    }
    if (best) hits.push({ score: best.score, e, kw: best.kw });
  }
  // a bottle, tin or can is only the pack: it never wins over the goods inside
  if (hits.some((h) => h.e.kind !== 'pack')) hits = hits.filter((h) => h.e.kind !== 'pack');
  hits.sort((a, b) => b.score - a.score || (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0));
  const top = hits[0];
  if (!top) return null;
  const { e, score, kw } = top;
  let conf: HsnConfidence = e.base === 'low' ? 'low' : e.base === 'medium' ? 'medium' : kw.split(' ').length >= 2 || kw.length >= 4 ? 'high' : 'medium';
  const alternatives: { hsn: string; desc: string }[] = [];
  let ambiguous = false;
  for (const o of hits.slice(1)) {
    // the one-word "oil" fallback is only a last resort; it is never offered as an alternative
    if (o.e.hsn !== e.hsn && o.e.base !== 'low') {
      if (!alternatives.some((a) => a.hsn === o.e.hsn)) alternatives.push({ hsn: o.e.hsn, desc: o.e.desc });
      if (score - o.score < 100) ambiguous = true;
    }
  }
  if (ambiguous) conf = conf === 'high' ? 'medium' : 'low';
  for (const a of e.alt ?? []) if (a.hsn !== e.hsn && !alternatives.some((x) => x.hsn === a.hsn)) alternatives.push(a);
  return { hsn: e.hsn, desc: e.desc, confidence: conf, rate: e.rate, rateNote: e.rateNote, matched: kw, alternatives };
}

/* ------------------------------------------------------------------ mock */

export function createHsnMock(store: MockStore): HsnApi {
  const real = (i: { id: string }) => !i.id.startsWith('_');
  return {
    suggestHsn: async (opts = {}) => {
      const onlyMissing = opts.onlyMissing ?? true;
      const rows: HsnItemRow[] = [];
      let withS = 0, withoutS = 0, missingTotal = 0, agree = 0, differ = 0;
      const items = [...store.items].filter(real).sort((a, b) => a.name.localeCompare(b.name));
      for (const i of items) {
        if (!i.active && !opts.includeInactive) continue;
        const missing = !hsnOk(i.hsn);
        if (missing) missingTotal += 1;
        if (onlyMissing && !missing) continue;
        const s = suggestHsnFor(i.name);
        if (s) withS += 1; else withoutS += 1;
        if (s && !missing) { if (s.hsn.startsWith(i.hsn.trim()) || i.hsn.trim().startsWith(s.hsn)) agree += 1; else differ += 1; }
        rows.push({ itemId: i.id, code: i.code, name: i.name, category: i.category, hsn: i.hsn, gstRate: i.gstRate, missing, suggestion: s });
      }
      return { rows, stats: { listed: rows.length, withSuggestion: withS, withoutSuggestion: withoutS, missingTotal, agree, differ } };
    },
    applyHsn: async (updates) => {
      if (!updates.length) throw new Error('Nothing is ticked. Tick the items to update.');
      const allowed = store.taxRates ?? enabledRates();
      for (const u of updates) {
        if (!hsnOk(u.hsn)) throw new Error(`HSN '${u.hsn.trim()}' is not valid: use 4, 6 or 8 digits, for example 1508. Nothing was changed.`);
        if (u.gstRate !== undefined && !allowed.includes(u.gstRate)) throw new Error(`GST rate ${u.gstRate}% is not in the GST rate list.`);
        if (!store.items.some((i) => i.id === u.itemId)) throw new Error('An item in the list no longer exists. Nothing was changed.');
      }
      let ratesChanged = 0;
      for (const u of updates) {
        const it = store.items.find((i) => i.id === u.itemId)!;
        it.hsn = u.hsn.trim();
        if (u.gstRate !== undefined && u.gstRate !== it.gstRate) { it.gstRate = u.gstRate; ratesChanged += 1; }
      }
      return { ok: true as const, applied: updates.length, ratesChanged };
    },
    previewHsnImport: async (rows) => {
      const items = store.items.filter(real);
      const byName = new Map<string, typeof items>();
      for (const i of items) byName.set(normalizeText(i.name), [...(byName.get(normalizeText(i.name)) ?? []), i]);
      const allowed = store.taxRates ?? enabledRates();
      const out: HsnImportPreviewRow[] = [];
      let ok = 0, same = 0, bad = 0;
      rows.forEach((r, index) => {
        const key = r.key.trim();
        const hsn = r.hsn.trim().replace(/ /g, '');
        let item: (typeof items)[number] | undefined;
        let miss: 'ambiguous' | 'unmatched' | 'no key' | null = null;
        if (!key) miss = 'no key';
        else {
          item = items.find((i) => i.code === key || i.barcode === key || i.id === key);
          if (!item) {
            const m = byName.get(normalizeText(key));
            if (m && m.length === 1) item = m[0]; else miss = m && m.length > 1 ? 'ambiguous' : 'unmatched';
          }
        }
        let status: HsnImportStatus; let message = '';
        if (miss === 'ambiguous') { status = 'ambiguous'; message = 'More than one item has this name. Use the item code.'; }
        else if (miss === 'unmatched') { status = 'unmatched'; message = 'No item with this code or name.'; }
        else if (miss || !item) { status = 'invalid'; message = 'no item name or code'; }
        else if (!hsnOk(hsn)) { status = 'invalid'; message = `HSN '${r.hsn.trim()}' is not 4, 6 or 8 digits.`; }
        else if (r.gstRate !== undefined && !allowed.includes(r.gstRate)) { status = 'invalid'; message = `GST rate ${r.gstRate}% is not in the GST rate list.`; }
        else if (item.hsn.trim() === hsn && (r.gstRate === undefined || r.gstRate === item.gstRate)) { status = 'same'; message = 'Already has these values.'; }
        else status = 'ok';
        if (status === 'ok') ok += 1; else if (status === 'same') same += 1; else bad += 1;
        out.push({
          index, key: r.key, status, message, itemId: item?.id ?? null, code: item?.code ?? null, name: item?.name ?? null,
          currentHsn: item?.hsn ?? null, currentRate: item?.gstRate ?? null, newHsn: hsn, newRate: r.gstRate ?? null,
        });
      });
      return { rows: out, stats: { ok, same, problems: bad, total: rows.length } };
    },
  };
}
