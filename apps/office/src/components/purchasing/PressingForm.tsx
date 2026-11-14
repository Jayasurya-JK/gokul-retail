import { useEffect, useMemo, useState } from 'react';
import { Check, Flame, TriangleAlert } from 'lucide-react';
import {
  parseQty, pressingMetrics, type GodownBarrel, type PressingBatch, type SeedProfile, type SeedType,
} from '@gokul/data';
import { Badge, Button, Dialog, Field, NumberInput, Select, cn, useToast } from '@gokul/ui';
import { api } from '../../store';
import { EntryDate, fmtDate, fmtMilli, fmtNum, normPer100, todayYmd, useEntryDate, useKeys, vsNormText, yieldTextCls, yieldTone } from './common';

/* ---------------- new pressing batch ---------------- */
export function PressingForm({ open, profiles, barrels, onClose, onSaved }: {
  open: boolean; profiles: SeedProfile[]; barrels: GodownBarrel[]; onClose: () => void; onSaved: (b: PressingBatch) => void;
}) {
  const toast = useToast();
  const [seed, setSeed] = useState<SeedType>('groundnut');
  const [seedKg, setSeedKg] = useState('');
  const [clean, setClean] = useState('');
  const [jag, setJag] = useState('');
  const [oil, setOil] = useState('');
  const [cake, setCake] = useState('');
  const [machine, setMachine] = useState<'W' | 'R'>('W');
  const [chekku, setChekku] = useState('Chekku 1');
  const [operators, setOperators] = useState<string[]>([]);
  const [operator, setOperator] = useState('');
  const entry = useEntryDate();
  const resetEntry = entry.reset;
  const [barrelId, setBarrelId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSeed('groundnut'); setSeedKg(''); setClean(''); setJag(''); setOil(''); setCake('');
      setMachine('W'); setChekku('Chekku 1'); setBarrelId(''); setErr(''); resetEntry();
      void api.getSettingsBundle().then((b) => { setOperators(b.mill.operators); setOperator(b.mill.operators[0] ?? ''); }).catch(() => undefined);
    }
  }, [open, resetEntry]);

  const prof = profiles.find((p) => p.seed === seed);
  const input = useMemo(() => ({
    seed, seedKg: parseQty(seedKg) ?? 0, cleaningLossKg: parseQty(clean) ?? 0, jaggeryKg: prof?.usesJaggery ? parseQty(jag) ?? 0 : 0,
    oilRawL: parseQty(oil) ?? 0, cakeKg: parseQty(cake) ?? 0,
  }), [seed, seedKg, clean, jag, oil, cake, prof]);
  const m = useMemo(() => pressingMetrics(input, prof), [input, prof]);
  const hasOutput = input.oilRawL > 0 && input.seedKg > 0;

  // Only a barrel of the same oil that is still filling (or empty) can take this batch.
  const fillable = useMemo(
    () => barrels.filter((b) => b.active && b.oil === seed && (b.status === 'filling' || b.status === 'empty')),
    [barrels, seed],
  );
  useEffect(() => {
    if (!open) return;
    setBarrelId((cur) => (fillable.some((b) => b.id === cur) ? cur : fillable[0]?.id ?? ''));
  }, [open, fillable]);

  const barrel = fillable.find((b) => b.id === barrelId) ?? null;
  const freeL = barrel ? barrel.capacityL - barrel.levelL : 0;
  const overFill = barrel !== null && input.oilRawL > freeL;

  const save = async () => {
    if (!operator) { setErr('Choose the operator. Add operators in Settings if the list is empty.'); return; }
    if (!entry.day) { setErr('Enter the date of the pressing.'); return; }
    if (entry.day > todayYmd()) { setErr('The date cannot be in the future.'); return; }
    if (!barrel) { setErr(`Choose the godown ${prof?.label ?? ''} barrel the oil goes into. Add one in the Godown tab if there is none.`); return; }
    if (input.oilRawL > freeL) { setErr(`${barrel.label} has room for only ${fmtMilli(freeL)} L. Pick another barrel or record a stick reading first.`); return; }
    setBusy(true); setErr('');
    try {
      const b = await api.createPressingBatch({ ...input, chekku, operator, machine, godownBarrelId: barrel.id, ...entry.when });
      toast.show({
        tone: 'success',
        title: `Batch ${b.number} recorded`,
        detail: `${fmtMilli(b.oilRawL)} L raw ${b.oilName} into ${barrel.label}. It settles before the transfer to store.`,
      });
      onSaved(b); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save the batch.'); } finally { setBusy(false); }
  };
  useKeys((e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); } }, open, true);

  const settleOn = prof && entry.day ? new Date(new Date(`${entry.day}T${entry.time || '12:00'}`).getTime() + prof.settleDays * 86400000).toISOString() : '';
  const sugg = (v: number) => String(Math.round(v * 10) / 10);

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="lg" title="Batch with details" description="Record what went into the chekku and what came out, on the day it happened."
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" icon={<Check size={15} />} kbd="Ctrl+S" disabled={busy || !barrel || overFill} onClick={() => void save()}>Save batch</Button></>}
    >
      <div className="grid grid-cols-[1fr_270px] gap-6">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <EntryDate entry={entry} label="Date of pressing" />
          <div>
            <span className="text-xs font-medium text-muted">Seed</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {profiles.map((p) => (
                <button
                  key={p.seed} type="button" onClick={() => setSeed(p.seed)} data-autofocus={p.seed === 'groundnut' ? true : undefined}
                  className={cn('rounded-card border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary/50', seed === p.seed ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-subtle')}
                >
                  <div className="text-sm font-semibold text-ink">{p.label}</div>
                  <div className="num text-xs text-muted">{fmtMilli(p.stock, 0)} kg in godown</div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            <Field label="Seed taken from godown (kg)"><NumberInput value={seedKg} onValueChange={(v) => { setSeedKg(v); setErr(''); }} placeholder={seed === 'groundnut' ? '400' : '200'} /></Field>
            <Field label="Cleaning loss (kg)" hint="Stones, dust, bad seed. Usually 1 to 2.5%."><NumberInput value={clean} onValueChange={setClean} placeholder="0" /></Field>
            {prof?.usesJaggery && (
              <Field label="Palm jaggery added (kg)" hint={input.seedKg > 0 ? `About ${sugg(input.seedKg / 10000)} kg is usual (10%)` : 'Karupatti goes in with sesame'}>
                <NumberInput value={jag} onValueChange={setJag} placeholder="0" />
              </Field>
            )}
            <Field label="Raw oil out (L)"><NumberInput value={oil} onValueChange={(v) => { setOil(v); setErr(''); }} placeholder={prof ? sugg(input.seedKg > 0 ? m.expectedOilL : 100) : ''} /></Field>
            <Field label="Oil cake out (kg)"><NumberInput value={cake} onValueChange={setCake} placeholder="0" /></Field>
            <div>
              <span className="text-xs font-medium text-muted">Machine</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(['W', 'R'] as const).map((k) => (
                  <button
                    key={k} type="button" onClick={() => setMachine(k)} aria-pressed={machine === k}
                    className={cn('rounded-control border px-2.5 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary/50', machine === k ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-subtle')}
                  >
                    <div className="text-sm font-semibold text-ink">{k}</div>
                    <div className="text-[11px] text-muted">{k === 'W' ? 'Wood-pressed' : 'Rotary'}</div>
                  </button>
                ))}
              </div>
            </div>
            <Select label="Chekku" value={chekku} onChange={(e) => setChekku(e.target.value)} options={['Chekku 1', 'Chekku 2', 'Chekku 3'].map((v) => ({ value: v, label: v }))} />
            <Select label="Operator" value={operator} onChange={(e) => setOperator(e.target.value)} options={operators.length ? operators.map((v) => ({ value: v, label: v })) : [{ value: '', label: 'Add operators in Settings' }]} />
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="shrink-0 text-xs font-medium text-muted">Godown barrel</span>
              <span className="pl-2 text-right text-[11px] text-subtle">The oil stays in the godown; it reaches the shop only by Transfer to store.</span>
            </div>
            {fillable.length === 0 ? (
              <p className="mt-1 rounded-control bg-warning-soft px-2.5 py-2 text-xs text-warning">
                No filling or empty {prof?.label ?? ''} barrel in the godown. Add one in the Godown tab, or finish a settling barrel first.
              </p>
            ) : (
              <div className="mt-1 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
                {fillable.map((b) => {
                  const free = b.capacityL - b.levelL;
                  const tight = input.oilRawL > 0 && input.oilRawL > free;
                  return (
                    <button
                      key={b.id} type="button" onClick={() => { setBarrelId(b.id); setErr(''); }} aria-pressed={barrelId === b.id}
                      className={cn(
                        'rounded-card border bg-surface px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary/50',
                        barrelId === b.id ? 'border-primary bg-primary-soft' : 'border-line hover:border-subtle',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{b.label}</span>
                        <Badge tone={b.status === 'empty' ? 'neutral' : 'info'}>{b.status === 'empty' ? 'Empty' : 'Filling'}</Badge>
                      </div>
                      <div className="num mt-1 flex items-center justify-between gap-2 text-[11px] text-muted">
                        <span>{fmtMilli(b.levelL)} / {fmtMilli(b.capacityL, 0)} L</span>
                        <span className={cn(tight && 'font-semibold text-warning')}>{fmtMilli(free)} L free</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {overFill && barrel && (
            <div className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-sm text-warning">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" />
              This batch has {fmtMilli(input.oilRawL)} L of oil but {barrel.label} has room for only {fmtMilli(freeL)} L. Pick another barrel.
            </div>
          )}
          {err && <div className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger"><TriangleAlert size={15} className="mt-0.5 shrink-0" />{err}</div>}
          <button type="submit" className="hidden" />
        </form>

        <aside className="self-start rounded-card border border-line bg-surface-2 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><Flame size={13} />Live check</div>
          <div className="mt-3 text-xs text-muted">Yield (litres of oil from 100 kg of seed)</div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={cn('num text-3xl font-semibold', yieldTextCls(m.variancePct, hasOutput))}>
              {hasOutput ? fmtNum(m.litresPer100Kg) : '--'}
            </span>
            <span className="text-sm text-muted">L / 100 kg</span>
            {hasOutput && <Badge tone={yieldTone(m.variancePct)}>{vsNormText(m.variancePct)}</Badge>}
          </div>
          <dl className="mt-3 divide-y divide-line/70 text-sm">
            <Row k="Norm">{fmtNum(normPer100(m))} L / 100 kg ({prof?.kgPerL} kg seed per L)</Row>
            <Row k="Clean seed pressed">{fmtNum(m.netSeedKg)} kg</Row>
            <Row k="Oil expected">{input.seedKg > 0 ? `${fmtNum(m.expectedOilL)} L` : '--'}</Row>
            <Row k="Unaccounted loss">{hasOutput && input.cakeKg > 0 ? `${fmtNum(Math.max(0, m.lossKg))} kg (${fmtNum(Math.max(0, m.lossPct))}%)` : '--'}</Row>
            <Row k="Machine">{machine === 'W' ? 'W · Wood-pressed' : 'R · Rotary'}</Row>
            <Row k="Godown barrel">{barrel ? barrel.label : '--'}</Row>
            <Row k="Room left">{barrel ? `${fmtMilli(freeL)} L` : '--'}</Row>
            <Row k="Ready to filter">{settleOn ? fmtDate(settleOn) : '--'}</Row>
          </dl>
          {hasOutput && m.grade !== 'good' && (
            <p className={cn('mt-3 rounded-control px-2.5 py-2 text-xs', m.grade === 'poor' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
              {m.grade === 'poor' ? 'Yield is well below the norm. Check seed moisture, chekku speed and the oil weight before saving.' : 'Yield is a little below the norm. Worth a look at the seed lot.'}
            </p>
          )}
        </aside>
      </div>
    </Dialog>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2 py-1.5"><dt className="text-muted">{k}</dt><dd className="num text-right font-medium text-ink">{children}</dd></div>;
}
