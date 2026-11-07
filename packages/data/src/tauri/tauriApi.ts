import { invoke } from '@tauri-apps/api/core';
import type { Api } from '../api';
import type {
  Bill, BillDraft, BillFilter, Category, Customer, DashboardStats, HeldBill, Item, ProductionBatch, Purchase, Settings, Shift,
  StockMovement, Supplier, TopItem, User, Paise,
} from '../types';
import type {
  BillDetail, BillSearch, CancelRequest, CreditNote, ReturnRequest,
} from '../areas/billops';
import type { CashEntry, CashEntryInput, DayStatus, DenomCounts, ShiftSummary, ZReport } from '../areas/shift';
import type {
  AdjustmentInput, AdjustmentResult, CountedBrand, CountedCategory, ItemDetail, ItemInput, ItemIssues, ItemPage, ItemPageQuery, NameResult, SaveItemResult,
  StockAdjustment, StockTakeCount, StockTakeLine, StockTakeResult,
} from '../areas/catalog';
import type {
  Barrel, Grn, GrnDraft, MoveToBarrelDraft, PackRun, PackRunDraft, PackTarget, PressingBatch, PressingDraft, Purchasable, SeedProfile,
  SupplierDraft, SupplierLedger, SupplierPaymentDraft, SupplierProfile, SupplierSummary,
} from '../areas/purchasing';
import type {
  BackupEntry, CollectionInput, CustStatement, CustomerInput, CustomerProfile, CustomerRow, ReceivableRow, RoleDef, SalesBill,
  BackupStatus, CustomerWallet, HardwareSettings, LabelOptions, LabelPreview, PointsEntry, PointsExpiryResult, PointsLedgerRow, PointsOverview, PointsPage, PointsQuery, PointsReport, PrintKind, PrintOptions, PrinterStatus, SalesFilterOptions, SalesQuery, SettingsBundle, UserAccount, UserInput,
} from '../areas/crm';
import type { ReportId, ReportParams, ReportResult } from '../areas/reports';
import type {
  Expense, ExpenseCategory, ExpenseEdit, ExpenseInput, ExpenseList, ExpenseQuery, ExpenseVoid, VoidedLineInput,
} from '../areas/expenses';
import type { MillSheet, MillSheetInput, MillSheetSummary } from '../areas/mill';
import type { PaymodeReport, ReportQuery, SalesReport, Staff, StaffReportRow, StockReport } from '../areas/posreports';

/**
 * Calls the Rust backend (crates/core) through the single `gokul_call` Tauri command.
 * Method names and argument order are exactly the `Api` interface, so screens do not change.
 * Errors come back as plain-English strings and are re-thrown as `Error` (the same shape the mock throws).
 */
async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  try {
    return await invoke<T>('gokul_call', { method, args });
  } catch (e) {
    const msg = typeof e === 'string' ? e : (e as { message?: string } | null)?.message;
    throw new Error(msg || 'Something went wrong. Nothing was saved.');
  }
}

/**
 * Everything the Rust backend implements: the whole `Api`. A cargo test checks this list is exactly the list
 * `gokul_core::METHODS` serves, so nothing can silently fall back to the mock inside Tauri.
 */
