import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Flame, TriangleAlert } from 'lucide-react';
import { parseQty, pressingMetrics, type Barrel, type PressingBatch, type SeedProfile, type SeedType } from '@gokul/data';
import { Badge, Button, Dialog, Field, Input, NumberInput, Select, cn, useToast } from '@gokul/ui';
import { api } from '../../store';
import { BarrelCard, fmtDate, fmtMilli, fmtNum, gradeTone, useKeys } from './common';

const operators = ['Murugesan', 'Selvam', 'Kannan'];

/* ---------------- new pressing batch ---------------- */
export function PressingForm({ open, profiles, onClose, onSaved }: {
  open: boolean; profiles: SeedProfile[]; onClose: () => void; onSaved: (b: PressingBatch) => void;
}) {
  const toast = useToast();
  const [seed, setSeed] = useState<SeedType>('groundnut');
  const [seedKg, setSeedKg] = useState('');
  const [clean, setClean] = useState('');
  const [jag, setJag] = useState('');
  const [oil, setOil] = useState('');
  const [cake, setCake] = useState('');
  const [chekku, setChekku] = useState('Chekku 1');
  const [operator, setOperator] = useState(operators[0]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setSeed('groundnut'); setSeedKg(''); setClean(''); setJag(''); setOil(''); setCake(''); setChekku('Chekku 1'); setOperator(operators[0]); setErr(''); }
  }, [open]);

  const prof = profiles.find((p) => p.seed === seed);
  const input = useMemo(() => ({
    seed, seedKg: parseQty(seedKg) ?? 0, cleaningLossKg: parseQty(clean) ?? 0, jaggeryKg: prof?.usesJaggery ? parseQty(jag) ?? 0 : 0,
    oilRawL: parseQty(oil) ?? 0, cakeKg: parseQty(cake) ?? 0,
  }), [seed, seedKg, clean, jag, oil, cake, prof]);
  const m = useMemo(() => pressingMetrics(input, prof), [input, prof]);
  const hasOutput = input.oilRawL > 0 && input.seedKg > 0;

  const save = async () => {
    setBusy(true);
    try {
      const b = await api.createPressingBatch({ ...input, chekku, operator });
      toast.show({ tone: 'success', title: `Batch ${b.number} recorded`, detail: `${fmtMilli(b.oilRawL)} L raw ${b.oilName} is now settling.` });
      onSaved(b); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save the batch.'); } finally { setBusy(false); }
  };
  useKeys((e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); } }, open, true);

  const settleOn = prof ? new Date(Date.now() + prof.settleDays * 86400000).toISOString() : '';
  const sugg = (v: number) => String(Math.round(v * 10) / 10);

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="lg" title="New pressing batch" description="Record what went into the chekku and what came out."
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" icon={<Check size={15} />} kbd="Ctrl+S" disabled={busy} onClick={() => void save()}>Save batch</Button></>}
    >
      <div className="grid grid-cols-[1fr_270px] gap-6">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
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
            <Select label="Chekku" value={chekku} onChange={(e) => setChekku(e.target.value)} options={['Chekku 1', 'Chekku 2', 'Chekku 3'].map((v) => ({ value: v, label: v }))} />
            <Select label="Operator" value={operator} onChange={(e) => setOperator(e.target.value)} options={operators.map((v) => ({ value: v, label: v }))} />
          </div>
          {err && <div className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger"><TriangleAlert size={15} className="mt-0.5 shrink-0" />{err}</div>}
          <button type="submit" className="hidden" />
        </form>

        <aside className="self-start rounded-card border border-line bg-surface-2 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><Flame size={13} />Live check</div>
          <div className="mt-3 text-xs text-muted">Yield (oil weight / clean seed)</div>
          <div className="flex items-baseline gap-2">
            <span className={cn('num text-3xl font-semibold', !hasOutput ? 'text-subtle' : m.grade === 'good' ? 'text-success' : m.grade === 'low' ? 'text-warning' : 'text-danger')}>
              {hasOutput ? `${fmtNum(m.yieldPct)}%` : '--'}
            </span>
            {hasOutput && <Badge tone={gradeTone[m.grade]}>{m.variancePct >= 0 ? '+' : ''}{fmtNum(m.variancePct)}% vs norm</Badge>}
          </div>
          <dl className="mt-3 divide-y divide-line/70 text-sm">
            <Row k="Norm yield">{fmtNum(m.normPct)}%</Row>
            <Row k="Norm">{prof?.kgPerL} kg seed per L</Row>
            <Row k="Clean seed pressed">{fmtNum(m.netSeedKg)} kg</Row>
            <Row k="Oil expected">{input.seedKg > 0 ? `${fmtNum(m.expectedOilL)} L` : '--'}</Row>
            <Row k="Per 100 kg seed">{hasOutput ? `${fmtNum(m.litresPer100Kg)} L` : '--'}</Row>
            <Row k="Unaccounted loss">{hasOutput && input.cakeKg > 0 ? `${fmtNum(Math.max(0, m.lossKg))} kg (${fmtNum(Math.max(0, m.lossPct))}%)` : '--'}</Row>
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

/* ---------------- move settled oil to a barrel ---------------- */
export function MoveToBarrelDialog({ batch, barrels, onClose, onDone }: {
  batch: PressingBatch | null; barrels: Barrel[]; onClose: () => void; onDone: (b: PressingBatch) => void;
}) {
  const toast = useToast();
  const [clear, setClear] = useState('');
  const [barrelId, setBarrelId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const saveRef = useRef<() => void>(() => undefined);
  useKeys((e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveRef.current(); } }, !!batch, true);

  useEffect(() => {
    if (!batch) return;
    setClear(String(Math.round((batch.oilRawL * 0.965) / 100) / 10));
    setErr('');
    const fit = barrels.find((b) => b.seed === batch.seed && b.capacityL - b.levelL >= batch.oilRawL * 0.9) ?? barrels.find((b) => b.seed === null);
    setBarrelId(fit?.id ?? null);
  }, [batch, barrels]);
  if (!batch) return null;

  const clearMilli = parseQty(clear) ?? 0;
  const ok = (b: Barrel) => (b.seed === null || b.seed === batch.seed) && b.capacityL - b.levelL >= clearMilli;
  const barrel = barrels.find((b) => b.id === barrelId);
  const sediment = batch.oilRawL - clearMilli;

  const save = async () => {
    if (!barrelId) { setErr('Choose a barrel.'); return; }
    setBusy(true);
    try {
      const b = await api.moveBatchToBarrel({ batchId: batch.id, barrelId, clearOilL: clearMilli });
      toast.show({ tone: 'success', title: 'Oil moved to barrel', detail: `${fmtMilli(clearMilli)} L ${b.oilName} into ${b.barrelLabel}. Loose stock updated.` });
      onDone(b); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not move the oil.'); } finally { setBusy(false); }
  };
  saveRef.current = () => void save();

  return (
    <Dialog
      open onOpenChange={(o) => !o && onClose()} size="md" title="Filter and move to barrel" description={`${batch.number}, ${batch.seedLabel}, ${fmtMilli(batch.oilRawL)} L raw oil`}
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" icon={<Check size={15} />} kbd="Ctrl+S" disabled={busy || !barrelId} onClick={() => void save()}>Move oil</Button></>}
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Clear oil after filtering (L)"><NumberInput data-autofocus value={clear} onValueChange={(v) => { setClear(v); setErr(''); }} onFocus={(e) => e.currentTarget.select()} /></Field>
          <Input label="Sediment (kasadu) left" readOnly value={`${fmtMilli(Math.max(0, sediment))} L (${fmtNum(batch.oilRawL ? (Math.max(0, sediment) / batch.oilRawL) * 100 : 0)}%)`} />
        </div>
        <div>
          <span className="text-xs font-medium text-muted">Barrel (one oil per barrel)</span>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {barrels.map((b) => <BarrelCard key={b.id} barrel={b} selected={barrelId === b.id} disabled={!ok(b)} onClick={() => setBarrelId(b.id)} />)}
          </div>
        </div>
        {barrel && <div className="rounded-card border border-line bg-surface-2 px-3 py-2 text-sm text-muted"><span className="font-medium text-ink">{barrel.label}</span> will hold <span className="num font-semibold text-ink">{fmtMilli(barrel.levelL + clearMilli)} L</span> of 200 L after this.</div>}
        {err && <div className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger"><TriangleAlert size={15} className="mt-0.5 shrink-0" />{err}</div>}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
