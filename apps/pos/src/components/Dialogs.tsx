import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, PackageSearch, Search, UserPlus } from 'lucide-react';
import { GST_STATES, creditLeft, formatQty, gstinProblem, isNoName, formatRupees, stateLabel, type Customer, type HeldBill, type Item } from '@gokul/data';
import { Badge, Button, Dialog, Kbd, Money, cn } from '@gokul/ui';
import { api } from '../store';
import { plural } from '../plural';

/** Keyboard list helper: up/down/enter over a list, scrolls the active row into view. */
function useListNav<T>(list: T[], onPick: (x: T) => void, resetKey: unknown) {
  const [hi, setHi] = useState(0);
  useEffect(() => setHi(0), [resetKey]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'PageDown') { e.preventDefault(); setHi((h) => Math.min(h + 6, list.length - 1)); }
    else if (e.key === 'PageUp') { e.preventDefault(); setHi((h) => Math.max(h - 6, 0)); }
    else if (e.key === 'Enter' && list[hi]) { e.preventDefault(); onPick(list[hi]); }
  };
  return { hi, setHi, onKeyDown };
}

/** Bold the part of `text` that matches `q` (only when it matches as one run). */
export function Highlight({ text, q }: { text: string; q: string }) {
  const t = q.trim();
  const at = t ? text.toLowerCase().indexOf(t.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<mark className="rounded-[3px] bg-warning-soft px-px text-ink">{text.slice(at, at + t.length)}</mark>{text.slice(at + t.length)}</>;
}

/* ---------- F2 Item search ---------- */
const ITEM_COLS = 'grid-cols-[60px_minmax(0,1fr)_104px_92px_112px]';
export function ItemSearchDialog({ open, onClose, seed, onPick }: { open: boolean; onClose: () => void; seed: string; onPick: (i: Item) => void }) {
  const [q, setQ] = useState(seed);
  const [list, setList] = useState<Item[]>([]);
  useEffect(() => { if (open) setQ(seed); }, [open, seed]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    api.searchItems(q, 40).then((r) => live && setList(r));
    return () => { live = false; };
  }, [q, open]);
  const { hi, setHi, onKeyDown } = useListNav(list, onPick, q);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Find item" size="lg" hideHeader bodyClassName="p-0">
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={18} className="text-primary" />
        <input
          data-autofocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
          placeholder="Type item name, code or barcode" spellCheck={false} autoComplete="off"
          className="h-14 flex-1 bg-transparent text-lg text-ink placeholder:text-subtle"
        />
        {q && <span className="num text-xs text-subtle">{list.length}{list.length >= 40 ? '+' : ''} found</span>}
        <Kbd>Esc</Kbd>
      </div>
      <div className={cn('grid h-8 items-center border-b border-line bg-surface-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted', ITEM_COLS)}>
        <span>Code</span><span>Item</span><span>Pack</span><span className="text-right">Price</span><span className="text-right">Stock</span>
      </div>
      <ul className="h-[372px] overflow-y-auto">
        {list.length === 0 && (
          <li className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-3 text-subtle"><PackageSearch size={22} /></span>
            <span className="text-md font-semibold text-ink">No item matches "{q}"</span>
            <span className="text-sm text-muted">Check the spelling, or try the item code or the Tamil name.</span>
          </li>
        )}
        {list.map((it, i) => {
          const out = it.stock <= 0;
          const low = !out && it.stock <= it.reorderLevel;
          return (
            <li
              key={it.id} onMouseMove={() => setHi(i)} onClick={() => onPick(it)}
              ref={(el) => { if (el && i === hi) el.scrollIntoView({ block: 'nearest' }); }}
              className={cn('relative grid h-[50px] items-center px-4 text-base', ITEM_COLS, i === hi && 'bg-primary-soft')}
            >
              {i === hi && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
              <span className="num text-sm font-medium text-muted"><Highlight text={it.code} q={q} /></span>
              <span className="min-w-0 pr-3">
                <span className="block truncate font-medium text-ink"><Highlight text={it.name} q={q} /></span>
                <span className="block truncate text-xs text-subtle">{it.nameTa ? `${it.nameTa} - ` : ''}{it.category} - GST {it.gstRate}%</span>
              </span>
              <span>{it.loose ? <Badge tone="info">Loose {it.unit === 'l' ? 'L' : 'kg'}</Badge> : <span className="text-sm text-muted">{it.packSize ?? it.unit}</span>}</span>
              <span className="text-right leading-tight">
                <span className="block font-semibold num"><Money paise={it.price} /></span>
                {it.mrp > it.price && <span className="num block text-[11px] text-subtle line-through"><Money paise={it.mrp} /></span>}
              </span>
              <span className="flex flex-col items-end leading-tight">
                <span className={cn('num text-sm', out ? 'font-semibold text-danger' : low ? 'font-semibold text-warning' : 'text-muted')}>{formatQty(Math.max(0, it.stock), it.loose)}</span>
                {out ? <Badge tone="danger" className="!h-4 !px-1.5 !text-[10px]">Out</Badge> : low ? <Badge tone="warning" className="!h-4 !px-1.5 !text-[10px]">Low</Badge> : null}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-4 border-t border-line bg-surface-2 px-4 py-2 text-xs text-muted">
        <span className="flex items-center gap-1"><Kbd>Up</Kbd><Kbd>Down</Kbd> move</span>
        <span className="flex items-center gap-1"><Kbd>PgUp</Kbd><Kbd>PgDn</Kbd> jump</span>
        <span className="flex items-center gap-1"><Kbd><CornerDownLeft size={10} /></Kbd> add to bill</span>
        <span className="ml-auto">{list.length} shown</span>
      </div>
    </Dialog>
  );
}

/* ---------- F3 Customer ---------- */
type CustRow = { kind: 'walkin' } | { kind: 'new' } | { kind: 'cust'; c: Customer };
const CUST_PAGE = 30;
const phoneOk = (d: string) => /^[6-9]\d{9}$/.test(d);
const fmtPhone = (d: string) => (d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d);

export function CustomerDialog({ open, onClose, current, onPick }: { open: boolean; onClose: () => void; current: Customer | null; onPick: (c: Customer | null) => void }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<Customer[]>([]);
  const [mode, setMode] = useState<'list' | 'new'>('list');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [state, setState] = useState('');
  const [biz, setBiz] = useState(false);
  const [err, setErr] = useState<{ name?: string; phone?: string; gstin?: string }>({});
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [total, setTotal] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadingMore = useRef(false);
  useEffect(() => { if (open) { setQ(''); setMode('list'); setName(''); setPhone(''); setGstin(''); setState(''); setBiz(false); setErr({}); setBusy(false); setList([]); setMore(false); api.countCustomers().then(setTotal).catch(() => setTotal(null)); } }, [open]);
  // Every keystroke searches ALL customers in the database (name, mobile, code, area); an empty box shows the recent ones.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    api.searchCustomers(q, CUST_PAGE, 0).then((r) => { if (live) { setList(r); setMore(r.length >= CUST_PAGE); setLoading(false); } }).catch(() => live && setLoading(false));
    return () => { live = false; };
  }, [q, open]);
  /** Next page of the same search, added below what is shown */
  const loadMore = useCallback(() => {
    if (!more || loadingMore.current) return;
    loadingMore.current = true;
    const at = list.length;
    api.searchCustomers(q, CUST_PAGE, at).then((r) => {
      setList((cur) => (cur.length === at ? [...cur, ...r] : cur));
      setMore(r.length >= CUST_PAGE);
    }).catch(() => undefined).finally(() => { loadingMore.current = false; });
  }, [more, list.length, q]);

  const rows = useMemo<CustRow[]>(() => [{ kind: 'walkin' }, ...list.map((c) => ({ kind: 'cust' as const, c })), { kind: 'new' }], [list]);

  const startNew = () => {
    const t = q.trim();
    const hasDigit = /\d/.test(t);
    setName(hasDigit ? '' : t);
    setPhone(hasDigit ? t.replace(/\D/g, '').slice(0, 10) : '');
    setErr({});
    setMode('new');
    window.setTimeout(() => nameRef.current?.focus(), 30);
  };

  const pickRow = (r: CustRow) => {
    if (r.kind === 'walkin') onPick(null);
    else if (r.kind === 'cust') onPick(r.c);
    else startNew();
  };
  const { hi, setHi, onKeyDown } = useListNav(rows, pickRow, q);
  // reaching the last rows (arrow keys or scrolling) fetches the next page
  useEffect(() => { if (open && mode === 'list' && hi >= rows.length - 4) loadMore(); }, [hi, rows.length, open, mode, loadMore]);

  const save = async () => {
    const n = name.trim();
    const e: { name?: string; phone?: string; gstin?: string } = {};
    if (n.length < 2) e.name = 'Enter the customer name.';
    if (!phoneOk(phone)) e.phone = 'Enter a 10 digit mobile number starting with 6 to 9.';
    const g = gstin.trim().toUpperCase();
    if (biz && g) { const p = gstinProblem(g); if (p) e.gstin = p; }
    setErr(e);
    if (e.name) { nameRef.current?.focus(); return; }
    if (e.phone) { phoneRef.current?.focus(); return; }
    if (e.gstin) return;
    const dup = (await api.searchCustomers(phone, 5)).find((c) => c.phone.replace(/\s/g, '') === phone);
    if (dup && !(biz && g)) { onPick(dup); return; }
    setBusy(true);
    try { onPick(await api.quickAddCustomer({ name: n, phone: fmtPhone(phone), ...(biz && g ? { gstin: g } : state ? { stateCode: state } : {}) })); }
    catch (x) { setErr(biz && g ? { gstin: (x as Error).message } : { phone: 'Could not save. Nothing was changed, try again.' }); setBusy(false); }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) return;
        if (mode === 'new') { setMode('list'); window.setTimeout(() => searchRef.current?.focus(), 30); } else onClose();
      }}
      title="Select customer" size="md" hideHeader bodyClassName="p-0"
    >
      {mode === 'list' ? (
        <>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search size={18} className="text-primary" />
            <input
              ref={searchRef} data-autofocus value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); startNew(); } else onKeyDown(e); }}
              placeholder={total ? `Search ${total.toLocaleString('en-IN')} customers by name, mobile, code or area` : 'Customer name, mobile, code or area'} spellCheck={false} autoComplete="off"
              className="h-14 flex-1 bg-transparent text-lg text-ink placeholder:text-subtle"
            />
            <Kbd>Esc</Kbd>
          </div>
          <ul className="h-[352px] overflow-y-auto" onScroll={(e) => { const t = e.currentTarget; if (t.scrollHeight - t.scrollTop - t.clientHeight < 120) loadMore(); }}>
            {!q.trim() && list.length > 0 && <li className="sticky top-0 z-10 flex h-6 items-center bg-surface-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted">Recent customers</li>}
            {rows.map((r, i) => {
              const active = i === hi;
              const cls = cn('relative flex h-[54px] items-center gap-3 px-4', active && 'bg-primary-soft');
              const common = { onMouseMove: () => setHi(i), onClick: () => pickRow(r), ref: (el: HTMLLIElement | null) => { if (el && active) el.scrollIntoView({ block: 'nearest' }); } };
              const bar = active ? <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" /> : null;
              if (r.kind === 'walkin') {
                return (
                  <li key="walkin" className={cls} {...common}>
                    {bar}
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-fg">W</span>
                    <span className="min-w-0 flex-1"><span className="block text-base font-medium text-ink">Walk-in customer</span><span className="block text-xs text-muted">No customer on this bill</span></span>
                    {!current && <Badge tone="primary">Selected</Badge>}
                  </li>
                );
              }
              if (r.kind === 'new') {
                return (
                  <li key="new" className={cn(cls, 'border-t border-line')} {...common}>
                    {bar}
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-primary text-primary"><UserPlus size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium text-primary">{q.trim() && !list.length ? `Add "${q.trim()}" as a new customer` : 'Add a new customer'}</span>
                      <span className="block text-xs text-muted">Just a name and mobile number</span>
                    </span>
                    <Kbd>Ctrl+N</Kbd>
                  </li>
                );
              }
              const c = r.c;
              const left = c.creditLimit > 0 ? creditLeft(c) : null;
              return (
                <li key={c.id} className={cls} {...common}>
                  {bar}
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-xs font-bold text-muted">{isNoName(c.name) ? '#' : c.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                  <span className="min-w-0 flex-1">
                    {isNoName(c.name)
                      ? <span className="block truncate text-base font-medium text-ink"><span className="num"><Highlight text={c.phone} q={q} /></span> <span className="text-sm font-normal italic text-muted">No name</span></span>
                      : <span className="block truncate text-base font-medium text-ink"><Highlight text={c.name} q={q} /></span>}
                    <span className="block truncate text-xs text-muted num">{c.id}{isNoName(c.name) ? '' : ` - ${c.phone}`}{c.area ? ` - ${c.area}` : ''} - visited {c.lastVisit}</span>
                  </span>
                  {c.outstanding > 0 && <Badge tone="warning">Owes {formatRupees(c.outstanding, { decimals: false })}</Badge>}
                  {left !== null && c.outstanding === 0 && <span className="text-xs text-subtle">Credit {formatRupees(left, { decimals: false })}</span>}
                  {current?.id === c.id && <Badge tone="primary">Selected</Badge>}
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-4 border-t border-line bg-surface-2 px-4 py-2 text-xs text-muted">
            <span className="flex items-center gap-1"><Kbd>Up</Kbd><Kbd>Down</Kbd> move</span>
            <span className="flex items-center gap-1"><Kbd><CornerDownLeft size={10} /></Kbd> select</span>
            <span className="flex items-center gap-1"><Kbd>Ctrl+N</Kbd> new customer</span>
            <span className="ml-auto num">{q.trim()
              ? `${list.length}${more ? '+' : ''} found${loading ? '...' : ''}`
              : `Type to search ${total === null ? 'all' : total.toLocaleString('en-IN')} customers`}</span>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 border-b border-line px-5 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><UserPlus size={18} /></span>
            <div className="flex-1"><div className="text-md font-semibold text-ink">New customer</div><div className="text-xs text-muted">Saved now and added to this bill</div></div>
            <span className="flex items-center gap-1.5 text-xs text-subtle"><Kbd>Esc</Kbd> back</span>
          </div>
          <div className="space-y-4 p-5">
            <label className="block">
              <span className="text-xs font-medium text-muted">Name</span>
              <input
                ref={nameRef} data-autofocus value={name} autoComplete="off" spellCheck={false} maxLength={40} aria-label="Customer name"
                onChange={(e) => { setName(e.target.value); setErr((x) => ({ ...x, name: undefined })); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); phoneRef.current?.focus(); } }}
                placeholder="e.g. Meenakshi Stores"
                className={cn('mt-1 h-12 w-full rounded-control border bg-surface px-3 text-lg text-ink placeholder:text-subtle focus:ring-2', err.name ? 'border-danger focus:border-danger focus:ring-danger/25' : 'border-line-strong focus:border-primary focus:ring-primary/25')}
              />
              <span className="mt-1 block h-4 text-xs text-danger">{err.name}</span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted">Mobile number</span>
              <div className="relative mt-1">
                <span className="num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-subtle">+91</span>
                <input
                  ref={phoneRef} value={fmtPhone(phone)} inputMode="numeric" autoComplete="off" aria-label="Mobile number"
                  onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setErr((x) => ({ ...x, phone: undefined })); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
                  placeholder="98xxx xxxxx"
                  className={cn('num h-12 w-full rounded-control border bg-surface pl-[3.6rem] pr-3 text-lg text-ink placeholder:text-subtle focus:ring-2', err.phone ? 'border-danger focus:border-danger focus:ring-danger/25' : 'border-line-strong focus:border-primary focus:ring-primary/25')}
                />
              </div>
              <span className="mt-1 block h-4 text-xs text-danger">{err.phone}</span>
            </label>
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <button type="button" onClick={() => setBiz((b) => !b)} className="flex w-full items-center justify-between text-left text-sm font-semibold text-ink">
                <span>Business customer (GST invoice)</span><span className="text-xs font-normal text-primary">{biz ? 'Hide' : 'Add GSTIN'}</span>
              </button>
              {biz && (
                <div className="mt-2.5 space-y-2.5">
                  <label className="block">
                    <span className="text-xs font-medium text-muted">GSTIN (the state is taken from it)</span>
                    <input
                      value={gstin} aria-label="Customer GSTIN" autoComplete="off" spellCheck={false}
                      onChange={(e) => { setGstin(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15)); setErr((x) => ({ ...x, gstin: undefined })); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
                      placeholder="33ABCDE1234F1Z7"
                      className={cn('num mt-1 h-10 w-full rounded-control border bg-surface px-3 text-base uppercase text-ink placeholder:text-subtle focus:ring-2', err.gstin ? 'border-danger focus:border-danger focus:ring-danger/25' : 'border-line-strong focus:border-primary focus:ring-primary/25')}
                    />
                    <span className="mt-1 block min-h-4 text-xs text-danger">{err.gstin}</span>
                    {!err.gstin && gstin.length === 15 && !gstinProblem(gstin) && <span className="mt-1 block text-xs text-success">Valid. Place of supply: {stateLabel(gstin.slice(0, 2))}.</span>}
                  </label>
                </div>
              )}
              {!biz && (
                <label className="mt-2.5 block">
                  <span className="text-xs font-medium text-muted">State, if outside {`the shop's state`} (optional)</span>
                  <select value={state} onChange={(e) => setState(e.target.value)} aria-label="Customer state" className="mt-1 h-10 w-full rounded-control border border-line-strong bg-surface px-2 text-sm text-ink">
                    <option value="">Same as the shop (local)</option>
                    {GST_STATES.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">
            <Button onClick={() => setMode('list')} kbd="Esc">Back</Button>
            <Button variant="primary" disabled={busy} onClick={() => void save()} kbd="Enter">Save and use</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/* ---------- F7 Held bills ---------- */
export function HeldDialog({ open, onClose, held, onPick }: { open: boolean; onClose: () => void; held: HeldBill[]; onPick: (h: HeldBill) => void }) {
  const { hi, setHi, onKeyDown } = useListNav(held, onPick, open);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) window.setTimeout(() => ref.current?.focus(), 30); }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Held bills" description="Pick a bill to continue billing it." size="md" bodyClassName="p-0">
      <div ref={ref} data-autofocus tabIndex={0} onKeyDown={onKeyDown} className="max-h-[380px] overflow-y-auto outline-none">
        {held.map((h, i) => (
          <div key={h.id} onMouseMove={() => setHi(i)} onClick={() => onPick(h)} className={cn('flex h-14 items-center gap-3 border-b border-line/70 px-5', i === hi && 'bg-primary-soft')}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-soft text-sm font-bold text-warning">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-medium">{h.customerName}</span>
              <span className="block text-xs text-muted num">Held bill {h.id.replace(/^h/, '#')} - {plural(h.lines.length, 'item')} - held {new Date(h.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
            </span>
            <span className="text-md font-semibold num"><Money paise={h.total} /></span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/* ---------- F1 Help ---------- */
const HELP: [string, string][] = [
  ['Enter', 'Add the typed code or scanned barcode'], ['5*101', 'Add 5 of item 101'], ['Up / Down', 'Move between bill rows'],
  ['Enter (empty)', 'Edit quantity of selected row'], ['F4', 'Edit quantity'], ['Ctrl+D', 'Line discount (amount or 5%)'],
  ['Tab (editing)', 'Next field: qty, rate, discount'], ['Del', 'Remove selected row'], ['Ctrl+Z', 'Undo last removed row'],
  ['+ / -', 'Quantity up or down by one'], ['Ctrl+F', 'Search items'], ['F11', 'Choose customer'], ['Shift+F11', 'Full screen on or off'],
  ['F6', 'Hold this bill'], ['Shift+F6', 'Bring back a held bill'], ['F8', 'Recent bills'], ['F9', 'Cash in / out'],
  ['F10', 'Return / exchange'], ['Ctrl+L', 'Lock the counter'], ['Ctrl+E', 'Close the day (Z)'], ['F12 or End', 'Take payment'], ['Shift+F5', 'Discount on whole bill'], ['Esc', 'Clear typed code or cancel bill'],
];
export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Keyboard shortcuts" description="Everything at the counter works without the mouse." size="lg" footer={<Button variant="primary" onClick={onClose} kbd="Esc">Close</Button>}>
      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
        {HELP.map(([k, d]) => (
          <div key={k} className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5 text-sm">
            <span className="text-muted">{d}</span>
            <Kbd>{k}</Kbd>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/* ---------- Confirm / prompt ---------- */
export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onClose, danger, focusSafe }: {
  open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; danger?: boolean;
  /** Focus the safe button first, so a stray Enter cannot carry out the action. */
  focusSafe?: boolean;
}) {
  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} title={title} size="sm"
      footer={<><Button data-autofocus={focusSafe ? true : undefined} onClick={onClose} kbd="Esc">Keep bill</Button><Button data-autofocus={focusSafe ? undefined : true} variant={danger ? 'danger' : 'primary'} onClick={onConfirm} kbd="Enter">{confirmLabel}</Button></>}
    >
      <p className="text-base text-muted">{message}</p>
    </Dialog>
  );
}

export function PromptDialog({ open, title, label, hint, initial, onSubmit, onClose, preview }: {
  open: boolean; title: string; label: string; hint?: string; initial?: string; onSubmit: (v: string) => void; onClose: () => void;
  /** Live line under the box, e.g. the new bill total, from what has been typed so far */
  preview?: (typed: string) => React.ReactNode;
}) {
  const [v, setV] = useState('');
  useEffect(() => { if (open) setV(initial ?? ''); }, [open, initial]);
  return (
    <Dialog
      open={open} onOpenChange={(o) => !o && onClose()} title={title} size="sm"
      footer={<><Button onClick={onClose} kbd="Esc">Cancel</Button><Button variant="primary" onClick={() => onSubmit(v)} kbd="Enter">Apply</Button></>}
    >
      <label className="block text-sm font-medium text-muted">{label}</label>
      <input
        data-autofocus value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.%]/g, ''))}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(v); } }}
        className="num mt-1.5 h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-right text-xl font-semibold text-ink focus:border-primary focus:ring-2 focus:ring-primary/25"
      />
      {preview && <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink">{preview(v)}</div>}
      {hint && <p className="mt-2 text-xs text-subtle">{hint}</p>}
    </Dialog>
  );
}
