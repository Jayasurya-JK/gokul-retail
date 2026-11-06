import type { ShiftApi } from "./areas/shift";
import type { BillOpsApi } from "./areas/billops";
import type { CatalogApi } from "./areas/catalog";
import type { PurchasingApi } from "./areas/purchasing";
import type { CrmApi } from "./areas/crm";
import type { ReportsApi } from "./areas/reports";
import type { ExpensesApi } from "./areas/expenses";
import type { MillApi } from "./areas/mill";
import type {
  Bill, BillDraft, BillFilter, Category, Customer, DashboardStats, HeldBill, Item, ProductionBatch, Purchase,
  Settings, Shift, StockMovement, Supplier, TopItem, User,
} from './types';

/**
 * The one contract between screens and storage. mockApi implements it in memory now;
 * a Tauri/Rust backend will implement the same shape later. Screens never change.
 */
export interface CoreApi {
  getSettings(): Promise<Settings>;
  listUsers(): Promise<User[]>;
  /** Signs in. The backend keeps the signed-in user; every later call is made as that user (identity is never sent from the screen). */
  verifyPin(userId: string, pin: string): Promise<User | null>;
  /** Signs out of the backend session (lock screen, sign out, end of day). */
  logout(): Promise<void>;
  currentShift(userId: string): Promise<Shift>;

  listItems(): Promise<Item[]>;
  listCategories(): Promise<Category[]>;
  findItemByCode(codeOrBarcode: string): Promise<Item | null>;
  searchItems(query: string, limit?: number): Promise<Item[]>;

  listCustomers(): Promise<Customer[]>;
  searchCustomers(query: string, limit?: number): Promise<Customer[]>;

  listBills(filter?: BillFilter): Promise<Bill[]>;
  getBill(id: string): Promise<Bill | null>;
  saveBill(draft: BillDraft): Promise<Bill>;

  holdBill(draft: BillDraft): Promise<HeldBill>;
  listHeld(): Promise<HeldBill[]>;
  recallHeld(id: string): Promise<HeldBill | null>;

  dashboard(): Promise<DashboardStats>;
  topItems(days: number, limit: number): Promise<TopItem[]>;
  lowStock(limit: number): Promise<Item[]>;

  listSuppliers(): Promise<Supplier[]>;
  listPurchases(): Promise<Purchase[]>;
  listStockMovements(limit: number): Promise<StockMovement[]>;
  listProduction(): Promise<ProductionBatch[]>;
}

/** Full contract = core + one interface per area (see ./areas). */
export interface Api extends CoreApi, ShiftApi, BillOpsApi, CatalogApi, PurchasingApi, CrmApi, ReportsApi, ExpensesApi, MillApi {}
