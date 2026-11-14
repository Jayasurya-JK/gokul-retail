import type { MockStore } from './store';
import type { Paise } from '../types';
import type { ReportParams, ReportResult } from './reports';

// Area: expenses (petty cash and every other shop cost), the voided-lines log and small per-counter preferences.
// An expense is never deleted: a void keeps the row with its reason. Cash-drawer expenses reduce the shift's expected cash.

export type ExpensePaidFrom = 'cash' | 'upi' | 'bank';
export const PAID_FROM_LABEL: Record<ExpensePaidFrom, string> = { cash: 'Cash drawer', upi: 'UPI', bank: 'Bank' };

export interface ExpenseCategory { id: string; name: string; active: boolean }

export interface Expense {
  id: string;
  number: string;
  at: string;
  /** yyyy-mm-dd */
  day: string;
  categoryId: string;
  category: string;
  paidFrom: ExpensePaidFrom;
  amount: Paise;
  paidTo: string;
  note: string;
  by: string;
  /** Manager who approved an amount over the limit */
  approvedBy: string;
  status: 'active' | 'void';
  voidReason: string;
  voidedAt?: string | null;
  voidedBy: string;
  editCount: number;
}

export interface ExpenseInput {
  categoryId: string;
  paidFrom: ExpensePaidFrom;
  amount: Paise;
  paidTo?: string;
  note?: string;
  by?: string;
  /** Needed when the amount is over the limit in Settings and the user may not approve it */
  managerPin?: string;
  /** Office only: record a forgotten expense for an earlier day (yyyy-mm-dd) */
  day?: string;
}

export interface ExpenseEdit {
  id: string;
  /** Always required: why the entry changed */
  reason: string;
  categoryId?: string;
  amount?: Paise;
  paidTo?: string;
  note?: string;
  managerPin?: string;
}

export interface ExpenseVoid { id: string; reason: string; managerPin?: string }

export interface ExpenseQuery {
  from?: string;
  to?: string;
  categoryId?: string;
  paidFrom?: ExpensePaidFrom | 'all';
  by?: string;
  status?: 'active' | 'void' | 'all';
  query?: string;
}

export interface ExpenseList {
  rows: Expense[];
  /** Total of the active rows */
  total: Paise;
  count: number;
  voidedCount: number;
  byMode: { cash: Paise; upi: Paise; bank: Paise };
  byCategory: { categoryId: string; category: string; amount: Paise; count: number }[];
}

export interface VoidedLineInput {
  itemId?: string;
  code?: string;
  name: string;
  qty: number;
  rate?: Paise;
  amount?: Paise;
  counter?: string;
  managerPin?: string;
}

export interface ExpensesApi {
  listExpenseCategories(): Promise<ExpenseCategory[]>;
  /** The whole list in order. Rows left out are switched off, never deleted. */
  saveExpenseCategories(cats: { id?: string; name: string; active: boolean }[]): Promise<ExpenseCategory[]>;
  listExpenses(q?: ExpenseQuery): Promise<ExpenseList>;
  addExpense(input: ExpenseInput): Promise<Expense>;
  editExpense(input: ExpenseEdit): Promise<Expense>;
  voidExpense(input: ExpenseVoid): Promise<Expense>;
  /** A scanned line was removed from the open bill. Logged for the "Voided lines" report. */
  logVoidedLine(line: VoidedLineInput): Promise<void>;
  /** Small per-counter preferences kept by the backend (for example "showKeyBar"). */
  getUiPref(key: string): Promise<string | null>;
  setUiPref(key: string, value: string): Promise<void>;
}

/* ------------------------------------------------------------------ mock */

export interface MockVoidedLine {
  at: string; by: string; counter: string; code: string; name: string; qty: number; rate: Paise; amount: Paise; approvedBy: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date | string) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const SEED_CATS: ExpenseCategory[] = [
  ['tea', 'Tea / snacks'], ['transport', 'Transport'], ['advance', 'Salary advance'], ['wages', 'Wages'], ['electricity', 'Electricity'],
  ['rent', 'Rent'], ['repairs', 'Repairs'], ['packing', 'Packing material'], ['supplier_cash', 'Supplier cash'], ['other', 'Other'],
].map(([id, name]) => ({ id, name, active: true }));

