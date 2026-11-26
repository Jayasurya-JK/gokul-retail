import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Wheat } from 'lucide-react';
import { MACHINES, MILL_SEEDS, formatRupees, parseQty, type Customer, type JobWork, type Machine, type MillSeed } from '@gokul/data';
import { Badge, Button, EmptyState, Field, Input, cn, useToast } from '@gokul/ui';
import { api } from '../../store';
import { fmtQty } from '../mill/millUtil';
import { fmtDate, todayYmd, useEntryDate } from './common';

const sel = 'h-9 w-full rounded-control border border-line-strong bg-surface px-2 text-sm text-ink focus:border-primary focus:ring-2 focus:ring-primary/25';
const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted';
const td = 'px-3 py-1.5 text-sm text-ink';

/**
 * Job work (aravai for a customer). The customer brings their own seed; the shop presses it and charges per kg.
 * It is posted when saved: a credit bill for the charge, and a cake the shop keeps goes into stock. The customer's seed and oil
 * are never shop stock.
 */
export function JobWorkPane() {
  const toast = useToast();
  const [jobs, setJobs] = useState<JobWork[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rates, setRates] = useState({ taken: 0, kept: 0 });
  const [who, setWho] = useState('');
  const [seed, setSeed] = useState<MillSeed>('groundnut');
  const [machine, setMachine] = useState<Machine>('W');
  const [kg, setKg] = useState('');
  const [oil, setOil] = useState('');
  const [cake, setCake] = useState('');
  const [mode, setMode] = useState<'taken' | 'kept'>('taken');
  const entry = useEntryDate();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { void api.listJobWork(100).then(setJobs); }, []);
  useEffect(() => {
    load();
    void api.listCustomers().then(setCustomers);
    void api.getSettingsBundle().then((b) => setRates({ taken: b.mill.rateCakeTaken, kept: b.mill.rateCakeKept })).catch(() => undefined);
  }, [load]);

  const label = (c: Customer) => `${c.name}${c.phone ? ` - ${c.phone}` : ''}`;
  const customer = useMemo(() => customers.find((c) => label(c).toLowerCase() === who.trim().toLowerCase()), [customers, who]);
  const seedKg = parseQty(kg) ?? 0;
  const rate = mode === 'kept' ? rates.kept : rates.taken;
  const charge = Math.round((rate * seedKg) / 1000);

  const save = async () => {
    setErr('');
    if (!customer) { setErr('Choose the customer from the list.'); return; }
    if (!entry.day || entry.day > todayYmd()) { setErr('Choose a date that is today or earlier.'); return; }
    if (seedKg <= 0) { setErr('Enter the seed weight.'); return; }
    if (mode === 'kept' && (parseQty(cake) ?? 0) <= 0) { setErr('Enter the cake the shop keeps.'); return; }
    setBusy(true);
    try {
      const j = await api.recordJobWork({ customerId: customer.id, seed, machine, seedKg, oilL: parseQty(oil) ?? 0, cakeKg: parseQty(cake) ?? 0, cakeMode: mode, day: entry.day });
      toast.show({ tone: 'success', title: 'Job work saved', detail: `${j.customerName}: ${formatRupees(j.charge, { decimals: false })} billed on credit (${j.billNumber || 'no charge'}).` });
      setWho(''); setKg(''); setOil(''); setCake(''); load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save the job work'); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className="shrink-0 border-b border-line bg-surface px-4 py-3" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(); } }}>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-ink">New job work <span className="text-xs font-normal text-muted">the customer brings their own seed. Their seed and oil never become shop stock.</span></div>
          <Button variant="primary" icon={<Check size={15} />} disabled={busy} onClick={() => void save()} kbd="Ctrl+Enter">Save and bill</Button>
        </div>
        <div className="grid grid-cols-[118px_minmax(150px,2fr)_104px_104px_80px_92px_80px_140px] items-end gap-3">
          <Field label="Date"><Input type="date" value={entry.day} max={todayYmd()} onChange={(e) => entry.setDay(e.target.value)} aria-label="Date of the job work" className="num" /></Field>
          <Field label="Customer">
            <Input list="jobwork-customers" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Type a name or phone" data-autofocus />
            <datalist id="jobwork-customers">{customers.slice(0, 400).map((c) => <option key={c.id} value={label(c)} />)}</datalist>
          </Field>
          <Field label="Seed"><select className={sel} value={seed} onChange={(e) => setSeed(e.target.value as MillSeed)}>{MILL_SEEDS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
          <Field label="Machine"><select className={sel} value={machine} onChange={(e) => setMachine(e.target.value as Machine)}>{MACHINES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></Field>
          <Field label="Seed kg"><Input className="num text-right" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} /></Field>
          <Field label="Oil returned L"><Input className="num text-right" inputMode="decimal" value={oil} onChange={(e) => setOil(e.target.value)} /></Field>
          <Field label="Cake kg"><Input className="num text-right" inputMode="decimal" value={cake} onChange={(e) => setCake(e.target.value)} /></Field>
          <Field label="Cake goes to">
            <select className={sel} value={mode} onChange={(e) => setMode(e.target.value as 'taken' | 'kept')}>
              <option value="taken">Customer takes it</option><option value="kept">Shop keeps it</option>
            </select>
          </Field>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-muted">
            Charge {formatRupees(rate, { decimals: false })} per kg, GST included ({mode === 'kept' ? 'shop keeps the cake' : 'customer takes the cake'}).
          </span>
          <span className="num font-semibold text-ink">{seedKg > 0 ? `${formatRupees(charge, { decimals: false })} for ${fmtQty(seedKg)} kg` : ''}</span>
        </div>
        {err && <div className="mt-1 text-sm text-danger" role="alert">{err}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {jobs.length === 0 ? (
          <EmptyState icon={<Wheat size={22} />} title="No job work yet" hint="Record the first one above. The charge is billed to the customer on credit." />
        ) : (
          <table className="w-full table-fixed bg-surface">
            <thead className="sticky top-0 z-10 bg-table-head">
              <tr className="border-b border-line">
                <th className={cn(th, 'w-[110px]')}>Day</th><th className={th}>Customer</th><th className={cn(th, 'w-[120px]')}>Seed</th>
                <th className={cn(th, 'w-[90px] text-right')}>Seed kg</th><th className={cn(th, 'w-[90px] text-right')}>Oil L</th><th className={cn(th, 'w-[90px] text-right')}>Cake kg</th>
                <th className={cn(th, 'w-[150px]')}>Cake</th><th className={cn(th, 'w-[100px] text-right')}>Charge</th><th className={cn(th, 'w-[130px]')}>Bill</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={`${j.id}-${j.day}`} className="border-b border-line/70">
                  <td className={td}>{fmtDate(`${j.day}T12:00:00`)}</td>
                  <td className={cn(td, 'truncate font-medium')}>{j.customerName}</td>
                  <td className={td}>{j.seed === 'groundnut' ? 'Groundnut' : j.seed === 'sesame' ? 'Sesame' : 'Coconut'} {j.machine}</td>
                  <td className={cn(td, 'num text-right')}>{fmtQty(j.seedKg)}</td><td className={cn(td, 'num text-right')}>{fmtQty(j.oilL)}</td><td className={cn(td, 'num text-right')}>{fmtQty(j.cakeKg)}</td>
                  <td className={td}><Badge tone={j.cakeMode === 'kept' ? 'info' : 'neutral'}>{j.cakeMode === 'kept' ? 'Shop keeps' : 'Customer takes'}</Badge></td>
                  <td className={cn(td, 'num text-right font-semibold')}>{formatRupees(j.charge, { decimals: false })}</td>
                  <td className={cn(td, 'text-muted')}>{j.billNumber || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