export const REAL_METHODS = [
  'getSettings', 'listUsers', 'verifyPin', 'currentShift', 'listItems', 'listCategories', 'findItemByCode', 'searchItems',
  'listCustomers', 'searchCustomers', 'listBills', 'getBill', 'saveBill', 'holdBill', 'listHeld', 'recallHeld', 'dashboard',
  'topItems', 'lowStock', 'listStockMovements', 'getDayStatus', 'openDay', 'listCashEntries', 'addCashEntry', 'shiftSummary',
  'verifyManagerPin', 'closeDay', 'peekNextBillNumber', 'quickAddCustomer', 'listBillsOn', 'getBillDetail', 'findBillForReturn',
  'cancelBill', 'recordReprint', 'createReturn', 'listCreditNotes', 'getPendingExchange', 'clearPendingExchange',
  'listSuppliers', 'listPurchases', 'listProduction',
  'getItemDetail', 'validateItem', 'saveItem', 'generateBarcode', 'nextItemCode', 'listLooseItems', 'setItemsActive', 'setItemsCategory',
  'setItemsGst', 'setItemsBrand', 'listItemsPage', 'itemMovements', 'listCategoriesWithCounts', 'addCategory', 'renameCategory', 'deleteCategory', 'moveCategory',
  'listBrands', 'addBrand', 'renameBrand', 'deleteBrand', 'moveBrand', 'createAdjustment', 'listAdjustments', 'startStockTake', 'postStockTake',
  'searchPurchasable', 'listGrns', 'getGrn', 'createGrn', 'listSupplierSummaries', 'getSupplierLedger', 'saveSupplier', 'recordSupplierPayment',
  'listSeedProfiles', 'saveSeedNorms', 'listPressingBatches', 'createPressingBatch', 'moveBatchToBarrel', 'listBarrels', 'listPackTargets',
  'listPackRuns', 'createPackRun',
  'listSalesBills', 'salesFilterOptions', 'listCustomerRows', 'getCustomerProfile', 'saveCustomer', 'setCustomerCredit', 'getCustomerWallet', 'listPointsHistory', 'pointsOverview', 'listPointsCustomers', 'getPointsLedger', 'runPointsExpiry', 'pointsReport', 'listReceivables', 'getStatement',
  'recordCollection', 'logReminder', 'listRoles', 'saveRoles', 'listUserAccounts', 'saveUserAccount', 'resetUserPin', 'getSettingsBundle',
  'saveSettingsBundle', 'testPrint', 'printDocument', 'printerStatus', 'backupNow', 'restoreBackup', 'runReport', 'backupStatus', 'logout',
  'listExpenseCategories', 'saveExpenseCategories', 'listExpenses', 'addExpense', 'editExpense', 'voidExpense', 'logVoidedLine',
  'getMillSheet', 'saveMillSheet', 'closeMillSheet', 'listMillSheets', 'getUiPref', 'setUiPref', 'printLabels', 'labelPreview', 'getHardware',
  'listStaff', 'addStaff', 'salesReport', 'paymodeReport', 'staffReport', 'stockReport',
] as const;

/** Production norms (editable settings). Not part of the shared `Api` screens use yet; the Rust side serves it. */
export interface SeedNormsInput {
  seeds?: { seed: 'groundnut' | 'sesame' | 'copra'; kgPerL?: number; density?: number; settleDays?: number }[];
  packWastagePct?: number;
}
export const saveSeedNorms = (norms: SeedNormsInput) => call<SeedProfile[]>('saveSeedNorms', norms);

