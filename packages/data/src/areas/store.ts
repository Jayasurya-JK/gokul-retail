import type { MillSettings } from './crm';
import type { Expense, MockVoidedLine } from './expenses';
import type { GodownMockState } from './production';
import type { PressingBatch } from './purchasing';
import type { Bill, Category, Customer, HeldBill, Item, ProductionBatch, Purchase, Settings, Supplier, User } from '../types';

/** Shared in-memory state every area mock reads and writes. Mutate in place. */
export interface MockStore {
  items: Item[];
  customers: Customer[];
  suppliers: Supplier[];
  purchases: Purchase[];
  production: ProductionBatch[];
  bills: Bill[];
  held: HeldBill[];
  settings: Settings;
  users: User[];
  categories: Category[];
  /** Set by the expenses mock; the reports mock reads them */
  expenses?: Expense[];
  voidedLines?: MockVoidedLine[];
  /** Over this an expense needs a manager PIN (paise); kept in sync with Settings */
  expenseLimit?: number;
  mill?: MillSettings;
  /** Set by the production mock; the purchasing mock reads the godown barrels a batch fills */
  godown?: GodownMockState;
  /** Set by the purchasing mock; the Mill daily report reads the pressing batches */
  pressing?: () => PressingBatch[];
}
