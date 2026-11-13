import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IndianRupee, Pencil, Phone, Plus, ReceiptIndianRupee, Search, ShoppingCart, Star, UserRound, UserPlus } from 'lucide-react';
import { compareCustomers, isNoName, formatPoints, formatRupees, parsePaise, type AgeingBuckets, type CustomerProfile, type CustomerRow, type CustomerWallet, type CustStatement, type PointsLedgerRow } from '@gokul/data';
import { Badge, Button, Dialog, EmptyState, Input, Kbd, Money, NumberInput, PosLayout, Sheet, cn, useRefreshOnFocus, useToast, type FKey } from '@gokul/ui';
import { api, useBilling } from '../store';
import { TopBar } from '../components/TopBar';
import { useScreenKeys, type KeyRows } from '../components/screenKeys';
import { dateTimeOf, payLabel } from '../components/billops/helpers';

const BUCKETS: { key: keyof AgeingBuckets; label: string; bar: string }[] = [
  { key: 'd0_30', label: '0 to 30 days', bar: 'bg-primary' },
  { key: 'd31_60', label: '31 to 60', bar: 'bg-warning' },
  { key: 'd61_90', label: '61 to 90', bar: 'bg-danger/70' },
  { key: 'd90p', label: 'Over 90', bar: 'bg-danger' },
];

const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const CUSTOMERS_KEYS: KeyRows = [
  ['Move between customers', ['Up', 'Down']],
  ['Start a bill for the customer', ['Enter']],
  ['New customer', ['Ctrl+N']],
  ['Edit the customer', ['F2']],
  ['Collect a payment', ['F4']],
  ['Clear search, or back to billing', ['Esc']],
];

