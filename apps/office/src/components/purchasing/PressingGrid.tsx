import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { parseQty, pressingMetrics, type GodownBarrel, type PressingBatch, type SeedProfile, type SeedType } from '@gokul/data';
import { Badge, Button, Kbd, cn, useToast } from '@gokul/ui';
import { api } from '../../store';
import { fmtNum, normPer100, signedPct, yieldTone } from './common';

interface Row { operator: string; seed: SeedType; machine: 'W' | 'R'; kg: string; oil: string; cake: string; jag: string; barrel: string }

const cell = 'h-8 w-full rounded-control border border-line-strong bg-surface px-2 text-sm text-ink focus:border-primary focus:ring-2 focus:ring-primary/25';
const num = `${cell} num text-right`;
const th = 'px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted';
const COLS = 8; // operator, seed, machine, kg, oil, cake, vellam, barrel

/**
 * The one place to enter pressing: one row per operator run, like the old paper sheet. Every complete row becomes a real batch the
 * moment it is saved (all rows or none), and the oil goes straight into a godown barrel. Enter moves to the next cell, Ctrl+Enter saves.
 */
export function PressingGrid({ profiles, barrels, operators, onSaved }: {
  profiles: SeedProfile[]; barrels: GodownBarrel[]; operators: string[]; onSaved: (b: PressingBatch[]) => void;
}) {
  const toast = useToast();
  const today = new Date().toLocaleDateString('en-CA');
  const [day, setDay] = useState(today);
  const fillable = (seed: SeedType) => barrels.filter((b) => b.active && b.oil === seed && (b.status === 'filling' || b.status === 'empty'));
  const blank = (op?: string, seed: SeedType = 'groundnut', machine: 'W' | 'R' = 'W'): Row => ({
    operator: op ?? operators[0] ?? '', seed, machine, kg: '', oil: '', cake: '', jag: '', barrel: fillable(seed)[0]?.id ?? '',
  });
  const [rows, setRows] = useState<Row[]>(() => [blank(), blank(), blank()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const root = useRef<HTMLDivElement>(null);

  // operators and barrels arrive after the first render: fill the empty defaults in
  useEffect(() => {
    setRows((rs) => rs.map((r) => ({
      ...r,
      operator: r.operator || operators[0] || '',
      barrel: r.barrel && fillable(r.seed).some((b) => b.id === r.barrel) ? r.barrel : fillable(r.seed)[0]?.id ?? '',
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operators, barrels]);

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => {
    if (k !== i) return r;
    const n = { ...r, ...patch };
    if (patch.seed) n.barrel = fillable(patch.seed)[0]?.id ?? '';
    if (patch.seed && patch.seed !== 'sesame') n.jag = '';
    return n;
  }));

  const live = useMemo(() => rows.map((r) => {
    const prof = profiles.find((p) => p.seed === r.seed);
    const seedKg = parseQty(r.kg) ?? 0; const oil = parseQty(r.oil) ?? 0;
    if (!prof || seedKg <= 0 || oil <= 0) return null;
    return pressingMetrics({ seed: r.seed, seedKg, cleaningLossKg: 0, jaggeryKg: parseQty(r.jag) ?? 0, oilRawL: oil, cakeKg: parseQty(r.cake) ?? 0 }, prof);
  }), [rows, profiles]);

  const used = (r: Row) => !!(r.kg.trim() || r.oil.trim() || r.cake.trim() || r.jag.trim());
  const complete = (r: Row) => (parseQty(r.kg) ?? 0) > 0 && (parseQty(r.oil) ?? 0) > 0 && !!r.operator && !!r.barrel;
  const ready = rows.filter((r) => used(r) && complete(r));
  // vellam is only used with sesame, so its column appears only when a sesame row is there (saves width)
  const showJag = rows.some((r) => r.seed === 'sesame');

  const focusCell = (r: number, c: number) => root.current?.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`)?.focus();
  const onKey = (e: KeyboardEvent, r: number, c: number) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    for (let k = c + 1; k < COLS; k++) {
      const el = root.current?.querySelector<HTMLElement>(`[data-cell="${r}-${k}"]:not(:disabled)`);
      if (el) { el.focus(); return; }
    }
    if (r === rows.length - 1) {
      setRows((rs) => [...rs, blank(rs[r].operator, rs[r].seed, rs[r].machine)]);
      setTimeout(() => focusCell(r + 1, 3), 30);
    } else focusCell(r + 1, 3);
  };

  const save = async () => {
    setErr('');
    const partial = rows.findIndex((r) => used(r) && !complete(r));
    if (partial >= 0) {
      const r = rows[partial];
      setErr(`Row ${partial + 1}: ${!r.operator ? 'choose the operator.' : !(parseQty(r.kg) ?? 0) ? 'enter the seed kg.' : !(parseQty(r.oil) ?? 0) ? 'enter the oil that came out.' : `choose the godown ${r.seed} barrel (add one in the Godown tab).`}`);
      return;
    }
    if (ready.length === 0) { setErr('Enter at least one row: seed kg and oil out.'); return; }
    setBusy(true);
    try {
      const saved = await api.createPressingBatches({
        day: day === today ? undefined : day,
        rows: ready.map((r) => ({
          seed: r.seed, seedKg: parseQty(r.kg) ?? 0, cleaningLossKg: 0, jaggeryKg: parseQty(r.jag) ?? 0, oilRawL: parseQty(r.oil) ?? 0,
          cakeKg: parseQty(r.cake) ?? 0, chekku: `${r.machine === 'R' ? 'Rotary' : 'Chekku'} ${r.operator}`, operator: r.operator, machine: r.machine, godownBarrelId: r.barrel,
        })),
      });
      toast.show({ tone: 'success', title: `${saved.length} pressing batch${saved.length === 1 ? '' : 'es'} saved`, detail: 'The oil is in the godown barrels.' });
      setRows([blank(rows[0]?.operator), blank(rows[0]?.operator), blank(rows[0]?.operator)]);
      onSaved(saved);
      setTimeout(() => focusCell(0, 3), 30);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the rows');
    } finally { setBusy(false); }
  };

  return (
    <div ref={root} className="shrink-0 border-b border-line bg-surface px-4 py-2" role="group" aria-label="Enter pressing">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="whitespace-nowrap">Enter pressing</span>
          <span className="hidden text-xs font-normal text-muted 2xl:inline">one row per operator run. Enter goes to the next box.</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted">Day
            <input type="date" className={cn(cell, 'num h-7 w-[128px]')} value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Day of the pressing" />
          </label>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setRows((rs) => [...rs, blank(rs[rs.length - 1]?.operator)])}>Add row</Button>
          <Button size="sm" variant="primary" icon={<Check size={14} />} disabled={busy || ready.length === 0} onClick={() => void save()}>
            Save {ready.length || ''} {ready.length === 1 ? 'row' : 'rows'} <Kbd>Ctrl+Enter</Kbd>
          </Button>
        </div>
      </div>
      <div className="max-h-[150px] overflow-auto">
        <table className="w-full min-w-[800px] table-fixed">
          <thead>
            <tr>
              <th className={cn(th, 'w-[116px]')}>Operator</th>
              <th className={cn(th, 'w-[104px]')}>Seed</th>
              <th className={cn(th, 'w-[100px]')}>Machine</th>
              <th className={cn(th, 'w-[72px] text-right')}>Seed kg</th>
              <th className={cn(th, 'w-[72px] text-right')}>Oil L</th>
              <th className={cn(th, 'w-[72px] text-right')}>Cake kg</th>
              {showJag && <th className={cn(th, 'w-[72px] text-right')}>Vellam kg</th>}
              <th className={cn(th, 'w-[164px]')}>Godown barrel</th>
              <th className={cn(th, 'whitespace-nowrap')}>Yield vs norm</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const m = live[i];
              const opts = fillable(r.seed);
              return (
                <tr key={i}>
                  <td className="p-0.5">
                    <select data-cell={`${i}-0`} className={cell} value={r.operator} onChange={(e) => set(i, { operator: e.target.value })} onKeyDown={(e) => onKey(e, i, 0)} aria-label={`Row ${i + 1} operator`}>
                      {operators.length === 0 && <option value="">Add operators in Settings</option>}
                      {operators.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="p-0.5">
                    <select data-cell={`${i}-1`} className={cell} value={r.seed} onChange={(e) => set(i, { seed: e.target.value as SeedType })} onKeyDown={(e) => onKey(e, i, 1)} aria-label={`Row ${i + 1} seed`}>
                      {profiles.map((p) => <option key={p.seed} value={p.seed}>{p.label.split(' ')[0]}</option>)}
                    </select>
                  </td>
                  <td className="p-0.5">
                    <select data-cell={`${i}-2`} className={cell} value={r.machine} onChange={(e) => set(i, { machine: e.target.value as 'W' | 'R' })} onKeyDown={(e) => onKey(e, i, 2)} aria-label={`Row ${i + 1} machine`}>
                      <option value="W">W chekku</option><option value="R">R rotary</option>
                    </select>
                  </td>
                  <td className="p-0.5"><input data-cell={`${i}-3`} className={num} inputMode="decimal" value={r.kg} onChange={(e) => set(i, { kg: e.target.value })} onKeyDown={(e) => onKey(e, i, 3)} aria-label={`Row ${i + 1} seed kg`} /></td>
                  <td className="p-0.5"><input data-cell={`${i}-4`} className={num} inputMode="decimal" value={r.oil} onChange={(e) => set(i, { oil: e.target.value })} onKeyDown={(e) => onKey(e, i, 4)} aria-label={`Row ${i + 1} oil litres`} /></td>
                  <td className="p-0.5"><input data-cell={`${i}-5`} className={num} inputMode="decimal" value={r.cake} onChange={(e) => set(i, { cake: e.target.value })} onKeyDown={(e) => onKey(e, i, 5)} aria-label={`Row ${i + 1} cake kg`} /></td>
                  {showJag && (
                  <td className="p-0.5">
                    <input
                      data-cell={`${i}-6`} className={cn(num, r.seed !== 'sesame' && 'bg-surface-2 text-subtle')} inputMode="decimal" value={r.jag} disabled={r.seed !== 'sesame'}
                      placeholder={r.seed === 'sesame' ? '' : 'n/a'} onChange={(e) => set(i, { jag: e.target.value })} onKeyDown={(e) => onKey(e, i, 6)} aria-label={`Row ${i + 1} vellam kg`}
                    />
                  </td>
                  )}
                  <td className="p-0.5">
                    <select data-cell={`${i}-7`} className={cell} value={r.barrel} onChange={(e) => set(i, { barrel: e.target.value })} onKeyDown={(e) => onKey(e, i, 7)} aria-label={`Row ${i + 1} godown barrel`}>
                      {opts.length === 0 && <option value="">No barrel filling</option>}
                      {opts.map((b) => <option key={b.id} value={b.id}>{b.label} · {fmtNum((b.capacityL - b.levelL) / 1000, 0)} L free</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-0.5 text-sm">
                    {m ? (
                      <span className="flex items-center gap-2">
                        <span className="num text-ink">{fmtNum(m.litresPer100Kg)} L / 100 kg</span>
                        <Badge tone={yieldTone(m.variancePct)} >{signedPct(m.variancePct)}</Badge>
                        <span className="num hidden text-xs text-subtle 2xl:inline">norm {fmtNum(normPer100(m))}</span>
                      </span>
                    ) : <span className="text-subtle">-</span>}
                  </td>
                  <td className="p-0.5 text-center">
                    {rows.length > 1 && (
                      <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-danger" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} aria-label={`Remove row ${i + 1}`} title="Remove this row">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {err && <div className="mt-1 text-sm text-danger" role="alert">{err}</div>}
    </div>
  );
}
