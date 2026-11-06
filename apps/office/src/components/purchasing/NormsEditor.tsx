import { useEffect, useMemo, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { isTauri, saveSeedNorms, type SeedProfile } from '@gokul/data';
import { Badge, Button, Card, NumberInput, useToast } from '@gokul/ui';
import { seedColor } from './common';

interface Row { kgPerL: string; density: string; settleDays: string }

const rowOf = (p: SeedProfile): Row => ({ kgPerL: String(p.kgPerL), density: String(p.density), settleDays: String(p.settleDays) });

/**
 * Production norms: the numbers every pressing batch and packing run is judged against (yield, settling time, packing
 * wastage). They are settings, not constants: change them when the seed, the chekku or the season changes. Each batch keeps
 * the norm that was in force when it was pressed, so old yield history never changes.
 */
export function NormsEditor({ profiles, onSaved }: { profiles: SeedProfile[]; onSaved: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [waste, setWaste] = useState('0.5');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const saved = useMemo(() => ({ rows: Object.fromEntries(profiles.map((p) => [p.seed, rowOf(p)])), waste: String(profiles[0]?.packWastagePct ?? 0.5) }), [profiles]);
  useEffect(() => { setRows(saved.rows); setWaste(saved.waste); setError(''); }, [saved]);

  const dirty = JSON.stringify(rows) !== JSON.stringify(saved.rows) || waste !== saved.waste;
  const set = (seed: string, k: keyof Row, v: string) => { setRows((r) => ({ ...r, [seed]: { ...r[seed], [k]: v } })); setError(''); };

  const save = async () => {
    const seeds = profiles.map((p) => ({ seed: p.seed, kgPerL: Number(rows[p.seed]?.kgPerL), density: Number(rows[p.seed]?.density), settleDays: Number(rows[p.seed]?.settleDays) }));
    if (seeds.some((s) => !(s.kgPerL > 0) || !(s.density > 0) || !(s.settleDays > 0))) { setError('Every norm must be more than zero.'); return; }
    if (!(Number(waste) >= 0)) { setError('The wastage norm cannot be negative.'); return; }
    if (!isTauri) { toast.show({ tone: 'info', title: 'Preview only', detail: 'Norms are saved in the installed Gokul Office.' }); return; }
    setBusy(true);
    try {
      await saveSeedNorms({ seeds, packWastagePct: Number(waste) });
      toast.show({ tone: 'success', title: 'Norms saved', detail: 'New batches and packing runs use them from now on.' });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the norms.');
    } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-bg p-4">
      <div className="grid max-w-[980px] grid-cols-1 gap-4">
        <Card title="Yield and settling norms" actions={<span className="text-xs text-muted">Used to grade every pressing batch</span>}>
          <div className="grid grid-cols-[minmax(160px,1.2fr)_1fr_1fr_1fr_110px] items-center gap-x-4 gap-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Seed</div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Seed per litre of oil (kg)</div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Oil weight (kg per L)</div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Settling (days)</div>
            <div className="text-right text-xs font-semibold uppercase tracking-wide text-muted">Norm yield</div>
            {profiles.map((p) => {
              const r = rows[p.seed] ?? rowOf(p);
              const pct = Number(r.kgPerL) > 0 ? (Number(r.density) / Number(r.kgPerL)) * 100 : 0;
              return (
                <div key={p.seed} className="contents">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink"><span className={`h-2.5 w-2.5 rounded-full ${seedColor[p.seed]}`} />{p.label}<span className="text-xs font-normal text-subtle">{p.ta}</span></div>
                  <NumberInput value={r.kgPerL} decimals={2} onValueChange={(v) => set(p.seed, 'kgPerL', v)} aria-label={`${p.label} seed per litre`} />
                  <NumberInput value={r.density} decimals={3} onValueChange={(v) => set(p.seed, 'density', v)} aria-label={`${p.label} oil weight`} />
                  <NumberInput value={r.settleDays} decimals={0} onValueChange={(v) => set(p.seed, 'settleDays', v)} aria-label={`${p.label} settling days`} />
                  <div className="text-right"><Badge tone="info">{pct.toFixed(1)}%</Badge></div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-subtle">
            Norm yield is oil weight divided by seed weight. A batch more than 3% under its norm is shown as low yield, more than 6% as poor.
            Each batch keeps the norm that was in force when it was pressed, so past yields never change when you edit these.
          </p>
        </Card>

        <Card title="Packing">
          <div className="flex items-end gap-6">
            <div className="w-64"><NumberInput label="Wastage norm (% of oil packed)" value={waste} decimals={2} onValueChange={(v) => { setWaste(v); setError(''); }} hint="Up to this much loss at the tap is normal; three times this is flagged." /></div>
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button variant="primary" icon={<Check size={15} />} disabled={!dirty || busy} onClick={() => void save()}>Save norms</Button>
          <Button icon={<RotateCcw size={15} />} disabled={!dirty || busy} onClick={() => { setRows(saved.rows); setWaste(saved.waste); setError(''); }}>Discard changes</Button>
          {error && <span className="text-sm font-medium text-danger">{error}</span>}
          {!dirty && !error && <span className="text-xs text-subtle">All norms saved.</span>}
        </div>
      </div>
    </div>
  );
}