export function Customers() {
  useScreenKeys('Customer Profile', CUSTOMERS_KEYS);
  const nav = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [statement, setStatement] = useState<CustStatement | null>(null);
  const [editing, setEditing] = useState<null | 'new' | CustomerRow>(null);
  const [collecting, setCollecting] = useState(false);
  const [version, setVersion] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  useRefreshOnFocus(() => setVersion((v) => v + 1));

  useEffect(() => {
    let live = true;
    void api.listCustomerRows().then((r) => { if (!live) return; setRows(r); setLoaded(true); });
    return () => { live = false; };
  }, [version]);

  const list = useMemo(() => {
    const t = query.trim().toLowerCase();
    const f = t ? rows.filter((r) => `${r.name} ${r.phone} ${r.area} ${r.business ?? ''}`.toLowerCase().includes(t)) : rows;
    return [...f].sort((a, b) => (b.outstanding - a.outstanding) || compareCustomers(a, b));
  }, [rows, query]);

  useEffect(() => { setSelId((cur) => (cur && list.some((c) => c.id === cur) ? cur : list[0]?.id ?? null)); }, [list]);

  useEffect(() => {
    if (!selId) { setProfile(null); setStatement(null); return; }
    let live = true;
    void Promise.all([api.getCustomerProfile(selId), api.getStatement(selId)]).then(([p, s]) => { if (live) { setProfile(p); setStatement(s); } });
    return () => { live = false; };
  }, [selId, version]);

  const refocus = useCallback(() => requestAnimationFrame(() => searchRef.current?.focus()), []);
  useEffect(() => { refocus(); }, [refocus]);

  const sel = profile?.customer ?? null;
  const modal = editing !== null || collecting;

  const newBill = useCallback(() => {
    if (!sel) return;
    useBilling.getState().setCustomer(sel);
    nav('/billing');
  }, [sel, nav]);

  const move = useCallback((by: number) => {
    setSelId((cur) => {
      if (!list.length) return null;
      const i = list.findIndex((c) => c.id === cur);
      return list[Math.max(0, Math.min(list.length - 1, (i < 0 ? 0 : i) + by))].id;
    });
  }, [list]);

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyRef.current = (e) => {
    if (modal || e.defaultPrevented) return;
    if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); setEditing('new'); return; }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(1); break;
      case 'ArrowUp': e.preventDefault(); move(-1); break;
      case 'PageDown': e.preventDefault(); move(8); break;
      case 'PageUp': e.preventDefault(); move(-8); break;
      case 'Enter': e.preventDefault(); newBill(); break;
      case 'F2': e.preventDefault(); if (sel) setEditing(sel); break;
      case 'F4': e.preventDefault(); if (sel) setCollecting(true); break;
      case 'Escape': e.preventDefault(); if (query) setQuery(''); else nav('/billing'); break;
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const closeModals = () => { window.setTimeout(() => { setEditing(null); setCollecting(false); }, 0); refocus(); };

  const keys: FKey[] = [
    { key: 'Esc', label: query ? 'Clear search' : 'Back to billing', onClick: () => (query ? setQuery('') : nav('/billing')) },
    { key: 'Ctrl+N', label: 'New customer', onClick: () => setEditing('new') },
    { key: 'F2', label: 'Edit', onClick: () => sel && setEditing(sel) },
    { key: 'F4', label: 'Collect payment', onClick: () => sel && setCollecting(true) },
    { key: 'Enter', label: 'New bill', tone: 'primary', onClick: newBill },
  ];

  const totalDue = useMemo(() => rows.reduce((s, r) => s + r.outstanding, 0), [rows]);
  const buckets = statement?.buckets;
  const bucketTotal = buckets ? buckets.d0_30 + buckets.d31_60 + buckets.d61_90 + buckets.d90p : 0;

  return (
    <PosLayout topBar={<TopBar />} keys={keys}>
      <div className="flex min-h-0 flex-1">
        {/* ---------- list ---------- */}
        <section className="flex w-[clamp(340px,28vw,460px)] shrink-0 flex-col border-r border-line bg-surface">
          <div className="space-y-2.5 border-b border-line p-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Input icon={<Search size={16} />} ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} size="lg" autoComplete="off" spellCheck={false} placeholder="Name, phone or area" aria-label="Search customers" />
              </div>
              <Button variant="primary" size="lg" icon={<UserPlus size={16} />} onClick={() => setEditing('new')} tabIndex={-1} className="!px-3.5" aria-label="New customer" />
            </div>
          </div>
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2 text-xs">
            <span className="text-muted"><b className="num text-ink">{list.length}</b> {list.length === 1 ? 'customer' : 'customers'}</span>
            <span className="text-muted">Dues <Money paise={totalDue} decimals={false} className="font-semibold text-warning" /></span>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {loaded && list.length === 0 && (
              <li className="px-4 py-10">
                <EmptyState icon={<UserRound size={20} />} title={query ? `No customer matches "${query}"` : 'No customers yet'} hint={<span className="flex items-center justify-center gap-1.5">Add one with <Kbd>Ctrl+N</Kbd></span>} />
              </li>
            )}
            {list.map((c) => {
              const on = c.id === selId;
              return (
                <li
                  key={c.id} onClick={() => { setSelId(c.id); refocus(); }}
                  ref={(el) => { if (el && on) el.scrollIntoView({ block: 'nearest' }); }}
                  className={cn('relative flex h-[60px] cursor-default items-center gap-3 border-b border-line/70 px-4 [content-visibility:auto] [contain-intrinsic-size:auto_60px]', on ? 'bg-primary-soft' : 'hover:bg-surface-2')}
                >
                  {on && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-bold text-muted">{isNoName(c.name) ? '#' : initialsOf(c.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{isNoName(c.name) ? <><span className="num">{c.phone}</span> <span className="font-normal italic text-muted">No name</span></> : c.name}{c.business && <span className="ml-1.5 font-normal text-muted">{c.business}</span>}</div>
                    <div className="num mt-0.5 truncate text-xs text-muted">{c.phone} - {c.area}</div>
                  </div>
                  {c.outstanding > 0 ? (
                    <div className="text-right">
                      <Money paise={c.outstanding} className="text-sm font-semibold text-warning" />
                      <div className="text-[11px] text-muted">due</div>
                    </div>
                  ) : <span className="text-[11px] text-subtle">No dues</span>}
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---------- detail ---------- */}
        <section className="flex min-w-0 flex-1 flex-col bg-surface">
          {sel ? (
            <>
              <div className="flex shrink-0 items-start gap-4 border-b border-line px-6 py-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-md font-bold text-primary-fg">{initialsOf(sel.name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <h2 className="truncate text-xl font-bold tracking-tight text-ink">{isNoName(sel.name) ? <><span className="num">{sel.phone}</span> <span className="text-md font-normal italic text-muted">No name</span></> : sel.name}</h2>
                    {sel.type === 'b2b' && <Badge tone="info">Business</Badge>}
                    {sel.outstanding > sel.creditLimit && sel.creditLimit > 0 && <Badge tone="danger">Over credit limit</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-muted">
                    <span className="num flex items-center gap-1.5"><Phone size={13} /> {sel.phone}</span>
                    <span>{sel.address || sel.area}</span>
                    {sel.gstin && <span className="num">GSTIN {sel.gstin}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button icon={<Pencil size={14} />} kbd="F2" onClick={() => setEditing(sel)}>Edit</Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-4 gap-3">
                  <Tile label="Outstanding" tone={sel.outstanding > 0 ? 'warn' : undefined}><Money paise={sel.outstanding} /></Tile>
                  <Tile label="Credit">{sel.creditLimit < 0 ? 'No limit' : sel.creditLimit === 0 ? 'Not allowed' : <Money paise={sel.creditLimit} decimals={false} />}</Tile>
                  <Tile label="Total spend" hint={`${sel.visits} visits`}><Money paise={sel.totalSpend} decimals={false} /></Tile>
                  <Tile label="Average bill" hint={sel.lastBillAt ? `Last ${dateTimeOf(sel.lastBillAt)}` : 'No bills yet'}><Money paise={sel.avgBill} decimals={false} /></Tile>
                </div>

                <div className="mt-4 rounded-card border border-line p-4">
                  <h3 className="text-sm font-semibold text-ink">Profile</h3>
                  <dl className="mt-3 grid grid-cols-5 gap-x-5 gap-y-3">
                    <Fact k="Father name" v={sel.fatherName} />
                    <Fact k="Date of birth" v={sel.dob ? dayText(sel.dob) : ''} />
                    <Fact k="Anniversary" v={sel.anniversary ? dayText(sel.anniversary) : ''} />
                    <Fact k="GST" v={sel.gstin} mono />
                    <Fact k="PAN" v={sel.pan} mono />
                    <Fact k="Locality" v={sel.locality || sel.area} />
                    <Fact k="Route" v={sel.route} />
                    <Fact k="Credit limit" v={sel.creditLimit < 0 ? 'No limit' : sel.creditLimit === 0 ? 'Not allowed' : formatRupees(sel.creditLimit, { decimals: false })} />
                    <Fact k="Credit days" v={sel.creditDays ? `${sel.creditDays} days` : ''} />
                    <Fact k="Opening balance" v={sel.openingBalance ? formatRupees(sel.openingBalance, { decimals: false }) : ''} />
                  </dl>
                </div>

                <PointsCard customerId={sel.id} version={version} />

                {sel.outstanding > 0 && buckets && (
                  <div className="mt-4 rounded-card border border-line p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ink">Dues by age</h3>
                      <Button variant="primary" size="sm" icon={<IndianRupee size={14} />} kbd="F4" onClick={() => setCollecting(true)}>Collect payment</Button>
                    </div>
                    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-3">
                      {BUCKETS.map((b) => buckets[b.key] > 0 && <span key={b.key} className={b.bar} style={{ width: `${(buckets[b.key] / Math.max(1, bucketTotal)) * 100}%` }} />)}
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-3">
                      {BUCKETS.map((b) => (
                        <div key={b.key}>
                          <div className="flex items-center gap-1.5 text-xs text-muted"><span className={cn('h-2 w-2 rounded-sm', b.bar)} />{b.label}</div>
                          <Money paise={buckets[b.key]} className="mt-0.5 block text-base font-semibold text-ink" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-5 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink">Recent bills</h3>
                  <span className="text-xs text-muted">{profile?.bills.length ?? 0} bills</span>
                </div>
                <div className="mt-2 overflow-hidden rounded-card border border-line">
                  {profile && profile.bills.length === 0 && <EmptyState icon={<ReceiptIndianRupee size={20} />} title="No bills for this customer yet" className="!min-h-[120px]" />}
                  {profile?.bills.slice(0, 30).map((b) => (
                    <div key={b.id} className="flex h-10 items-center gap-4 border-b border-line/70 px-4 text-sm last:border-b-0">
                      <span className={cn('num w-28 font-semibold', b.status === 'cancelled' ? 'text-subtle line-through' : 'text-ink')}>{b.number}</span>
                      <span className="flex-1 text-muted">{dateTimeOf(b.at)}</span>
                      <span className="w-20 text-xs font-medium text-muted">{payLabel(b)}</span>
                      <span className="w-24 text-right">{b.status === 'credit' ? <Badge tone="info">On credit</Badge> : b.status === 'cancelled' ? <Badge tone="danger">Cancelled</Badge> : b.status === 'returned' ? <Badge tone="warning">Returned</Badge> : null}</span>
                      <Money paise={b.totals.grand} className="w-24 text-right font-semibold" />
                    </div>
                  ))}
                </div>

                <h3 className="mt-5 text-sm font-semibold text-ink">Usually buys</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {profile?.favourites.slice(0, 6).map((f) => <span key={f.itemId} className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-ink">{f.name}</span>)}
                  {profile && profile.favourites.length === 0 && <span className="text-sm text-subtle">Nothing yet.</span>}
                </div>
                {sel.notes && (
                  <div className="mt-5 rounded-card border border-line bg-warning-soft px-4 py-3 text-sm text-ink"><b className="mr-1">Note:</b>{sel.notes}</div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface-2 px-6 py-2.5">
                <Button variant="primary" size="lg" icon={<ShoppingCart size={16} />} kbd="Enter" onClick={newBill}>New bill for {isNoName(sel.name) ? sel.phone : sel.name.split(' ')[0]}</Button>
                <Button size="lg" icon={<IndianRupee size={16} />} kbd="F4" disabled={sel.outstanding <= 0} onClick={() => setCollecting(true)}>Collect payment</Button>
              </div>
            </>
          ) : (
            <EmptyState icon={<UserRound size={22} />} title="Select a customer" hint="Use the Up and Down keys to move through the list." className="flex-1" />
          )}
        </section>
      </div>

      <CustomerSheet
        target={editing} onClose={closeModals}
        onSaved={(c) => { toast.show({ tone: 'success', title: `${c.name} saved` }); setVersion((v) => v + 1); setSelId(c.id); closeModals(); }}
      />
      <CollectDialog
        open={collecting} customer={sel} onClose={closeModals}
        onDone={() => { toast.show({ tone: 'success', title: 'Payment recorded', detail: `Received from ${sel?.name}.` }); setVersion((v) => v + 1); closeModals(); }}
      />
    </PosLayout>
  );
}

const dayText = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return y ? new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : iso;
};

function Fact({ k, v, mono }: { k: string; v?: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{k}</dt>
      <dd className={cn('mt-0.5 truncate text-sm', v ? 'font-medium text-ink' : 'text-subtle', mono && v && 'num')}>{v || '-'}</dd>
    </div>
  );
}

/** Loyalty points of the selected customer: balance, what it is worth, and the last ledger lines (points change only through bills). */
function PointsCard({ customerId, version }: { customerId: string; version: number }) {
  const [wallet, setWallet] = useState<CustomerWallet | null>(null);
  const [rows, setRows] = useState<PointsLedgerRow[] | null>(null);
  useEffect(() => {
    let live = true;
    setRows(null);
    void Promise.all([api.getCustomerWallet(customerId), api.getPointsLedger(customerId, 8)]).then(([w, r]) => { if (live) { setWallet(w); setRows(r); } }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [customerId, version]);
  const label: Record<PointsLedgerRow['kind'], string> = { earn: 'Earned', redeem: 'Used to pay', reverse: 'Reversed', adjust: 'Adjusted', expire: 'Expired', import: 'Brought from POSBean' };
  return (
    <div className="mt-4 rounded-card border border-line p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Star size={14} className="text-primary" /> Loyalty points</h3>
        {wallet && <span className="text-xs text-muted">1 point = {formatRupees(wallet.rules.pointValue)}</span>}
      </div>
      <div className="mt-3 flex items-end gap-6">
        <div><div className="text-xs text-muted">Balance</div><div className="num text-2xl font-semibold tracking-tight text-ink">{wallet ? formatPoints(wallet.points) : '-'}</div></div>
        <div><div className="text-xs text-muted">Worth at the counter</div><div className="num text-base font-semibold text-ink">{wallet ? formatRupees(wallet.pointsValue) : '-'}</div></div>
        {wallet && wallet.rules.enabled && <div className="ml-auto text-right text-xs text-subtle">Needs {wallet.rules.minRedeem} points to use<br />Earns 1 point per {formatRupees(wallet.rules.rupeesPerPoint * 100, { decimals: false })}</div>}
      </div>
      {wallet?.nextExpiry && <div className="mt-3 rounded-control bg-warning-soft px-3 py-1.5 text-xs text-warning"><b className="num">{formatPoints(wallet.nextExpiry.points)}</b> points expire on <b>{new Date(`${wallet.nextExpiry.on}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</b></div>}
      <div className="mt-3 overflow-hidden rounded-control border border-line">
        {rows === null && <div className="px-3 py-3 text-sm text-muted">Loading</div>}
        {rows?.length === 0 && <div className="px-3 py-3 text-sm text-subtle">No points yet. They are earned on every bill.</div>}
        {rows?.map((r) => (
          <div key={r.id} className="flex h-9 items-center gap-3 border-b border-line/70 px-3 text-sm last:border-b-0">
            <span className="w-14 shrink-0 text-xs text-muted">{new Date(r.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
            <span className="flex-1 truncate text-ink">{label[r.kind]}{r.bill ? <span className="num ml-1.5 text-xs text-muted">{r.bill}</span> : null}</span>
            <b className={cn('num w-16 text-right', r.points >= 0 ? 'text-success' : 'text-danger')}>{r.points > 0 ? '+' : ''}{formatPoints(r.points)}</b>
            <span className="num w-16 text-right text-muted">{formatPoints(r.balanceAfter)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, hint, tone, children }: { label: string; hint?: string; tone?: 'warn'; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface-2 px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cn('num mt-1 text-xl font-semibold tracking-tight', tone === 'warn' ? 'text-warning' : 'text-ink')}>{children}</div>
      <div className="mt-0.5 h-4 truncate text-xs text-subtle">{hint}</div>
    </div>
  );
}

/* ---------- add / edit side sheet ---------- */
function CustomerSheet({ target, onClose, onSaved }: { target: null | 'new' | CustomerRow; onClose: () => void; onSaved: (c: CustomerRow) => void }) {
  const open = target !== null;
  const existing = target && target !== 'new' ? target : null;
  const blank = { name: '', phone: '', address: '', area: '', gstin: '', limit: '0', unlimited: false, notes: '', fatherName: '', dob: '', anniversary: '', pan: '', locality: '', route: '', creditDays: '', opening: '' };
  const [f, setF] = useState({ ...blank, limit: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr({}); setFail(''); setBusy(false);
    setF(existing
      ? {
        ...blank, name: existing.name, phone: existing.phone.replace(/\D/g, '').slice(-10), address: existing.address ?? '', area: existing.area, gstin: existing.gstin ?? '',
        limit: existing.creditLimit > 0 ? String(existing.creditLimit / 100) : '0', unlimited: existing.creditLimit < 0, notes: existing.notes ?? '',
        fatherName: existing.fatherName ?? '', dob: existing.dob ?? '', anniversary: existing.anniversary ?? '', pan: existing.pan ?? '', locality: existing.locality ?? '',
        route: existing.route ?? '', creditDays: existing.creditDays ? String(existing.creditDays) : '', opening: existing.openingBalance ? String(existing.openingBalance / 100) : '',
      }
      : { ...blank });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF((p) => ({ ...p, [k]: e.target.value })); setErr((p) => ({ ...p, [k]: '' })); };

  const save = async () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = 'Enter the customer name';
    if (!/^\d{10}$/.test(f.phone.trim())) e.phone = 'Phone must be 10 digits';
    if (f.gstin.trim() && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/i.test(f.gstin.trim())) e.gstin = 'GSTIN looks wrong (15 characters)';
    const limit = f.limit.trim() === '' ? 0 : parsePaise(f.limit);
    if (limit === null) e.limit = 'Enter an amount';
    const opening = f.opening.trim() === '' ? 0 : parsePaise(f.opening);
    if (opening === null) e.opening = 'Enter an amount';
    if (f.pan.trim() && !/^[A-Z]{5}\d{4}[A-Z]$/i.test(f.pan.trim())) e.pan = 'PAN looks wrong (like ABCDE1234F)';
    setErr(e);
    if (Object.keys(e).length || limit === null || opening === null) return;
    setBusy(true);
    try {
      const gstin = f.gstin.trim().toUpperCase();
      const saved = await api.saveCustomer({
        id: existing?.id, name: f.name.trim(), phone: f.phone.trim(), area: f.area.trim() || 'Local', address: f.address.trim() || undefined,
        gstin: gstin || undefined, type: gstin ? 'b2b' : 'retail', business: existing?.business, email: existing?.email, creditLimit: f.unlimited ? -1 : limit, notes: f.notes.trim(),
        fatherName: f.fatherName.trim() || undefined, dob: f.dob || undefined, anniversary: f.anniversary || undefined, pan: f.pan.trim().toUpperCase() || undefined,
        locality: f.locality.trim() || undefined, route: f.route.trim() || undefined, creditDays: Number(f.creditDays) || 0, openingBalance: opening,
      });
      onSaved(saved);
    } catch (x) { setFail(x instanceof Error ? x.message : 'Could not save the customer'); setBusy(false); }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} width={540} title={existing ? 'Edit customer' : 'New customer'} description={existing ? existing.name : 'Added to your customer list'}>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <Input data-autofocus autoFocus label="Name" value={f.name} onChange={set('name')} error={err.name} placeholder="Customer or shop name" />
          <Input label="Phone" inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => set('phone')({ target: { value: e.target.value.replace(/\D/g, '') } })} error={err.phone} placeholder="10 digit mobile number" />
          <Input label="Address" value={f.address} onChange={set('address')} placeholder="Street, town" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Father name" value={f.fatherName} onChange={set('fatherName')} />
            <Input label="Locality" value={f.locality} onChange={set('locality')} placeholder="Area for delivery" />
            <Input label="Date of birth" type="date" value={f.dob} onChange={set('dob')} />
            <Input label="Anniversary" type="date" value={f.anniversary} onChange={set('anniversary')} />
            <Input label="Area" value={f.area} onChange={set('area')} placeholder="e.g. Gandhipuram" />
            <Input label="Route" value={f.route} onChange={set('route')} placeholder="Delivery route" />
            <Input label="GST" value={f.gstin} onChange={(e) => set('gstin')({ target: { value: e.target.value.toUpperCase() } })} error={err.gstin} maxLength={15} />
            <Input label="PAN" value={f.pan} onChange={(e) => set('pan')({ target: { value: e.target.value.toUpperCase() } })} error={err.pan} maxLength={10} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <NumberInput label="Credit limit" prefix="₹" value={f.unlimited ? '' : f.limit} disabled={f.unlimited} onValueChange={(v) => set('limit')({ target: { value: v } })} error={err.limit} decimals={0} />
            <NumberInput label="Credit days" value={f.creditDays} onValueChange={(v) => set('creditDays')({ target: { value: v } })} decimals={0} />
            <NumberInput label="Opening balance" prefix="₹" value={f.opening} onValueChange={(v) => set('opening')({ target: { value: v } })} error={err.opening} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={f.unlimited} onChange={(e) => setF((p) => ({ ...p, unlimited: e.target.checked }))} /> No credit limit (only for customers you fully trust). A limit of 0 means credit is not allowed.</label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Notes</span>
            <textarea value={f.notes} onChange={set('notes')} rows={3} placeholder="Delivery instructions, preferred oil, anything staff should know" className="w-full resize-none rounded-control border border-line-strong bg-surface px-2.5 py-2 text-sm text-ink placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/25" />
          </label>
          {fail && <div className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{fail}</div>}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">
          <Button onClick={onClose} kbd="Esc">Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy} icon={<Plus size={14} />}>{existing ? 'Save changes' : 'Add customer'}</Button>
        </div>
      </form>
    </Sheet>
  );
}

/* ---------- collect payment ---------- */
function CollectDialog({ open, customer, onClose, onDone }: { open: boolean; customer: CustomerRow | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'cash' | 'upi'>('cash');
  const [ref, setRef] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open && customer) { setAmount(String(customer.outstanding / 100)); setMode('cash'); setRef(''); setError(''); setBusy(false); } }, [open, customer]);

  const submit = async () => {
    if (!customer) return;
    const paise = parsePaise(amount);
    if (!paise || paise <= 0) { setError('Enter the amount received'); return; }
    if (paise > customer.outstanding) { setError('That is more than the customer owes'); return; }
    setBusy(true);
    try {
      await api.recordCollection({ customerId: customer.id, amount: paise, mode, ref: ref.trim() || undefined });
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not record the payment'); setBusy(false); }
  };

  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} size="sm" title="Collect payment" description={customer ? `${customer.name} owes ₹${(customer.outstanding / 100).toLocaleString('en-IN')}` : undefined}
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" disabled={busy} onClick={() => void submit()} kbd="Enter">Receive</Button></>}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <NumberInput data-autofocus label="Amount received" prefix="₹" size="lg" value={amount} onValueChange={(v) => { setAmount(v); setError(''); }} onFocus={(e) => e.currentTarget.select()} error={error} />
        <div className="grid grid-cols-2 gap-2">
          {(['cash', 'upi'] as const).map((m) => (
            <button
              key={m} type="button" onClick={() => setMode(m)} tabIndex={-1}
              className={cn('h-10 rounded-control border text-sm font-semibold', mode === m ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-muted hover:bg-surface-2')}
            >{m === 'cash' ? 'Cash' : 'UPI'}</button>
          ))}
        </div>
        {mode === 'upi' && <Input label="UPI reference" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Last digits of the transaction id" />}
      </form>
    </Dialog>
  );
}