export function createExpensesMock(store: MockStore): ExpensesApi {
  const cats: ExpenseCategory[] = clone(SEED_CATS);
  const prefs = new Map<string, string>();
  let seq = 0;
  const rows: Expense[] = [];
  const voided: MockVoidedLine[] = [];
  store.expenses = rows;
  store.voidedLines = voided;
  store.expenseLimit = store.expenseLimit ?? 100000;

  const make = (daysAgo: number, hour: number, categoryId: string, paidFrom: ExpensePaidFrom, amount: Paise, paidTo: string, note: string, by: string): Expense => {
    seq += 1;
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, (seq * 7) % 60, 0, 0);
    return {
      id: `ex${seq}`, number: `EX-26-${String(seq).padStart(6, '0')}`, at: d.toISOString(), day: dayKey(d), categoryId,
      category: cats.find((c) => c.id === categoryId)?.name ?? categoryId, paidFrom, amount, paidTo, note, by, approvedBy: '',
      status: 'active', voidReason: '', voidedAt: null, voidedBy: '', editCount: 0,
    };
  };
  const seedRows: [number, number, string, ExpensePaidFrom, Paise, string, string, string][] = [
    [0, 9, 'tea', 'cash', 6000, 'Tea stall', 'Tea for staff', 'Karthik'],
    [0, 11, 'transport', 'cash', 45000, 'Auto - Saravana', 'Bringing seeds from market', 'Karthik'],
    [0, 13, 'wages', 'cash', 150000, 'Loadmen', 'Unloading groundnut lorry', 'Lakshmi Rajan'],
    [1, 10, 'tea', 'cash', 14000, 'Tea stall', 'Tea', 'Karthik'],
    [1, 15, 'repairs', 'cash', 85000, 'Murugan Workshop', 'Chekku bearing repair', 'Lakshmi Rajan'],
    [2, 10, 'packing', 'upi', 240000, 'Sri Packaging', 'Labels and cartons', 'Suresh Kumar'],
    [3, 12, 'advance', 'cash', 200000, 'Selvam', 'Salary advance', 'Suresh Kumar'],
    [5, 11, 'electricity', 'bank', 612000, 'TNEB', 'Mill electricity bill', 'Suresh Kumar'],
    [6, 10, 'transport', 'upi', 120000, 'Gokul Transport', 'Delivery to Pollachi', 'Lakshmi Rajan'],
    [9, 10, 'rent', 'bank', 1800000, 'Mr. Palanisamy', 'Godown rent', 'Suresh Kumar'],
    [12, 9, 'tea', 'cash', 12000, 'Tea stall', 'Tea', 'Karthik'],
    [14, 14, 'wages', 'cash', 90000, 'Loadmen', 'Unloading sesame', 'Lakshmi Rajan'],
  ];
  for (const r of seedRows) rows.push(make(...r));
  rows[4].status = 'void';
  rows[4].voidReason = 'Entered twice';
  rows[4].voidedBy = 'Lakshmi Rajan';

  const needPin = (pin: string | undefined, what: string) => {
    const ok = store.users.some((u) => (u.role === 'owner' || u.role === 'admin' || u.role === 'manager') && u.pin === (pin ?? '').trim());
    if (!(pin ?? '').trim()) throw new Error(`A manager PIN is needed to ${what}`);
    if (!ok) throw new Error('Manager PIN is not correct');
  };

  return {
    listExpenseCategories: async () => clone(cats),
    saveExpenseCategories: async (next) => {
      const seen: string[] = [];
      next.forEach((n, i) => {
        const name = n.name.trim();
        if (!name) throw new Error('A category needs a name.');
        if (cats.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== n.id)) throw new Error(`There is already a category named "${name}".`);
        const found = n.id ? cats.find((c) => c.id === n.id) : undefined;
        if (found) { found.name = name; found.active = n.active; cats.splice(cats.indexOf(found), 1); cats.splice(i, 0, found); seen.push(found.id); }
        else { const id = `xc${cats.length + 1}`; cats.splice(i, 0, { id, name, active: n.active }); seen.push(id); }
      });
      for (const c of cats) if (!seen.includes(c.id)) c.active = false;
      return clone(cats);
    },
    listExpenses: async (q = {}) => {
      let out = rows.filter((r) => (q.from ? r.day >= q.from : true) && (q.to ? r.day <= q.to : true));
      if (q.categoryId && q.categoryId !== 'all') out = out.filter((r) => r.categoryId === q.categoryId);
      if (q.paidFrom && q.paidFrom !== 'all') out = out.filter((r) => r.paidFrom === q.paidFrom);
      if (q.by && q.by !== 'all') out = out.filter((r) => r.by === q.by);
      const st = q.status ?? 'active';
      if (st !== 'all') out = out.filter((r) => r.status === st);
      if (q.query?.trim()) {
        const t = q.query.trim().toLowerCase();
        out = out.filter((r) => `${r.paidTo} ${r.note} ${r.number}`.toLowerCase().includes(t));
      }
      out = [...out].sort((a, b) => b.at.localeCompare(a.at));
      const active = out.filter((r) => r.status === 'active');
      const byCat = new Map<string, { categoryId: string; category: string; amount: Paise; count: number }>();
      for (const r of active) {
        const c = byCat.get(r.categoryId) ?? { categoryId: r.categoryId, category: r.category, amount: 0, count: 0 };
        c.amount += r.amount; c.count += 1; byCat.set(r.categoryId, c);
      }
      const mode = (m: ExpensePaidFrom) => active.filter((r) => r.paidFrom === m).reduce((a, r) => a + r.amount, 0);
      return clone({
        rows: out, total: active.reduce((a, r) => a + r.amount, 0), count: active.length, voidedCount: out.length - active.length,
        byMode: { cash: mode('cash'), upi: mode('upi'), bank: mode('bank') },
        byCategory: [...byCat.values()].sort((a, b) => b.amount - a.amount),
      });
    },
    addExpense: async (i) => {
      if (i.amount <= 0) throw new Error('Enter an amount greater than zero.');
      const cat = cats.find((c) => c.id === i.categoryId && c.active);
      if (!cat) throw new Error('Choose a category.');
      let approvedBy = '';
      if (i.amount > (store.expenseLimit ?? 100000)) {
        needPin(i.managerPin, 'record an expense over the limit');
        approvedBy = store.users.find((u) => u.pin === i.managerPin?.trim())?.name ?? '';
      }
      seq += 1;
      const now = new Date();
      const e: Expense = {
        id: `ex${seq}`, number: `EX-26-${String(seq).padStart(6, '0')}`, at: now.toISOString(), day: i.day || dayKey(now),
        categoryId: cat.id, category: cat.name, paidFrom: i.paidFrom, amount: i.amount, paidTo: (i.paidTo ?? '').trim(), note: (i.note ?? '').trim(),
        by: i.by || 'Cashier', approvedBy, status: 'active', voidReason: '', voidedAt: null, voidedBy: '', editCount: 0,
      };
      rows.unshift(e);
      return clone(e);
    },
    editExpense: async (i) => {
      const e = rows.find((r) => r.id === i.id);
      if (!e) throw new Error('Expense not found.');
      if (!i.reason.trim()) throw new Error('Give a reason for the change.');
      if (e.status === 'void') throw new Error('A voided expense cannot be changed.');
      if (i.categoryId) {
        const cat = cats.find((c) => c.id === i.categoryId && c.active);
        if (!cat) throw new Error('Choose a category.');
        e.categoryId = cat.id; e.category = cat.name;
      }
      if (i.amount !== undefined) { if (i.amount <= 0) throw new Error('Enter an amount greater than zero.'); e.amount = i.amount; }
      if (i.paidTo !== undefined) e.paidTo = i.paidTo.trim();
      if (i.note !== undefined) e.note = i.note.trim();
      e.editCount += 1;
      return clone(e);
    },
    voidExpense: async (i) => {
      const e = rows.find((r) => r.id === i.id);
      if (!e) throw new Error('Expense not found.');
      if (!i.reason.trim()) throw new Error('Give a reason for voiding this expense.');
      if (e.status === 'void') throw new Error('This expense is already void.');
      e.status = 'void'; e.voidReason = i.reason.trim(); e.voidedAt = new Date().toISOString(); e.voidedBy = 'You';
      return clone(e);
    },
    logVoidedLine: async (l) => {
      voided.unshift({
        at: new Date().toISOString(), by: 'Cashier', counter: l.counter ?? '', code: l.code ?? '', name: l.name, qty: l.qty, rate: l.rate ?? 0,
        amount: l.amount ?? Math.round(((l.rate ?? 0) * l.qty) / 1000), approvedBy: '',
      });
    },
    getUiPref: async (key) => prefs.get(key) ?? null,
    setUiPref: async (key, value) => { prefs.set(key, value); },
  };
}

