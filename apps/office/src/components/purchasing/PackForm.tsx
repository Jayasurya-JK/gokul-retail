import { useEffect, useMemo, useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { PACK_WASTAGE_NORM_PCT, packMetrics, parseQty, type Barrel, type PackRun, type PackTarget } from '@gokul/data';
import { Badge, Button, Dialog, Field, Input, NumberInput, cn, useToast } from '@gokul/ui';
import { api } from '../../store';
import { BarrelCard, EntryDate, fmtMilli, fmtNum, gradeTone, todayYmd, useEntryDate, useKeys } from './common';

export function PackForm({ open, barrels, initialBarrelId, onClose, onSaved }: {
  open: boolean; barrels: Barrel[]; initialBarrelId?: string | null; onClose: () => void; onSaved: (r: PackRun) => void;
}) {
  const toast = useToast();
  const [barrelId, setBarrelId] = useState<string | null>(null);
  const [targets, setTargets] = useState<PackTarget[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [used, setUsed] = useState<string | null>(null);
  const [packers, setPackers] = useState<string[]>([]);
  const [packer, setPacker] = useState('');
  const entry = useEntryDate();
  const resetEntry = entry.reset;
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCounts({}); setUsed(null); setErr(''); setPacker(''); resetEntry();
    void api.getSettingsBundle().then((b) => setPackers(b.mill.operators)).catch(() => undefined);
    setBarrelId(initialBarrelId ?? barrels.find((b) => b.oilName)?.id ?? null);
  }, [open, initialBarrelId, barrels, resetEntry]);
  useEffect(() => {
    if (!barrelId) { setTargets([]); return; }
    let live = true;
    api.listPackTargets(barrelId).then((t) => { if (live) setTargets(t); });
    return () => { live = false; };
  }, [barrelId]);

  const barrel = barrels.find((b) => b.id === barrelId) ?? null;
  const lines = useMemo(() => targets.map((t) => ({ ...t, count: Math.floor(Number(counts[t.itemId]) || 0) })), [targets, counts]);
  const expected = lines.reduce((a, l) => a + l.sizeMl * l.count, 0);
  const usedMilli = used === null ? expected : parseQty(used) ?? 0;
  const m = packMetrics(lines, usedMilli);
  const hasPacks = m.packs > 0;
  const over = barrel ? usedMilli > barrel.levelL : false;

  const save = async () => {
    if (!barrelId) return;
    if (!entry.day || entry.day > todayYmd()) { setErr('Choose a date that is today or earlier.'); return; }
    setBusy(true);
    try {
      const r = await api.createPackRun({ barrelId, lines: lines.filter((l) => l.count > 0).map((l) => ({ itemId: l.itemId, count: l.count })), usedL: usedMilli, packer, ...entry.when });
      toast.show({ tone: 'success', title: `Packing ${r.number} saved`, detail: `${r.packs} packs of ${r.oilName} added to stock.` });
      onSaved(r); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save packing.'); } finally { setBusy(false); }
  };
  useKeys((e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); } }, open, true);

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="xl" title="New packing run" description="Fill bottles and tins from a barrel. Packs are added to stock when you save."
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" icon={<Check size={15} />} kbd="Ctrl+S" disabled={busy || !hasPacks || over} onClick={() => void save()}>Save packing</Button></>}
    >
      <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <EntryDate entry={entry} label="Date of packing" className="max-w-[460px]" />
        <div>
          <span className="text-xs font-medium text-muted">Loose oil source (barrel)</span>
          <div className="mt-1 grid grid-cols-8 gap-2">
            {barrels.map((b) => <BarrelCard key={b.id} barrel={b} selected={barrelId === b.id} disabled={!b.oilName} onClick={() => { setBarrelId(b.id); setCounts({}); setUsed(null); setErr(''); }} />)}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_300px] gap-6">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
              <span>Packs filled {barrel?.oilName ? `(${barrel.oilName})` : ''}</span><span>Pack size x count</span>
            </div>
            <div className="overflow-hidden rounded-card border border-line">
              {targets.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted">Pick a barrel that has oil.</div>}
              {targets.map((t, i) => {
                const c = Math.floor(Number(counts[t.itemId]) || 0);
                return (
                  <div key={t.itemId} className={cn('grid grid-cols-[minmax(0,1fr)_110px_110px] items-center gap-3 px-3 py-2', i > 0 && 'border-t border-line/70')}>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{t.label} {t.unit === 'tin' ? 'tin' : 'bottle'}</div>
                      <div className="num text-xs text-muted">{fmtMilli(t.stock, 0)} in stock</div>
                    </div>
                    <NumberInput
                      size="sm" decimals={0} value={counts[t.itemId] ?? ''} placeholder="0" data-autofocus={i === 0 ? true : undefined}
                      onValueChange={(v) => { setCounts((x) => ({ ...x, [t.itemId]: v })); setUsed(null); setErr(''); }}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <span className="num text-right text-sm text-muted">{c > 0 ? `${fmtNum((t.sizeMl * c) / 1000)} L` : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <aside className="self-start rounded-card border border-line bg-surface-2 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Oil check</div>
            <dl className="mt-2 divide-y divide-line/70 text-sm">
              <div className="flex items-center justify-between py-1.5"><dt className="text-muted">Oil in the packs</dt><dd className="num font-medium text-ink">{fmtNum(expected / 1000)} L</dd></div>
              <div className="flex items-center justify-between gap-3 py-1.5"><dt className="text-muted">Oil taken from barrel</dt><dd className="w-24"><NumberInput size="sm" value={used ?? (expected ? String(expected / 1000) : '')} onValueChange={setUsed} placeholder="0" /></dd></div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-muted">Wastage</dt>
                <dd className="flex items-center gap-2">
                  <span className="num font-medium text-ink">{hasPacks ? `${fmtNum(m.wastageL / 1000, 2)} L` : '--'}</span>
                  {hasPacks && <Badge tone={gradeTone[m.grade]}>{fmtNum(m.wastagePct, 2)}%</Badge>}
                </dd>
              </div>
              <div className="flex items-center justify-between py-1.5"><dt className="text-muted">Usual wastage</dt><dd className="num text-muted">up to {PACK_WASTAGE_NORM_PCT}%</dd></div>
              <div className="flex items-center justify-between py-1.5"><dt className="text-muted">{barrel?.label ?? 'Barrel'} after</dt><dd className={cn('num font-medium', over ? 'text-danger' : 'text-ink')}>{barrel ? `${fmtMilli(Math.max(0, barrel.levelL - usedMilli))} L` : '--'}</dd></div>
            </dl>
            <Field label="Packed by" className="mt-3">
              <Input value={packer} list="packers" onChange={(e) => setPacker(e.target.value)} placeholder="Name" />
              <datalist id="packers">{packers.map((v) => <option key={v} value={v} />)}</datalist>
            </Field>
            {hasPacks && m.grade !== 'good' && !over && (
              <p className={cn('mt-3 rounded-control px-2.5 py-2 text-xs', m.grade === 'poor' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
                {m.grade === 'poor' ? 'Wastage is high. Check for spills, drips at the tap or a miscounted pack.' : 'A little over the usual wastage.'}
              </p>
            )}
            {over && <p className="mt-3 rounded-control bg-danger-soft px-2.5 py-2 text-xs text-danger">The barrel does not have this much oil.</p>}
          </aside>
        </div>
        {err && <div className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger"><TriangleAlert size={15} className="mt-0.5 shrink-0" />{err}</div>}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
