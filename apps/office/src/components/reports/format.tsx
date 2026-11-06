import { formatQty, type ReportColumn, type ReportRow } from '@gokul/data';
import { Badge, Money, type Tone } from '@gokul/ui';

const badgeTone: Record<string, Tone> = {
  ok: 'success', done: 'success', low: 'warning', running: 'info', critical: 'danger',
};

/** Raw sortable value of a cell */
export const cellValue = (row: ReportRow, key: string) => row[key];

export function formatCell(col: ReportColumn, row: ReportRow, opts: { footer?: boolean } = {}) {
  const v = row[col.key];
  if (v === undefined || v === '') return null;
  switch (col.kind) {
    case 'money': {
      const n = Number(v);
      if (n === 0 && !opts.footer) return <span className="text-subtle">-</span>;
      return <Money paise={n} />;
    }
    case 'int': return Number(v).toLocaleString('en-IN');
    case 'pct': { const n = Number(v); return `${Number.isInteger(n) ? n : n.toFixed(1)}%`; }
    case 'dec1': return Number(v) >= 999 ? <span className="text-subtle">no sales</span> : Number(v).toFixed(1);
    case 'qty': {
      const n = Number(v);
      const unit = col.unitKey ? row[col.unitKey] : undefined;
      return <>{formatQty(n, n % 1000 !== 0)}{unit ? <span className="ml-1 text-subtle">{unit}</span> : null}</>;
    }
    case 'date': {
      const d = new Date(`${v}T00:00:00`);
      return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    }
    case 'badge': return <Badge tone={badgeTone[String(v).toLowerCase()] ?? 'neutral'}>{String(v)}</Badge>;
    default: return String(v);
  }
}

export const isRight = (col: ReportColumn) => col.kind !== 'text' && col.kind !== 'date' && col.kind !== 'badge';

/** "2.6 L" style axis labels with the rupee sign, so they never read as litres */
export function rupeeAxis(paise: number): string {
  const r = Math.abs(paise) / 100;
  const sign = paise < 0 ? '-' : '';
  if (r >= 10000000) return `${sign}₹${trim(r / 10000000)} Cr`;
  if (r >= 100000) return `${sign}₹${trim(r / 100000)} L`;
  if (r >= 1000) return `${sign}₹${trim(r / 1000)}k`;
  return `${sign}₹${Math.round(r)}`;
}
const trim = (n: number) => String(Math.round(n * 10) / 10).replace(/\.0$/, '');