/* ------------------------------------------------------------------ mock reports */

const inRange = (day: string, p: ReportParams) => day >= p.from && day <= p.to;

export function mockExpensesReport(store: MockStore, p: ReportParams): ReportResult {
  const rows = (store.expenses ?? []).filter((r) => r.status === 'active' && inRange(r.day, p) && (!p.mode || (p.mode as string) === 'all' || (p.mode as string) === r.paidFrom));
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const cats = new Map<string, number>();
  for (const r of rows) cats.set(r.category, (cats.get(r.category) ?? 0) + r.amount);
  const catRows = [...cats.entries()].sort((a, b) => b[1] - a[1]);
  const cash = rows.filter((r) => r.paidFrom === 'cash').reduce((a, r) => a + r.amount, 0);
  const sales = store.bills.filter((b) => b.status !== 'cancelled' && inRange(dayKey(b.at), p)).reduce((a, b) => a + b.totals.taxable, 0);
  return {
    id: 'expenses', title: 'Expenses', note: 'Every active expense in the period. Voided entries are not counted.',
    kpis: [
      { label: 'Total expenses', kind: 'money', value: total, hint: `${rows.length} entries`, tone: 'warning' },
      { label: 'From cash drawer', kind: 'money', value: cash },
      { label: 'Biggest category', kind: 'text', value: catRows[0]?.[0] ?? '-', hint: catRows[0] ? `${Math.round(catRows[0][1] / 100).toLocaleString('en-IN')} rupees` : undefined },
      { label: '% of sales (ex-GST)', kind: 'pct', value: sales ? (total / sales) * 100 : 0 },
    ],
    chart: { kind: 'bars', title: 'Expenses by category', money: true, points: catRows.slice(0, 8).map(([label, value]) => ({ label, value })) },
    columns: [
      { key: 'date', label: 'Date', kind: 'date', w: '1fr' }, { key: 'number', label: 'No.', kind: 'text', w: '0.9fr' },
      { key: 'category', label: 'Category', kind: 'text', w: '1.2fr' }, { key: 'paidFrom', label: 'Paid from', kind: 'text', w: '0.8fr' },
      { key: 'paidTo', label: 'Paid to', kind: 'text', w: '1.2fr' }, { key: 'note', label: 'Note', kind: 'text', w: '1.6fr' },
      { key: 'by', label: 'By', kind: 'text', w: '0.8fr' }, { key: 'amount', label: 'Amount', kind: 'money' },
    ],
    rows: [...rows].sort((a, b) => b.at.localeCompare(a.at)).map((r) => ({
      date: r.day, number: r.number, category: r.category, paidFrom: r.paidFrom, paidTo: r.paidTo, note: r.note, by: r.by, amount: r.amount,
    })),
    totals: { date: 'Total', amount: total },
  };
}

