import type { Machine, MillSeed, PunnakuKey } from '@gokul/data';

/** Typed kg or litres ("12.5") to milli-units; empty or bad text is 0. */
export const toMilli = (s: string): number => {
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : 0;
};

/** Milli-units to the text shown in an input ("12.5", "40"), empty for zero. */
export const fromMilli = (m: number): string => (m ? String(Math.round(m) / 1000) : '');

/** Milli-units for display with Indian digit grouping and at most 2 decimals. */
export const fmtQty = (m: number | null | undefined): string => {
  if (m === null || m === undefined) return '';
  const v = m / 1000;
  return v.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: v % 1 ? 1 : 0 });
};

export const seedLabel = (s: MillSeed) => (s === 'groundnut' ? 'Groundnut' : s === 'sesame' ? 'Sesame' : 'Coconut');
export const machineLabel = (m: Machine) => (m === 'W' ? 'W' : 'R');
export const PUNNAKU_LABEL: Record<PunnakuKey, string> = { kadalai_w: 'Kadalai W', kadalai_r: 'Kadalai R', ellu_w: 'Ellu W', ellu_r: 'Ellu R', coco: 'Coco' };

export const longDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