/** The real backend: the complete `Api`. The in-memory mock is used only by the browser preview (see select.ts). */
export function createTauriApi(): Api {
  return {
    // ----- CoreApi -----
    getSettings: () => call<Settings>('getSettings'),
    listUsers: () => call<User[]>('listUsers'),
    verifyPin: (userId: string, pin: string) => call<User | null>('verifyPin', userId, pin),
    logout: () => call<void>('logout'),
    currentShift: (userId: string) => call<Shift>('currentShift', userId),
    listItems: () => call<Item[]>('listItems'),
    listCategories: () => call<Category[]>('listCategories'),
    findItemByCode: (code: string) => call<Item | null>('findItemByCode', code),
    searchItems: (query: string, limit?: number) => call<Item[]>('searchItems', query, limit ?? null),
    listCustomers: () => call<Customer[]>('listCustomers'),
    searchCustomers: (query: string, limit?: number) => call<Customer[]>('searchCustomers', query, limit ?? null),
    listBills: (filter?: BillFilter) => call<Bill[]>('listBills', filter ?? null),
    getBill: (id: string) => call<Bill | null>('getBill', id),
    saveBill: (draft: BillDraft) => call<Bill>('saveBill', draft),
    holdBill: (draft: BillDraft) => call<HeldBill>('holdBill', draft),
    listHeld: () => call<HeldBill[]>('listHeld'),
    recallHeld: (id: string) => call<HeldBill | null>('recallHeld', id),
    dashboard: () => call<DashboardStats>('dashboard'),
    topItems: (days: number, limit: number) => call<TopItem[]>('topItems', days, limit),
    lowStock: (limit: number) => call<Item[]>('lowStock', limit),
    listSuppliers: () => call<Supplier[]>('listSuppliers'),
    listPurchases: () => call<Purchase[]>('listPurchases'),
    listStockMovements: (limit: number) => call<StockMovement[]>('listStockMovements', limit),
    listProduction: () => call<ProductionBatch[]>('listProduction'),

    // ----- ShiftApi -----
    getDayStatus: () => call<DayStatus>('getDayStatus'),
    openDay: (input: { userId: string; counts: DenomCounts }) => call<Shift>('openDay', input),
    listCashEntries: () => call<CashEntry[]>('listCashEntries'),
    addCashEntry: (input: CashEntryInput) => call<CashEntry>('addCashEntry', input),
    shiftSummary: () => call<ShiftSummary>('shiftSummary'),
    verifyManagerPin: (pin: string) => call<User | null>('verifyManagerPin', pin),
    closeDay: (input: { userId: string; counts: DenomCounts; managerPin: string }) => call<ZReport | null>('closeDay', input),
    peekNextBillNumber: () => call<string>('peekNextBillNumber'),
    quickAddCustomer: (input: { name: string; phone: string }) => call<Customer>('quickAddCustomer', input),

    // ----- BillOpsApi -----
    listBillsOn: (search: BillSearch) => call<Bill[]>('listBillsOn', search),
    getBillDetail: (id: string) => call<BillDetail | null>('getBillDetail', id),
    findBillForReturn: (code: string) => call<BillDetail | null>('findBillForReturn', code),
    cancelBill: (req: CancelRequest) => call<BillDetail>('cancelBill', req),
    recordReprint: (billId: string, by: string) => call<number>('recordReprint', billId, by),
    createReturn: (req: ReturnRequest) => call<CreditNote>('createReturn', req),
    listCreditNotes: (limit?: number) => call<CreditNote[]>('listCreditNotes', limit ?? null),
    getPendingExchange: () => call<CreditNote | null>('getPendingExchange'),
    clearPendingExchange: () => call<void>('clearPendingExchange'),

    // ----- CatalogApi -----
    getItemDetail: (id: string) => call<ItemDetail | null>('getItemDetail', id),
    validateItem: (input: ItemInput) => call<ItemIssues>('validateItem', input),
    saveItem: (input: ItemInput) => call<SaveItemResult>('saveItem', input),
    generateBarcode: () => call<string>('generateBarcode'),
    nextItemCode: () => call<string>('nextItemCode'),
    listLooseItems: () => call<Item[]>('listLooseItems'),
    setItemsActive: (ids: string[], active: boolean) => call<void>('setItemsActive', ids, active),
    setItemsCategory: (ids: string[], categoryId: string) => call<void>('setItemsCategory', ids, categoryId),
    setItemsGst: (ids: string[], rate: Item['gstRate']) => call<void>('setItemsGst', ids, rate),
    setItemsBrand: (ids: string[], brandId: string) => call<void>('setItemsBrand', ids, brandId),
    listItemsPage: (query: ItemPageQuery) => call<ItemPage>('listItemsPage', query),
    itemMovements: (itemId: string, limit: number) => call<StockMovement[]>('itemMovements', itemId, limit),
    listCategoriesWithCounts: () => call<CountedCategory[]>('listCategoriesWithCounts'),
    addCategory: (name: string) => call<NameResult>('addCategory', name),
    renameCategory: (id: string, name: string) => call<NameResult>('renameCategory', id, name),
    deleteCategory: (id: string) => call<NameResult>('deleteCategory', id),
    moveCategory: (id: string, delta: -1 | 1) => call<void>('moveCategory', id, delta),
    listBrands: () => call<CountedBrand[]>('listBrands'),
    addBrand: (name: string) => call<NameResult>('addBrand', name),
    renameBrand: (id: string, name: string) => call<NameResult>('renameBrand', id, name),
    deleteBrand: (id: string) => call<NameResult>('deleteBrand', id),
    moveBrand: (id: string, delta: -1 | 1) => call<void>('moveBrand', id, delta),
    createAdjustment: (input: AdjustmentInput) => call<AdjustmentResult>('createAdjustment', input),
    listAdjustments: () => call<StockAdjustment[]>('listAdjustments'),
    startStockTake: (categoryId: string) => call<StockTakeLine[]>('startStockTake', categoryId),
    postStockTake: (counts: StockTakeCount[], note: string, managerPin?: string) => call<StockTakeResult>('postStockTake', counts, note, managerPin ?? ''),

    // ----- PurchasingApi -----
    searchPurchasable: (query: string, limit?: number) => call<Purchasable[]>('searchPurchasable', query, limit ?? null),
    listGrns: () => call<Grn[]>('listGrns'),
    getGrn: (id: string) => call<Grn | null>('getGrn', id),
    createGrn: (draft: GrnDraft) => call<Grn>('createGrn', draft),
    listSupplierSummaries: () => call<SupplierSummary[]>('listSupplierSummaries'),
    getSupplierLedger: (supplierId: string) => call<SupplierLedger | null>('getSupplierLedger', supplierId),
    saveSupplier: (draft: SupplierDraft) => call<SupplierProfile>('saveSupplier', draft),
    recordSupplierPayment: (draft: SupplierPaymentDraft) => call<SupplierLedger>('recordSupplierPayment', draft),
    listSeedProfiles: () => call<SeedProfile[]>('listSeedProfiles'),
    listPressingBatches: () => call<PressingBatch[]>('listPressingBatches'),
    createPressingBatch: (draft: PressingDraft) => call<PressingBatch>('createPressingBatch', draft),
    moveBatchToBarrel: (draft: MoveToBarrelDraft) => call<PressingBatch>('moveBatchToBarrel', draft),
    listBarrels: () => call<Barrel[]>('listBarrels'),
    listPackTargets: (barrelId: string) => call<PackTarget[]>('listPackTargets', barrelId),
    listPackRuns: () => call<PackRun[]>('listPackRuns'),
    createPackRun: (draft: PackRunDraft) => call<PackRun>('createPackRun', draft),

    // ----- CrmApi -----
    listSalesBills: (q?: SalesQuery) => call<SalesBill[]>('listSalesBills', q ?? null),
    salesFilterOptions: () => call<SalesFilterOptions>('salesFilterOptions'),
    listCustomerRows: () => call<CustomerRow[]>('listCustomerRows'),
    getCustomerProfile: (id: string) => call<CustomerProfile | null>('getCustomerProfile', id),
    saveCustomer: (input: CustomerInput) => call<CustomerRow>('saveCustomer', input),
    getCustomerWallet: (customerId: string) => call<CustomerWallet>('getCustomerWallet', customerId),
    listPointsHistory: (customerId: string, limit?: number) => call<PointsEntry[]>('listPointsHistory', customerId, limit ?? 100),
    pointsOverview: () => call<PointsOverview>('pointsOverview'),
    listPointsCustomers: (query?: PointsQuery) => call<PointsPage>('listPointsCustomers', query ?? {}),
    getPointsLedger: (customerId: string, limit?: number) => call<PointsLedgerRow[]>('getPointsLedger', customerId, limit ?? 500),
    runPointsExpiry: (dryRun?: boolean) => call<PointsExpiryResult>('runPointsExpiry', dryRun ?? true),
    pointsReport: (query?: { from?: string; to?: string }) => call<PointsReport>('pointsReport', query ?? {}),
    setCustomerCredit: (customerId: string, limit: Paise, managerPin?: string) => call<CustomerRow>('setCustomerCredit', customerId, limit, managerPin ?? ''),
    listReceivables: () => call<ReceivableRow[]>('listReceivables'),
    getStatement: (customerId: string) => call<CustStatement | null>('getStatement', customerId),
    recordCollection: (input: CollectionInput) => call<CustStatement>('recordCollection', input),
    logReminder: (customerId: string) => call<void>('logReminder', customerId),
    listRoles: () => call<RoleDef[]>('listRoles'),
    saveRoles: (roles: RoleDef[]) => call<RoleDef[]>('saveRoles', roles),
    listUserAccounts: () => call<UserAccount[]>('listUserAccounts'),
    saveUserAccount: (input: UserInput) => call<UserAccount>('saveUserAccount', input),
    resetUserPin: (userId: string) => call<{ pin: string }>('resetUserPin', userId),
    getSettingsBundle: () => call<SettingsBundle>('getSettingsBundle'),
    saveSettingsBundle: (next: SettingsBundle) => call<SettingsBundle>('saveSettingsBundle', next),
    testPrint: (kind: 'bill' | 'label' | 'labelAlign', printer: string, opts?: { paper?: string; mode?: string; printLogo?: boolean; compat?: boolean } & LabelOptions) => call<{ ok: boolean; message: string }>('testPrint', kind, printer, opts ?? {}),
    getHardware: () => call<HardwareSettings>('getHardware'),
    labelPreview: (itemIds: string[], opts?: LabelOptions) => call<LabelPreview>('labelPreview', itemIds, opts ?? {}),
    printLabels: (entries: { itemId: string; copies: number }[], opts?: LabelOptions) => call<{ ok: boolean; message: string }>('printLabels', entries, opts ?? {}),
    printDocument: (kind: PrintKind, id: string, opts?: PrintOptions) => call<{ ok: boolean; message: string }>('printDocument', kind, id, opts ?? {}),
    printerStatus: () => call<PrinterStatus>('printerStatus'),
    backupNow: () => call<BackupEntry>('backupNow'),
    backupStatus: () => call<BackupStatus>('backupStatus'),
    restoreBackup: (id: string) => call<{ ok: boolean; message: string }>('restoreBackup', id),

    // ----- ExpensesApi -----
    listExpenseCategories: () => call<ExpenseCategory[]>('listExpenseCategories'),
    saveExpenseCategories: (cats: { id?: string; name: string; active: boolean }[]) => call<ExpenseCategory[]>('saveExpenseCategories', cats),
    listExpenses: (q?: ExpenseQuery) => call<ExpenseList>('listExpenses', q ?? null),
    addExpense: (input: ExpenseInput) => call<Expense>('addExpense', input),
    editExpense: (input: ExpenseEdit) => call<Expense>('editExpense', input),
    voidExpense: (input: ExpenseVoid) => call<Expense>('voidExpense', input),
    logVoidedLine: (line: VoidedLineInput) => call<void>('logVoidedLine', line),
    // ----- PosReportsApi -----
    listStaff: () => call<Staff[]>('listStaff'),
    addStaff: (name: string) => call<Staff[]>('addStaff', name),
    salesReport: (q?: ReportQuery) => call<SalesReport>('salesReport', q ?? null),
    paymodeReport: (q?: ReportQuery) => call<PaymodeReport>('paymodeReport', q ?? null),
    staffReport: (q?: ReportQuery) => call<{ from: string; to: string; rows: StaffReportRow[] }>('staffReport', q ?? null),
    stockReport: (q?: ReportQuery) => call<StockReport>('stockReport', q ?? null),
    getUiPref: (key: string) => call<string | null>('getUiPref', key),
    setUiPref: (key: string, value: string) => call<void>('setUiPref', key, value),

    // ----- MillApi -----
    getMillSheet: (day: string) => call<MillSheet>('getMillSheet', day),
    saveMillSheet: (input: MillSheetInput) => call<MillSheet>('saveMillSheet', input),
    closeMillSheet: (input: { day: string; managerPin?: string }) => call<MillSheet>('closeMillSheet', input),
    listMillSheets: (limit?: number) => call<MillSheetSummary[]>('listMillSheets', limit ?? null),

    // ----- ReportsApi -----
    runReport: (id: ReportId, params: ReportParams) => call<ReportResult>('runReport', id, params),
  };
}