export function mockVoidedLinesReport(store: MockStore, p: ReportParams): ReportResult {
  const rows = (store.voidedLines ?? []).filter((r) => inRange(dayKey(r.at), p));
  const byUser = new Map<string, number>();
  for (const r of rows) byUser.set(r.by, (byUser.get(r.by) ?? 0) + 1);
  const users = [...byUser.entries()].sort((a, b) => b[1] - a[1]);
  const value = rows.reduce((a, r) => a + r.amount, 0);
  return {
    id: 'voided-lines', title: 'Voided lines', note: 'Items scanned and then removed from a bill before it was saved.',
    kpis: [
      { label: 'Lines removed', kind: 'int', value: rows.length, tone: 'warning' },
      { label: 'Value removed', kind: 'money', value },
      { label: 'Most by', kind: 'text', value: users[0]?.[0] ?? '-', hint: users[0] ? `${users[0][1]} lines` : undefined },
    ],
    columns: [
      { key: 'date', label: 'When', kind: 'text', w: '1.2fr' }, { key: 'by', label: 'Removed by', kind: 'text', w: '1fr' },
      { key: 'counter', label: 'Counter', kind: 'text', w: '0.8fr' }, { key: 'code', label: 'Code', kind: 'text', w: '0.8fr' },
      { key: 'name', label: 'Item', kind: 'text', w: '2fr' }, { key: 'amount', label: 'Value', kind: 'money' },
    ],
    rows: rows.map((r) => ({ date: `${dayKey(r.at)} ${pad(new Date(r.at).getHours())}:${pad(new Date(r.at).getMinutes())}`, by: r.by, counter: r.counter, code: r.code, name: r.name, amount: r.amount })),
    totals: { date: 'Total', amount: value },
  };
}
