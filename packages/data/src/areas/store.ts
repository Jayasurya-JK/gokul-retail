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
}
