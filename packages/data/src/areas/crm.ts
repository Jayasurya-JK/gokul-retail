import type { MockStore } from './store';
import type { Bill, Customer, Paise, PayMode, Role, UnitCode } from '../types';
import { rng } from '../seed';
import { defaultRateEntries, enabledRates, mergeRateEntries, rateOk } from '../gst';

// Area: Office sales bills, customers, credit and collections, users and roles, settings.

/* =====================================================================
 * Bills (all counters)
 * ===================================================================== */
export type SalesStatus = 'all' | 'paid' | 'credit' | 'cancelled' | 'returned';

export interface SalesQuery {
  /** yyyy-mm-dd, inclusive, local time */
  from?: string;
  to?: string;
  counter?: string;
  cashier?: string;
  mode?: PayMode | 'all';
  status?: SalesStatus;
  query?: string;
}

export interface SalesBill extends Bill {
  /** Why a bill was cancelled or returned */
  reason?: string;
  approvedBy?: string;
}

export interface SalesFilterOptions { counters: string[]; cashiers: string[] }

/* =====================================================================
 * Customers
 * ===================================================================== */
export type CustomerType = 'retail' | 'b2b';

export interface CustomerRow extends Customer {
  type: CustomerType;
  business?: string;
  gstin?: string;
  email?: string;
  address?: string;
  /** Free text kept with the customer (shown at the counter) */
  notes?: string;
  /** Customer Profile fields (POS) */
  fatherName?: string;
  /** yyyy-mm-dd */
  dob?: string;
  anniversary?: string;
  pan?: string;
  locality?: string;
  route?: string;
  creditDays?: number;
  openingBalance?: Paise;
  /** Customer since, ISO date */
  since: string;
  totalSpend: Paise;
  visits: number;
  avgBill: Paise;
  lastBillAt?: string;
}

export interface FavouriteItem { itemId: string; name: string; unit: UnitCode; qty: number; amount: Paise }

export interface CustomerProfile {
  customer: CustomerRow;
  favourites: FavouriteItem[];
  bills: Bill[];
}

export interface CustomerInput {
  id?: string;
  name: string;
  phone: string;
  area: string;
  type: CustomerType;
  business?: string;
  gstin?: string;
  email?: string;
  address?: string;
  notes?: string;
  creditLimit: Paise;
  /** Omit to keep what is stored */
  active?: boolean;
  fatherName?: string;
  dob?: string;
  anniversary?: string;
  pan?: string;
  locality?: string;
  route?: string;
  creditDays?: number;
  openingBalance?: Paise;
}

/* =====================================================================
 * Credit and collections
 * ===================================================================== */
export interface AgeingBuckets { d0_30: Paise; d31_60: Paise; d61_90: Paise; d90p: Paise }
export type AgeingKey = keyof AgeingBuckets;

export interface ReceivableRow {
  customerId: string;
  name: string;
  business?: string;
  phone: string;
  area: string;
  creditLimit: Paise;
  total: Paise;
  buckets: AgeingBuckets;
  oldestDays: number;
  lastPaymentAt?: string;
  lastPaymentAmount?: Paise;
  lastReminderAt?: string;
}

export interface CustStatementEntry {
  id: string;
  date: string; // ISO
  ref: string;
  kind: 'bill' | 'payment';
  note: string;
  debit: Paise;
  credit: Paise;
  balance: Paise;
}

export interface CustStatement {
  customer: CustomerRow;
  entries: CustStatementEntry[];
  balance: Paise;
  buckets: AgeingBuckets;
}

export interface CollectionInput {
  customerId: string;
  amount: Paise;
  mode: 'cash' | 'upi';
  ref?: string;
  note?: string;
}

/* =====================================================================
 * Users and roles
 * ===================================================================== */
export type ManagerPinAction =
  | 'discount_over_limit' | 'cancel_bill' | 'return' | 'price_override' | 'void_line' | 'open_drawer' | 'credit_over_limit' | 'stock_adjust';

export const managerPinActions: { key: ManagerPinAction; label: string; hint: string }[] = [
  { key: 'discount_over_limit', label: 'Discount above limit', hint: 'Bill or line discount over the role limit' },
  { key: 'cancel_bill', label: 'Cancel a saved bill', hint: 'Whole bill is voided' },
  { key: 'return', label: 'Sales return / credit note', hint: 'Goods come back, money goes out' },
  { key: 'price_override', label: 'Change an item price', hint: 'Selling price edited at the counter' },
  { key: 'void_line', label: 'Delete a line after scan', hint: 'Removes a scanned item from the bill' },
  { key: 'open_drawer', label: 'Open cash drawer (no sale)', hint: 'Drawer kicked without a bill' },
  { key: 'credit_over_limit', label: 'Credit above customer limit', hint: 'Sale on credit beyond the limit' },
  { key: 'stock_adjust', label: 'Stock adjustment', hint: 'Writes stock up or down' },
];

export type PermissionKey =
  | 'canCancelBill' | 'canReturn' | 'canEditPrices' | 'canSeeCost' | 'canSeeReports'
  | 'canManageItems' | 'canManageStock' | 'canCollectCredit' | 'canOpenDrawer' | 'canManageUsers' | 'canChangeSettings' | 'canEditRecords';

export const permissionDefs: { key: PermissionKey; label: string; hint: string; group: 'Counter' | 'Back office' }[] = [
  { key: 'canCancelBill', label: 'Cancel a bill', hint: 'Void a saved bill', group: 'Counter' },
  { key: 'canReturn', label: 'Sales returns', hint: 'Take goods back against a bill', group: 'Counter' },
  { key: 'canEditPrices', label: 'Edit prices at counter', hint: 'Override the item price while billing', group: 'Counter' },
  { key: 'canOpenDrawer', label: 'Open drawer without sale', hint: 'No-sale drawer kick', group: 'Counter' },
  { key: 'canCollectCredit', label: 'Collect credit payments', hint: 'Record customer dues received', group: 'Counter' },
  { key: 'canSeeCost', label: 'See purchase cost and margin', hint: 'Cost price columns', group: 'Back office' },
  { key: 'canSeeReports', label: 'See reports', hint: 'Sales, GST, stock and profit reports', group: 'Back office' },
  { key: 'canManageItems', label: 'Add and edit items', hint: 'Item master, categories, labels', group: 'Back office' },
  { key: 'canManageStock', label: 'Stock and purchases', hint: 'GRN, adjustments, production', group: 'Back office' },
  { key: 'canManageUsers', label: 'Manage users and roles', hint: 'Create users, reset PINs', group: 'Back office' },
  { key: 'canChangeSettings', label: 'Change settings', hint: 'Shop, tax, printers, backup', group: 'Back office' },
  { key: 'canEditRecords', label: 'Edit or delete saved records', hint: 'Correct or remove a saved pressing batch or godown entry', group: 'Back office' },
];

export interface RoleDef {
  id: Role;
  name: string;
  description: string;
  /** Maximum discount the role can give without a manager PIN, percent of bill */
  discountLimitPct: number;
  perms: Record<PermissionKey, boolean>;
  pinFor: ManagerPinAction[];
  locked?: boolean;
}

export interface UserAccount {
  id: string;
  name: string;
  role: Role;
  initials: string;
  color: string;
  phone: string;
  active: boolean;
  lastLogin: string;
  pinChangedAt: string;
  /** Bills billed in the last 30 days */
  bills30d: number;
}

export interface UserInput {
  id?: string;
  name: string;
  role: Role;
  phone: string;
  active: boolean;
  /** New PIN, 4 digits. Required for a new user. */
  pin?: string;
}

/* =====================================================================
 * Settings
 * ===================================================================== */
export interface ShopSettings {
  name: string;
  legalName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  gstin: string;
  fssai: string;
  /** Short name on stickers (GOKUL) */
  shortName: string;
  /** Tamil line under the shop name on the bill */
  tagline: string;
  /** Number for orders on WhatsApp, printed at the foot of the bill */
  whatsapp: string;
  /** Data URL of the logo, if one was chosen */
  logo?: string;
}

export interface TaxSettings {
  scheme: 'regular' | 'composition';
  compositionRatePct: number;
  /** Rates enabled for items */
  rates: { rate: number; enabled: boolean; label: string }[];
  pricesInclusive: boolean;
  roundToRupee: boolean;
  showHsn: boolean;
  interState: boolean;
  /** GST percent on a POS home-delivery charge; 0 = delivery is not taxed */
  deliveryGstRate?: number;
}

export interface BillFormatSettings {
  header: string;
  footer: string;
  showSavings: boolean;
  showHsn: boolean;
  showGstSummary: boolean;
  showQr: boolean;
  /** UPI id for the pay QR on the bill (e.g. shop@bank); empty prints the bill number as the QR */
  upiId: string;
  language: 'en' | 'ta';
  copies: number;
  paper: '80mm' | '58mm';
  /** Tamil line under the item lines at the foot of the bill */
  footerTamil: string;
  /** Bill heading by how it was paid */
  titleCash: string; titleUpi: string; titleCard: string; titleCredit: string; titleOther: string;
  /** Print Tamil item names (as pictures) instead of English ones */
  tamilNames: boolean;
  /** 'yy/nnnnn' prints 26/00123, 'raw' prints the internal number */
  numberFormat: 'yy/nnnnn' | 'raw';
}

export interface PrinterSettings {
  /** 'escpos' sends raw ESC/POS to a thermal printer; 'driver' prints through the normal Windows driver (laser, inkjet, PDF) */
  mode: 'escpos' | 'driver';
  printLogo: boolean;
  billPrinter: string;
  labelPrinter: string;
  autoPrint: boolean;
  openDrawerOnCash: boolean;
  cutter: boolean;
  /** Safe mode for a bill printer that misbehaves: no logo picture and no QR code (text, barcode and cut only) */
  compat: boolean;
  /** Label printer (TSC TE244): ready size id, or 'custom' with the size below */
  labelPreset: LabelPresetId;
  labelWidth: number;
  labelHeight: number;
  labelGap: number;
  labelColumns: number;
  labelColGap: number;
  /** 0 to 15 */
  labelDarkness: number;
  /** inches per second */
  labelSpeed: number;
  /** calibration shift in dots (8 dots = 1 mm) */
  labelOffsetX: number;
  labelOffsetY: number;
  /** labels come out upside down: turn the print 180 degrees */
  labelFlip: boolean;
  /** Extra left start in mm (0 to 5) for the Gokul 3-up content: 0 by default */
  labelStartMm: number;
  /** Label alignment read from the calibration row, mm, 0.5 steps (-4 to +4): moves every label job and the preview (positive = right / down) */
  labelAlignX: number;
  labelAlignY: number;
  /** Extra mm per column step across the roll, 0.1 steps (-1 to +1), when sticker 3 drifts */
  labelPitchAdjust: number;
  /** Before a job, pull the row the printer pushed to the tear bar back to the print head (SET TEAR ON + BACKFEED) so no blank row is wasted */
  labelPullBack: boolean;
  /** How far the printer feeds a row past the head to the tear bar, mm */
  labelPullBackMm: number;
  /** Ribbon (thermal transfer) printing: on for the TE244, off for direct thermal paper */
  labelRibbon: boolean;
  /** How the rupee sign prints on the Gokul 3-up: a picture and Rs. (both), the picture only, or Rs. text only */
  labelRupee: 'both' | 'symbol' | 'text';
  /** Text before the price on the Gokul sticker (the printer cannot print the rupee sign) */
  labelPricePrefix: string;
  /** Read-only: the printers Windows reports right now */
  detected: { name: string; kind: 'thermal' | 'label' | 'other'; ready: boolean; state?: string; port?: string; driver?: string; isDefault?: boolean; note?: string }[];
}

export type LabelPresetId = 'gokul-small' | '50x25' | '38x25-2up' | '32x25-3up' | '100x50' | 'custom';

/** The sticker sizes that are ready to use (the printing code in Rust has the same list). */
export const LABEL_PRESETS: { id: Exclude<LabelPresetId, 'custom'>; label: string; hint: string; width: number; height: number; gap: number; columns: number; colGap: number }[] = [
  { id: 'gokul-small', label: 'Gokul small 38 x 25 mm', hint: 'GOKUL, name, QR of the code, price, Pkd and Exp', width: 38, height: 25, gap: 3, columns: 1, colGap: 0 },
  { id: '50x25', label: '50 x 25 mm', hint: 'One across', width: 50, height: 25, gap: 3, columns: 1, colGap: 0 },
  { id: '38x25-2up', label: '38 x 25 mm, 2 across', hint: '79 mm of the 4 inch roll', width: 38, height: 25, gap: 3, columns: 2, colGap: 3 },
  { id: '32x25-3up', label: 'Gokul 3-up (33x25)', hint: 'Ribbon sticker: GOKUL, name, QR, rupee price, code, Pkd and Exp. 103 mm of the 104 mm print width', width: 33, height: 25, gap: 3, columns: 3, colGap: 2 },
  { id: '100x50', label: '100 x 50 mm', hint: 'Big sticker, one across', width: 100, height: 50, gap: 3, columns: 1, colGap: 0 },
];

/** Scanner settings the counter reads: how fast keystrokes must arrive to count as a barcode scan. */
export interface HardwareSettings {
  /** Largest pause between two keys (ms) that still counts as the scanner typing. Hands are slower than 40 ms. */
  scanGapMs: number;
  /** Shortest code (characters) accepted as a scan */
  scanMinLen: number;
  /** Short beep when a scanned code is not found */
  scanBeep: boolean;
}

/** Which fields a sticker carries. */
export interface LabelFieldChoice {
  shop: boolean; name: boolean; mrp: boolean; price: boolean; barcode: boolean; dates: boolean; batch: boolean; net: boolean; legal: boolean; qr: boolean;
}
export interface LabelOptions {
  preset?: LabelPresetId;
  width?: number; height?: number; gap?: number; columns?: number; colGap?: number;
  darkness?: number; speed?: number; offsetX?: number; offsetY?: number; flip?: boolean; startMm?: number;
  ribbon?: boolean; rupee?: PrinterSettings['labelRupee'];
  alignX?: number; alignY?: number; pitchAdjust?: number; pullBack?: boolean; pullBackMm?: number;
  /** testPrint('labelAlign'): print the row with the saved correction applied, to check it */
  verify?: boolean;
  /** Label printer name; empty uses the one saved in Settings */
  printer?: string;
  fields?: Partial<LabelFieldChoice>;
  /** YYYY-MM-DD, default today */
  packDate?: string;
  /** YYYY-MM-DD printed after Exp for every item; empty uses each item's shelf life (an item without one prints a blank Exp) */
  expDate?: string;
  /** Months until best before; 0 prints no date; default by category */
  bestBeforeMonths?: number;
  batch?: string;
}
/** One thing the printer draws, in dots (203 dpi, 8 dots = 1 mm) from the sticker's top-left corner. */
export type LabelElement =
  | { k: 'text'; x: number; y: number; font: number; xm: number; ym: number; text: string }
  | { k: 'barcode'; x: number; y: number; h: number; kind: string; data: string; narrow: number; w: number; rects: [number, number][] }
  | { k: 'qr'; x: number; y: number; cell: number; data: string; size: number; rows: string[] }
  | { k: 'bar'; x: number; y: number; w: number; h: number }
  | { k: 'frame'; x: number; y: number; w: number; h: number; t: number }
  | { k: 'bitmap'; x: number; y: number; w: number; rows: string[] };
export interface LabelPreview {
  ok: boolean;
  message: string;
  spec: { widthMm: number; heightMm: number; gapMm: number; columns: number; colGapMm: number; cellW: number; cellH: number; colGapDots: number; alignXMm?: number; alignYMm?: number; pitchAdjustMm?: number; shiftXDots?: number; shiftYDots?: number; pullBack?: boolean; pullBackMm?: number } | null;
  labels: { itemId: string; elements: LabelElement[] }[];
}

export interface BackupEntry { id: string; at: string; sizeMb: number; kind: 'auto' | 'manual' | 'day-close'; ok: boolean }

/** What the Office status bar shows: the last good backup and whether it is too old (over 24 hours) or the last try failed. */
export interface BackupStatus {
  lastAt: string | null;
  ageHours: number | null;
  stale: boolean;
  lastError: string | null;
  schedule: string;
  time: string;
  location: string;
  keep: number;
}

export interface BackupSettings {
  schedule: 'off' | 'daily' | 'twice' | 'hourly';
  time: string;
  location: string;
  keep: number;
  copyToUsb: boolean;
  history: BackupEntry[];
}

export interface SecuritySettings {
  /** Wrong PINs before a user is locked out (3 to 20) */
  lockoutAttempts: number;
  /** How long the lock lasts, in seconds (10 to 3600) */
  lockoutSeconds: number;
  /** A cashier needs a manager PIN to remove a scanned line (off by default; removals are always logged) */
  voidLineNeedsPin: boolean;
}

export interface ExpenseSettings {
  /** An expense above this needs a manager PIN (paise) */
  limit: Paise;
}

export interface MillSettings {
  /** Operators listed on the mill daily sheet, one grid each */
  operators: string[];
  /** Aravai charge per kg of seed when the customer takes the cake (paise, GST included) */
  rateCakeTaken: Paise;
  /** Lower charge per kg when the shop keeps the cake (paise, GST included) */
  rateCakeKept: Paise;
  /** Service accounting code printed on the aravai bill (verify with the accountant) */
  serviceSac: string;
  /** GST rate on the aravai charge: 0, 5, 12 or 18 (verify with the accountant) */
  serviceGstRate: number;
}

export interface LoyaltySettings {
  enabled: boolean;
  /** Rupees of bill value that earn one point */
  rupeesPerPoint: number;
  /** What one point is worth when redeemed, in paise (confirm with the owner) */
  pointValue: Paise;
  minRedeem: number;
  /** Points may pay at most this percent of a bill */
  maxPct: number;
  /** Points lapse this many months after they were earned (0 = never expire). Each earning keeps its own date; expiry runs by itself. */
  expiryMonths: number;
  /** Print "N pts expire dd/mm/yy" on the bill when points lapse within 30 days */
  printExpiry: boolean;
  /** The day imported POSBean balances count as earned (yyyy-mm-dd). Changed by the owner in Settings, Loyalty. */
  goLiveDate: string;
  /** Category ids whose lines earn no points (e.g. Service charges) */
  excludeCategories: string[];
}
export interface CustomerWallet {
  points: number;
  pointsValue: Paise;
  storeCredit: Paise;
  creditNotes: { number: string; at: string; balance: Paise }[];
  rules: LoyaltySettings;
  /** The next points to lapse: how many and on which day (yyyy-mm-dd); null when nothing expires. */
  nextExpiry: { points: number; on: string } | null;
}
/** import = the opening balance brought in from the old software */
export type PointsKind = 'earn' | 'redeem' | 'reverse' | 'adjust' | 'expire' | 'import';
export interface PointsEntry { at: string; kind: PointsKind; points: number; note: string; by: string; bill: string | null }

/* ---- Customer Points module (points are always numbers with two decimals; money in paise) ---- */
export interface PointsOverview {
  /** Points customers can still use (positive balances) */
  outstanding: number;
  /** Net of negative balances: what the old software's total showed */
  netTotal: number;
  negativeBalances: number;
  negativePoints: number;
  /** outstanding x value of a point */
  liability: Paise;
  customersWithPoints: number;
  customers: number;
  earnedMonth: number;
  redeemedMonth: number;
  expiredMonth: number;
  adjustedMonth: number;
  pointValue: Paise;
  expiryMonths: number;
  enabled: boolean;
  /** Points that lapse in the next 30 days, and how many customers hold them */
  expiring30: { points: number; customers: number };
  goLiveDate: string;
}
export interface PointsQuery {
  q?: string;
  filter?: 'all' | 'withPoints' | 'zero' | 'expiring';
  sort?: 'points' | 'name' | 'code' | 'lastEarned' | 'lastRedeemed';
  dir?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}
export interface PointsCustomerRow { id: string; name: string; phone: string; area: string; points: number; lastEarned: string | null; lastRedeemed: string | null; /** day the oldest points lapse (yyyy-mm-dd) */ expiresOn: string | null }
export interface PointsPage { rows: PointsCustomerRow[]; /** customers the search matched */ matched: number; /** all customers */ total: number }
export interface PointsLedgerRow { id: number; at: string; kind: PointsKind; points: number; balanceAfter: number; bill: string | null; note: string; by: string }
/** Read-only: customers whose points lapse in the next `days` days (soonest first). */
export interface PointsExpiring { days: number; customers: number; points: number; rows: { id: string; name: string; phone: string; points: number; expiresOn: string }[] }
export interface PointsReport {
  from: string; to: string;
  byDay: { date: string; earned: number; redeemed: number; expired: number; adjusted: number }[];
  top: { id: string; name: string; phone: string; points: number; earned: number; redeemed: number }[];
  liability: { outstanding: number; value: Paise; customers: number; pointValue: Paise };
}
export type PrintKind = 'bill' | 'creditNote' | 'xreport' | 'zreport' | 'expense' | 'receipt' | 'drawer';
export interface PrintOptions {
  /** Reprint: the paper says DUPLICATE COPY and the drawer stays shut */
  duplicate?: boolean;
  /** Right after a sale: obeys "print bill automatically" and the drawer setting */
  auto?: boolean;
  /** Change given back (paise), printed under the payments */
  change?: Paise;
  /** The Z report that was just closed */
  payload?: unknown;
}
export interface PrinterStatus {
  configured: boolean;
  ready: boolean;
  state: 'ready' | 'offline' | 'paper_out' | 'paper_jam' | 'door_open' | 'error' | 'not_found' | 'none';
  name: string;
  mode: 'escpos' | 'driver';
  message: string;
}

export interface SettingsBundle {
  loyalty: LoyaltySettings;
  shop: ShopSettings;
  tax: TaxSettings;
  billFormat: BillFormatSettings;
  printers: PrinterSettings;
  hardware: HardwareSettings;
  backup: BackupSettings;
  security: SecuritySettings;
  expenses: ExpenseSettings;
  mill: MillSettings;
}

export interface CrmApi {
  /* bills */
  listSalesBills(q?: SalesQuery): Promise<SalesBill[]>;
  salesFilterOptions(): Promise<SalesFilterOptions>;
  /* customers */
  listCustomerRows(): Promise<CustomerRow[]>;
  getCustomerProfile(id: string): Promise<CustomerProfile | null>;
  saveCustomer(input: CustomerInput): Promise<CustomerRow>;
  /** Switch a customer off (hidden from the POS pickers, refused on new bills) or on again. History stays. */
  setCustomerActive(customerId: string, active: boolean): Promise<CustomerRow>;
  /** The one credit rule: limit 0 = credit not allowed, above 0 = allowed up to that amount, -1 (NO_CREDIT_LIMIT) = no limit. Needs a manager PIN for a cashier. */
  setCustomerCredit(customerId: string, limit: Paise, managerPin?: string): Promise<CustomerRow>;
  /** Points, store credit (open credit notes) and the loyalty rules for one customer */
  getCustomerWallet(customerId: string): Promise<CustomerWallet>;
  listPointsHistory(customerId: string, limit?: number): Promise<PointsEntry[]>;
  /* customer points module (Office; the POS shows balances and the ledger read-only) */
  /** Owner and manager only. */
  pointsOverview(): Promise<PointsOverview>;
  /** Server-side search and paging over every customer (name, mobile, code, area). */
  listPointsCustomers(query?: PointsQuery): Promise<PointsPage>;
  /** Every earn, redeem, adjust, reverse, expire and import row of one customer, newest first, with the balance after each. */
  getPointsLedger(customerId: string, limit?: number): Promise<PointsLedgerRow[]>;
  /** Read-only "Expiring soon". Points lapse by themselves on app start and Day open; there is nothing to press. */
  pointsExpiring(days?: number): Promise<PointsExpiring>;
  /** Owner only, audited: the day imported points count as earned. Re-dates only the imported lots. */
  setLoyaltyGoLive(date: string): Promise<{ goLiveDate: string; lots: number }>;
  pointsReport(query?: { from?: string; to?: string }): Promise<PointsReport>;
  /* credit */
  listReceivables(): Promise<ReceivableRow[]>;
  getStatement(customerId: string): Promise<CustStatement | null>;
  recordCollection(input: CollectionInput): Promise<CustStatement>;
  logReminder(customerId: string): Promise<void>;
  /* users and roles */
  listRoles(): Promise<RoleDef[]>;
  saveRoles(roles: RoleDef[]): Promise<RoleDef[]>;
  listUserAccounts(): Promise<UserAccount[]>;
  saveUserAccount(input: UserInput): Promise<UserAccount>;
  resetUserPin(userId: string): Promise<{ pin: string }>;
  /* settings */
  getSettingsBundle(): Promise<SettingsBundle>;
  saveSettingsBundle(next: SettingsBundle): Promise<SettingsBundle>;
  /** A real test page: a bill, or a calibration label (frame, ruler, scannable code) with the label settings passed in `opts`. */
  testPrint(kind: 'bill' | 'label' | 'labelAlign', printer: string, opts?: { paper?: string; mode?: string; printLogo?: boolean; compat?: boolean } & LabelOptions): Promise<{ ok: boolean; message: string }>;
  /** Scanner settings; any signed-in user (the counter needs them) */
  getHardware(): Promise<HardwareSettings>;
  /** The exact elements the printer will draw for each item (the preview on the Labels page). */
  labelPreview(itemIds: string[], opts?: LabelOptions): Promise<LabelPreview>;
  /** Prints barcode stickers: `copies` per item. A problem is an answer `{ ok: false, message }`. */
  printLabels(entries: { itemId: string; copies: number }[], opts?: LabelOptions): Promise<{ ok: boolean; message: string }>;
  /** Prints a saved document. A printing problem is an answer ({ ok: false, message }), never an error: the record stays saved. */
  printDocument(kind: PrintKind, id: string, opts?: PrintOptions): Promise<{ ok: boolean; message: string }>;
  /** The real state of the bill printer: configured and reachable */
  printerStatus(): Promise<PrinterStatus>;
  backupNow(): Promise<BackupEntry>;
  backupStatus(): Promise<BackupStatus>;
  restoreBackup(id: string): Promise<{ ok: boolean; message: string }>;
}

/* ===================================================================== */

const dayKey = (d: Date | string) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const daysAgo = (n: number, hour = 11) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 20 + (n % 30), 0, 0);
  return d.toISOString();
};
const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const delay = <T,>(v: T): Promise<T> => Promise.resolve(v);

const BUSINESSES = [
  'Sri Annapoorna Mess', 'Kovai Sweets and Snacks', 'Murugan Idli Kadai', 'Vinayaga Tiffin Centre', 'Lakshmi Catering Service',
  'Pandian Provision Stores', 'Thendral Hotel', 'Sakthi Mess', 'Aishwarya Bakery', 'Velavan Traders',
];

interface Extra {
  type: CustomerType; business?: string; gstin?: string; email?: string; address?: string; notes?: string; since: string;
  fatherName?: string; dob?: string; anniversary?: string; pan?: string; locality?: string; route?: string; creditDays?: number; openingBalance?: Paise;
}

interface Invoice { id: string; date: string; ref: string; amount: Paise; open: Paise; note: string }
interface Pay { id: string; date: string; ref: string; amount: Paise; mode: 'cash' | 'upi'; note: string }
interface Ledger { invoices: Invoice[]; payments: Pay[]; lastReminderAt?: string }


function allOn(): Record<PermissionKey, boolean> {
  return Object.fromEntries(permissionDefs.map((p) => [p.key, true])) as Record<PermissionKey, boolean>;
}

function seedRoles(): RoleDef[] {
  const manager = allOn();
  manager.canManageUsers = false;
  manager.canChangeSettings = false;
  manager.canEditRecords = false;
  const staff = Object.fromEntries(permissionDefs.map((p) => [p.key, false])) as Record<PermissionKey, boolean>;
  staff.canCollectCredit = true;
  staff.canManageStock = true;
  const cashier = Object.fromEntries(permissionDefs.map((p) => [p.key, false])) as Record<PermissionKey, boolean>;
  cashier.canCollectCredit = true;
  return [
    { id: 'owner', name: 'Owner', description: 'Full control of shop, money and settings.', discountLimitPct: 100, perms: allOn(), pinFor: [], locked: true },
    { id: 'admin', name: 'Admin', description: 'Full access, same as owner', discountLimitPct: 100, perms: allOn(), pinFor: [], locked: true },
    {
      id: 'manager', name: 'Manager', description: 'Runs the floor. Approves exceptions with their own PIN.', discountLimitPct: 15, perms: manager,
      pinFor: ['stock_adjust'],
    },
    {
      id: 'staff', name: 'Staff', description: 'Entry only. Cannot edit or delete saved records.', discountLimitPct: 2, perms: staff,
      pinFor: ['discount_over_limit', 'cancel_bill', 'return', 'price_override', 'void_line', 'open_drawer', 'credit_over_limit', 'stock_adjust'],
    },
    {
      id: 'cashier', name: 'Cashier', description: 'Bills at the counter only.', discountLimitPct: 2, perms: cashier,
      pinFor: ['discount_over_limit', 'cancel_bill', 'return', 'price_override', 'void_line', 'open_drawer', 'credit_over_limit'],
    },
  ];
}

function seedSettings(store: MockStore): SettingsBundle {
  const s = store.settings;
  return {
    loyalty: { enabled: true, rupeesPerPoint: 100, pointValue: 100, minRedeem: 100, maxPct: 100, expiryMonths: 12, printExpiry: true, goLiveDate: '2026-11-07', excludeCategories: [] },
    shop: {
      name: s.shopName, legalName: 'Gokul Oils (Proprietor: Suresh Kumar)', address: '48, Mettupalayam Road, Gandhipuram',
      city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641012', phone: s.phone, email: 'gokuloils.cbe@gmail.com',
      gstin: s.gstin, fssai: '12418009000417', shortName: 'GOKUL', tagline: '', whatsapp: '',
    },
    tax: {
      scheme: 'regular', compositionRatePct: 1,
      rates: defaultRateEntries(),
      pricesInclusive: true, roundToRupee: s.roundToRupee, showHsn: true, interState: false,
    },
    billFormat: {
      header: 'Cold pressed oils, made in front of you', footer: s.receiptFooter, showSavings: true, showHsn: true,
      showGstSummary: true, showQr: false, upiId: '', language: 'en', copies: 1, paper: '80mm',
      footerTamil: '', titleCash: 'Cash Bill', titleUpi: 'BHARATQR Bill', titleCard: 'Card Bill', titleCredit: 'Credit Bill', titleOther: 'Bill', tamilNames: false, numberFormat: 'yy/nnnnn',
    },
    printers: {
      mode: 'escpos', printLogo: true, billPrinter: s.printer, labelPrinter: 'TSC TE244', autoPrint: true, openDrawerOnCash: true, cutter: true,
      compat: false, labelPricePrefix: 'Rs.', labelPreset: '32x25-3up', labelWidth: 33, labelHeight: 25, labelGap: 3, labelColumns: 3, labelColGap: 2, labelDarkness: 8, labelRibbon: true, labelRupee: 'both', labelStartMm: 0, labelAlignX: 0, labelAlignY: 0, labelPitchAdjust: 0, labelPullBack: true, labelPullBackMm: 12,
      labelSpeed: 4, labelOffsetX: 0, labelOffsetY: 0, labelFlip: false,
      detected: [
        { name: s.printer, kind: 'thermal', ready: true },
        { name: 'TSC TE244', kind: 'label', ready: true },
        { name: 'Microsoft Print to PDF', kind: 'other', ready: true },
        { name: 'Epson TM-T82 (USB002)', kind: 'thermal', ready: false },
      ],
    },
    hardware: { scanGapMs: 30, scanMinLen: 3, scanBeep: true },
    security: { lockoutAttempts: 5, lockoutSeconds: 60, voidLineNeedsPin: false },
    expenses: { limit: 100000 },
    mill: { operators: ['Ambethkar'], rateCakeTaken: 800, rateCakeKept: 500, serviceSac: '998811', serviceGstRate: 5 },
    backup: {
      schedule: 'daily', time: '02:00', location: 'D:\\GokulBackup', keep: 30, copyToUsb: false,
      history: Array.from({ length: 7 }, (_, i) => ({
        id: `bk${i + 1}`, at: daysAgo(i, 2), sizeMb: 38 + (6 - i) * 0.7 + (i % 3) * 0.4, kind: 'auto' as const, ok: i !== 4,
      })),
    },
  };
}

export function createCrmMock(store: MockStore): CrmApi {
  /* ---------- bills: give the seed some counters and exceptions ---------- */
  const reasons: Record<string, { reason: string; approvedBy: string }> = {};
  store.bills.forEach((b, i) => {
    if (i % 3 === 0) b.counter = 'Counter 2';
    if (b.status !== 'paid') return;
    if (i % 41 === 7) {
      b.status = 'cancelled';
      reasons[b.id] = { reason: ['Customer changed mind', 'Wrong item scanned', 'Duplicate bill', 'Rate disputed'][i % 4], approvedBy: 'Lakshmi Rajan' };
    } else if (i % 67 === 11) {
      b.status = 'returned';
      reasons[b.id] = { reason: ['Seal broken, oil leaked', 'Wrong pack size', 'Customer returned unopened tin'][i % 3], approvedBy: 'Lakshmi Rajan' };
    }
  });

  const extras = new Map<string, Extra>();
  const rr = rng(77);
  store.customers.forEach((c, i) => {
    const b2b = i % 7 === 3;
    extras.set(c.id, {
      type: b2b ? 'b2b' : 'retail',
      business: b2b ? BUSINESSES[(i >> 1) % BUSINESSES.length] : undefined,
      gstin: b2b ? `33${String.fromCharCode(65 + (i % 20))}${String.fromCharCode(66 + (i % 18))}${String.fromCharCode(67 + (i % 15))}PM${1000 + i * 37}K1Z${String.fromCharCode(65 + (i % 9))}` : undefined,
      email: i % 4 === 0 ? `${c.name.split(' ')[0].toLowerCase()}${10 + i}@gmail.com` : undefined,
      address: `${12 + i}, ${c.area}, Coimbatore`,
      since: daysAgo(40 + Math.floor(rr() * 600)),
    });
  });

  const nonCancelled = (b: Bill) => b.status !== 'cancelled';

  const rowFor = (c: Customer): CustomerRow => {
    const ex = extras.get(c.id)!;
    let spend = 0, visits = 0, last: string | undefined;
    for (const b of store.bills) {
      if (b.customerId !== c.id || !nonCancelled(b)) continue;
      spend += b.status === 'returned' ? 0 : b.totals.grand;
      visits += 1;
      last = b.at;
    }
    return { ...c, ...ex, totalSpend: spend, visits, avgBill: visits ? Math.round(spend / visits) : 0, lastBillAt: last };
  };

  /* ---------- points ledger (mock: built once from each customer's balance, newest row first; amounts in hundredths inside) ---------- */
  const pointRows = new Map<string, PointsLedgerRow[]>();
  let pointSeq = 0;
  const pointsLedgerOf = (id: string): PointsLedgerRow[] => {
    let rows = pointRows.get(id);
    if (!rows) {
      const c = store.customers.find((x) => x.id === id);
      const total = Math.round((c?.loyaltyPoints ?? 0) * 100);
      const h = hash(id);
      const out: PointsLedgerRow[] = [];
      if (total > 0) {
        const opening = Math.round(total * (0.5 + (h % 20) / 100));
        const earn1 = Math.round(total * 0.2);
        const spent = h % 3 === 0 ? Math.round(total * 0.12) : 0;
        const earn2 = total - opening - earn1 + spent;
        const seq: [PointsKind, number, number, string, string][] = [
          ['import', opening, 34 + (h % 20), 'Opening points from POSBean', 'import'],
          ['earn', earn1, 12 + (h % 9), `Bill GK-26-00${400 + (h % 90)}`, 'Karthik Murugan'],
        ];
        if (spent) seq.push(['redeem', -spent, 6, `Paid on GK-26-00${480 + (h % 40)}`, 'Karthik Murugan']);
        seq.push(['earn', earn2, 1 + (h % 4), `Bill GK-26-00${520 + (h % 60)}`, 'Priya Selvam']);
        let bal = 0;
        for (const [kind, pts, ago, note, by] of seq) {
          bal += pts;
          out.push({ id: ++pointSeq, at: daysAgo(ago), kind, points: pts / 100, balanceAfter: bal / 100, bill: note.startsWith('Bill ') ? note.slice(5) : note.startsWith('Paid on ') ? note.slice(8) : null, note, by });
        }
      }
      rows = out.reverse();
      pointRows.set(id, rows);
    }
    return rows;
  };
  const lastOf = (id: string, kind: PointsKind): string | null => pointsLedgerOf(id).find((r) => r.kind === kind)?.at ?? null;
  const pointsMatch = (q: { q?: string; filter?: string }): Customer[] => {
    const toks = (q.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    return store.customers.filter((c) => {
      if (q.filter === 'withPoints' && !(c.loyaltyPoints > 0)) return false;
      if (q.filter === 'zero' && c.loyaltyPoints !== 0) return false;
      const hay = `${c.name} ${c.id} ${c.area} ${c.phone} ${c.phone.replace(' ', '')}`.toLowerCase();
      return toks.every((t) => hay.includes(t));
    });
  };

  /* ---------- credit ledgers ---------- */
  const ledgers = new Map<string, Ledger>();
  let refSeq = 90;
  const buildLedger = (c: Customer): Ledger => {
    const r = rng(hash(c.id));
    const invoices: Invoice[] = [];
    const payments: Pay[] = [];
    // one old, fully settled bill so statements are not a single line
    const oldAmt = Math.round((c.creditLimit || 500000) * (0.12 + r() * 0.2) / 100) * 100;
    invoices.push({ id: `${c.id}-i0`, date: daysAgo(175 + Math.floor(r() * 20)), ref: `GK-0${47010 + hash(c.id) % 90}`, amount: oldAmt, open: 0, note: 'Credit sale' });
    payments.push({ id: `${c.id}-p0`, date: daysAgo(160), ref: 'RCPT-0112', amount: oldAmt, mode: 'cash', note: 'Settled in full' });
    if (c.outstanding > 0) {
      const bands: [number, number][] = [[91, 160], [62, 88], [32, 58], [2, 28]];
      const n = 1 + Math.floor(r() * 4);
      const chosen = [...bands].sort(() => r() - 0.5).slice(0, n).sort((a, b) => b[0] - a[0]);
      const w = chosen.map(() => 0.3 + r());
      const wSum = w.reduce((a, b) => a + b, 0);
      let left = c.outstanding;
      chosen.forEach(([lo, hi], idx) => {
        const amt = idx === chosen.length - 1 ? left : Math.min(left, Math.round((c.outstanding * w[idx]) / wSum / 100) * 100);
        left -= amt;
        const age = lo + Math.floor(r() * (hi - lo));
        refSeq += 1 + Math.floor(r() * 40);
        if (amt > 0) invoices.push({ id: `${c.id}-i${idx + 1}`, date: daysAgo(age), ref: `GK-0${47000 + refSeq}`, amount: amt, open: amt, note: 'Credit sale' });
      });
      // a partial payment against the oldest open invoice, recorded as already applied
    }
    return { invoices, payments };
  };
  const ledgerOf = (c: Customer) => {
    let l = ledgers.get(c.id);
    if (!l) { l = buildLedger(c); ledgers.set(c.id, l); }
    return l;
  };
  const ageDays = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  const bucketsOf = (l: Ledger): AgeingBuckets => {
    const b: AgeingBuckets = { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
    for (const inv of l.invoices) {
      if (inv.open <= 0) continue;
      const d = ageDays(inv.date);
      if (d <= 30) b.d0_30 += inv.open;
      else if (d <= 60) b.d31_60 += inv.open;
      else if (d <= 90) b.d61_90 += inv.open;
      else b.d90p += inv.open;
    }
    return b;
  };
  const sumBuckets = (b: AgeingBuckets) => b.d0_30 + b.d31_60 + b.d61_90 + b.d90p;

  const statementFor = (c: Customer): CustStatement => {
    const l = ledgerOf(c);
    const raw = [
      ...l.invoices.map((i) => ({ id: i.id, date: i.date, ref: i.ref, kind: 'bill' as const, note: i.note, debit: i.amount, credit: 0 })),
      ...l.payments.map((p) => ({ id: p.id, date: p.date, ref: p.ref, kind: 'payment' as const, note: p.note, debit: 0, credit: p.amount })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    let bal = 0;
    const entries = raw.map((e) => { bal += e.debit - e.credit; return { ...e, balance: bal }; });
    return { customer: rowFor(c), entries, balance: bal, buckets: bucketsOf(l) };
  };

  /* ---------- users ---------- */
  const accountState = new Map<string, { active: boolean; phone: string; pinChangedAt: string }>();
  store.users.forEach((u, i) => accountState.set(u.id, { active: true, phone: `9${4200 + i * 211} ${10000 + i * 7331}`.slice(0, 11), pinChangedAt: daysAgo(20 + i * 17) }));
  const accountOf = (u: (typeof store.users)[number]): UserAccount => {
    const st = accountState.get(u.id)!;
    return {
      id: u.id, name: u.name, role: u.role, initials: u.initials, color: u.color, phone: st.phone, active: st.active,
      lastLogin: u.lastLogin, pinChangedAt: st.pinChangedAt,
      bills30d: store.bills.filter((b) => b.cashier === u.name && b.status !== 'cancelled').length,
    };
  };
  let roles = seedRoles();
  let bundle = seedSettings(store);
  let seq = 100;

  return {
    /* bills */
    listSalesBills: (q = {}) => {
      const text = q.query?.trim().toLowerCase();
      const out: SalesBill[] = [];
      for (let i = store.bills.length - 1; i >= 0; i--) {
        const b = store.bills[i];
        const day = dayKey(b.at);
        if (q.from && day < q.from) continue;
        if (q.to && day > q.to) continue;
        if (q.counter && q.counter !== 'all' && b.counter !== q.counter) continue;
        if (q.cashier && q.cashier !== 'all' && b.cashier !== q.cashier) continue;
        if (q.status && q.status !== 'all' && b.status !== q.status) continue;
        if (q.mode && q.mode !== 'all' && !b.payments.some((p) => p.mode === q.mode)) continue;
        if (text && !(b.number.toLowerCase().includes(text) || b.customerName.toLowerCase().includes(text) || b.payments.some((p) => p.ref?.toLowerCase().includes(text)))) continue;
        out.push({ ...b, ...reasons[b.id] });
      }
      return delay(out);
    },
    salesFilterOptions: () =>
      delay({
        counters: [...new Set(store.bills.map((b) => b.counter))].sort(),
        cashiers: [...new Set(store.bills.map((b) => b.cashier))].sort(),
      }),

    /* customers */
    listCustomerRows: () => delay(store.customers.map(rowFor)),
    getCustomerProfile: (id) => {
      const c = store.customers.find((x) => x.id === id);
      if (!c) return delay(null);
      const bills = store.bills.filter((b) => b.customerId === id).reverse();
      const agg = new Map<string, FavouriteItem>();
      for (const b of bills) {
        if (b.status === 'cancelled' || b.status === 'returned') continue;
        for (const l of b.lines) {
          const cur = agg.get(l.itemId) ?? { itemId: l.itemId, name: l.name, unit: l.unit, qty: 0, amount: 0 };
          cur.qty += l.qty; cur.amount += l.amount;
          agg.set(l.itemId, cur);
        }
      }
      const favourites = [...agg.values()].sort((a, b) => b.amount - a.amount).slice(0, 5);
      return delay({ customer: rowFor(c), favourites, bills: bills.slice(0, 40) });
    },
    getCustomerWallet: (id) => {
      // Store credit: the customer's own credit notes refunded as "credit note", still with something left on them.
      const notes = (store.creditNotes ?? [])
        .filter((n) => n.customerId === id && n.refundMode === 'credit_note' && (n.balance ?? n.totals.grand) > 0)
        .map((n) => ({ number: n.number, at: n.at, balance: n.balance ?? n.totals.grand }));
      const storeCredit = notes.reduce((s, n) => s + n.balance, 0);
      const c = store.customers.find((x) => x.id === id);
      return delay({ points: c?.loyaltyPoints ?? 0, pointsValue: Math.round((c?.loyaltyPoints ?? 0) * bundle.loyalty.pointValue), storeCredit, creditNotes: notes, rules: bundle.loyalty, nextExpiry: null });
    },
    listPointsHistory: (id) => delay(pointsLedgerOf(id).slice(0, 100).map((r) => ({ at: r.at, kind: r.kind, points: r.points, note: r.note, by: r.by, bill: r.bill }))),
    getPointsLedger: (id, limit = 500) => delay(pointsLedgerOf(id).slice(0, limit)),
    pointsOverview: () => {
      const pos = store.customers.filter((c) => c.loyaltyPoints > 0);
      const outstanding = Math.round(pos.reduce((s, c) => s + c.loyaltyPoints * 100, 0)) / 100;
      const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
      const month = (kind: PointsKind) => Math.round(store.customers.flatMap((c) => pointsLedgerOf(c.id)).filter((r) => r.kind === kind && new Date(r.at) >= since).reduce((s, r) => s + r.points, 0) * 100) / 100;
      return delay({
        outstanding, netTotal: outstanding, negativeBalances: 0, negativePoints: 0, liability: Math.round(outstanding * bundle.loyalty.pointValue),
        customersWithPoints: pos.length, customers: store.customers.length, earnedMonth: month('earn'), redeemedMonth: -month('redeem'), expiredMonth: -month('expire'), adjustedMonth: month('adjust'),
        pointValue: bundle.loyalty.pointValue, expiryMonths: bundle.loyalty.expiryMonths, enabled: bundle.loyalty.enabled,
        expiring30: { points: 0, customers: 0 }, goLiveDate: bundle.loyalty.goLiveDate,
      });
    },
    listPointsCustomers: (q = {}) => {
      const filtered = pointsMatch(q);
      const key = (c: Customer): string | number => (q.sort === 'name' ? c.name.toLowerCase() : q.sort === 'code' ? c.id : q.sort === 'lastEarned' ? lastOf(c.id, 'earn') ?? '' : q.sort === 'lastRedeemed' ? lastOf(c.id, 'redeem') ?? '' : c.loyaltyPoints);
      const sign = q.dir === 'asc' ? 1 : -1;
      const sorted = [...filtered].sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * sign || a.id.localeCompare(b.id); });
      const off = q.offset ?? 0;
      const rows = sorted.slice(off, off + (q.limit && q.limit > 0 ? q.limit : 100)).map((c) => ({ id: c.id, name: c.name, phone: c.phone, area: c.area, points: c.loyaltyPoints, lastEarned: lastOf(c.id, 'earn'), lastRedeemed: lastOf(c.id, 'redeem'), expiresOn: null }));
      return delay({ rows, matched: filtered.length, total: store.customers.length });
    },
    pointsExpiring: (days = 30) => delay({ days, customers: 0, points: 0, rows: [] }),
    setLoyaltyGoLive: (date) => { bundle.loyalty.goLiveDate = date; return delay({ goLiveDate: date, lots: 0 }); },
    pointsReport: (q = {}) => {
      const to = q.to ?? dayKey(new Date());
      const from = q.from ?? `${to.slice(0, 8)}01`;
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const inRange = (r: PointsLedgerRow) => { const d = dayKey(r.at); return d >= from && d <= to; };
      const days = new Map<string, { date: string; earned: number; redeemed: number; expired: number; adjusted: number }>();
      for (const r of store.customers.flatMap((c) => pointsLedgerOf(c.id)).filter((x) => inRange(x) && x.kind !== 'import')) {
        const d = dayKey(r.at);
        const x = days.get(d) ?? { date: d, earned: 0, redeemed: 0, expired: 0, adjusted: 0 };
        if (r.kind === 'earn') x.earned += r.points; else if (r.kind === 'redeem') x.redeemed -= r.points; else if (r.kind === 'expire') x.expired -= r.points; else if (r.kind === 'adjust') x.adjusted += r.points;
        days.set(d, x);
      }
      const byDay = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ date: x.date, earned: r2(x.earned), redeemed: r2(x.redeemed), expired: r2(x.expired), adjusted: r2(x.adjusted) }));
      const holders = store.customers.filter((c) => c.loyaltyPoints > 0);
      const top = [...holders].sort((a, b) => b.loyaltyPoints - a.loyaltyPoints).slice(0, 25).map((c) => {
        const l = pointsLedgerOf(c.id).filter(inRange);
        return { id: c.id, name: c.name, phone: c.phone, points: c.loyaltyPoints, earned: r2(l.filter((r) => r.kind === 'earn').reduce((s, r) => s + r.points, 0)), redeemed: r2(-l.filter((r) => r.kind === 'redeem').reduce((s, r) => s + r.points, 0)) };
      });
      const out = r2(holders.reduce((s, c) => s + c.loyaltyPoints, 0));
      return delay({ from, to, byDay, top, liability: { outstanding: out, value: Math.round(out * bundle.loyalty.pointValue), customers: holders.length, pointValue: bundle.loyalty.pointValue } });
    },
    setCustomerCredit: (customerId, limit) => {
      const c = store.customers.find((x) => x.id === customerId);
      if (!c) return Promise.reject(new Error('Customer not found.'));
      c.creditLimit = limit;
      return delay(rowFor(c));
    },
    setCustomerActive: (customerId, active) => {
      const c = store.customers.find((x) => x.id === customerId);
      if (!c) return Promise.reject(new Error('Customer not found.'));
      c.active = active;
      return delay(rowFor(c));
    },
    saveCustomer: (input) => {
      const clean = { name: input.name.trim(), phone: input.phone.trim(), area: input.area.trim() };
      let c = input.id ? store.customers.find((x) => x.id === input.id) : undefined;
      if (c) {
        Object.assign(c, clean, { creditLimit: input.creditLimit });
        if (input.active !== undefined) c.active = input.active;
      } else {
        seq += 1;
        c = { id: `c${seq}`, ...clean, creditLimit: input.creditLimit, outstanding: 0, loyaltyPoints: 0, lastVisit: 'Today' };
        store.customers.unshift(c);
      }
      extras.set(c.id, {
        type: input.type, business: input.type === 'b2b' ? input.business?.trim() : undefined,
        gstin: input.gstin?.trim().toUpperCase() || undefined,
        email: input.email?.trim() || undefined, address: input.address?.trim() || undefined, notes: input.notes?.trim() || undefined,
        fatherName: input.fatherName?.trim() || undefined, dob: input.dob || undefined, anniversary: input.anniversary || undefined,
        pan: input.pan?.trim().toUpperCase() || undefined, locality: input.locality?.trim() || undefined, route: input.route?.trim() || undefined,
        creditDays: input.creditDays || 0, openingBalance: input.openingBalance || 0,
        since: extras.get(c.id)?.since ?? new Date().toISOString(),
      });
      return delay(rowFor(c));
    },

    /* credit */
    listReceivables: () => {
      const rows: ReceivableRow[] = [];
      for (const c of store.customers) {
        if (c.outstanding <= 0) continue;
        const l = ledgerOf(c);
        const buckets = bucketsOf(l);
        const open = l.invoices.filter((i) => i.open > 0);
        const lastPay = [...l.payments].sort((a, b) => b.date.localeCompare(a.date))[0];
        rows.push({
          customerId: c.id, name: c.name, business: extras.get(c.id)?.business, phone: c.phone, area: c.area,
          creditLimit: c.creditLimit, total: sumBuckets(buckets), buckets,
          oldestDays: open.length ? Math.max(...open.map((i) => ageDays(i.date))) : 0,
          lastPaymentAt: lastPay?.date, lastPaymentAmount: lastPay?.amount, lastReminderAt: l.lastReminderAt,
        });
      }
      return delay(rows.filter((r) => r.total > 0).sort((a, b) => b.total - a.total));
    },
    getStatement: (id) => {
      const c = store.customers.find((x) => x.id === id);
      return delay(c ? statementFor(c) : null);
    },
    recordCollection: (input) => {
      const c = store.customers.find((x) => x.id === input.customerId);
      if (!c) return Promise.reject(new Error('Customer not found'));
      if (!(input.amount > 0)) return Promise.reject(new Error('Enter an amount greater than zero'));
      const l = ledgerOf(c);
      if (input.amount > c.outstanding) return Promise.reject(new Error('Amount is more than the outstanding balance'));
      let left = input.amount;
      for (const inv of [...l.invoices].sort((a, b) => a.date.localeCompare(b.date))) {
        if (left <= 0) break;
        const take = Math.min(inv.open, left);
        inv.open -= take; left -= take;
      }
      c.outstanding -= input.amount;
      seq += 1;
      l.payments.push({
        id: `${c.id}-p${seq}`, date: new Date().toISOString(), ref: `RCPT-${String(seq).padStart(4, '0')}`,
        amount: input.amount, mode: input.mode, note: input.note || (input.mode === 'upi' ? `UPI ${input.ref ?? ''}`.trim() : 'Cash received'),
      });
      return delay(statementFor(c));
    },
    logReminder: (id) => {
      const c = store.customers.find((x) => x.id === id);
      if (c) ledgerOf(c).lastReminderAt = new Date().toISOString();
      return delay(undefined);
    },

    /* users and roles */
    listRoles: () => delay(clone(roles)),
    saveRoles: (next) => {
      roles = clone(next).map((r) => (r.id === 'owner' || r.id === 'admin' ? { ...r, perms: allOn(), pinFor: [], discountLimitPct: 100 } : r));
      return delay(clone(roles));
    },
    listUserAccounts: () => delay(store.users.map(accountOf)),
    saveUserAccount: (input) => {
      let u = input.id ? store.users.find((x) => x.id === input.id) : undefined;
      if (u) {
        u.name = input.name.trim(); u.role = input.role;
        if (input.pin) { u.pin = input.pin; accountState.get(u.id)!.pinChangedAt = new Date().toISOString(); }
      } else {
        seq += 1;
        const parts = input.name.trim().split(/\s+/);
        u = {
          id: `u${seq}`, name: input.name.trim(), role: input.role, pin: input.pin ?? '0000',
          initials: ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase(),
          color: ['#2563EB', '#DB2777', '#D97706', '#7C3AED'][seq % 4], lastLogin: 'Never',
        };
        store.users.push(u);
        accountState.set(u.id, { active: true, phone: '', pinChangedAt: new Date().toISOString() });
      }
      const st = accountState.get(u.id)!;
      st.active = input.active; st.phone = input.phone.trim();
      return delay(accountOf(u));
    },
    resetUserPin: (userId) => {
      const u = store.users.find((x) => x.id === userId);
      if (!u) return Promise.reject(new Error('User not found'));
      const pin = String(1000 + Math.floor(Math.random() * 8999));
      u.pin = pin;
      accountState.get(u.id)!.pinChangedAt = new Date().toISOString();
      return delay({ pin });
    },

    /* settings */
    getSettingsBundle: () => delay(clone({ ...bundle, tax: { ...bundle.tax, rates: mergeRateEntries(bundle.tax.rates) } })),
    saveSettingsBundle: (next) => {
      const rates = next.tax.rates.map((r) => r.rate);
      if (rates.some((r) => !rateOk(r))) return Promise.reject(new Error('A GST rate in the list is not valid. Use a percentage from 0 to 100 with at most two decimals.'));
      if (new Set(rates).size !== rates.length) return Promise.reject(new Error('A GST rate is listed twice.'));
      if (rates.length && !next.tax.rates.some((r) => r.enabled)) return Promise.reject(new Error('Keep at least one GST rate switched on.'));
      bundle = clone(next);
      bundle.tax.rates = mergeRateEntries(bundle.tax.rates);
      store.taxRates = enabledRates(bundle.tax.rates);
      store.settings.shopName = bundle.shop.name;
      store.settings.gstin = bundle.shop.gstin;
      store.settings.phone = bundle.shop.phone;
      store.settings.receiptFooter = bundle.billFormat.footer;
      store.settings.printer = bundle.printers.billPrinter;
      store.settings.roundToRupee = bundle.tax.roundToRupee;
      store.expenseLimit = bundle.expenses.limit;
      store.mill = bundle.mill;
      return delay(clone(bundle));
    },
    testPrint: (kind, printer) => {
      const p = bundle.printers.detected.find((d) => d.name === printer);
      if (!p || !p.ready) return delay({ ok: false, message: `${printer || 'Printer'} is not ready. Check the cable and that it has paper.` });
      return delay({ ok: true, message: kind === 'bill' ? `Test bill sent to ${printer}.` : `Test label sent to ${printer}.` });
    },
    getHardware: () => delay(clone(bundle.hardware)),
    printLabels: () => delay({ ok: true, message: 'Preview only: nothing is printed in the browser.' }),
    labelPreview: (ids, opts) => {
      // Browser preview only: a rough layout. The desktop app draws the exact one from the printing code.
      const preset = LABEL_PRESETS.find((p) => p.id === (opts?.preset ?? bundle.printers.labelPreset)) ?? LABEL_PRESETS[0];
      const w = opts?.width ?? preset.width, h = opts?.height ?? preset.height, cols = opts?.columns ?? preset.columns, cg = opts?.colGap ?? preset.colGap;
      const list = ids.map((id) => store.items.find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i);
      return delay({
        ok: true, message: '',
        spec: { widthMm: w, heightMm: h, gapMm: preset.gap, columns: cols, colGapMm: cg, cellW: w * 8, cellH: h * 8, colGapDots: cg * 8 },
        labels: list.map((i) => ({
          itemId: i.id,
          elements: [
            { k: 'text' as const, x: 12, y: 10, font: 2, xm: 1, ym: 1, text: i.name.slice(0, Math.floor((w * 8 - 24) / 12)) },
            { k: 'text' as const, x: 12, y: h * 8 - 40, font: 3, xm: 1, ym: 1, text: `Rs ${Math.round(i.price / 100)}` },
          ],
        })),
      });
    },
    printDocument: () => delay({ ok: true, message: 'Preview only: nothing is printed in the browser.' }),
    printerStatus: () => {
      const name = bundle.printers.billPrinter;
      const p = bundle.printers.detected.find((d) => d.name === name);
      return delay({ configured: !!name, ready: !!p?.ready, state: !name ? 'none' : p?.ready ? 'ready' : 'offline', name, mode: bundle.printers.mode, message: !name ? 'No printer chosen.' : p?.ready ? `${name} is ready` : `${name} is offline` });
    },
    backupNow: () => {
      seq += 1;
      const e: BackupEntry = { id: `bk${seq}`, at: new Date().toISOString(), sizeMb: 39.6, kind: 'manual', ok: true };
      bundle.backup.history.unshift(e);
      return delay(e);
    },
    backupStatus: () => {
      const last = bundle.backup.history.find((h) => h.ok);
      const ageHours = last ? (Date.now() - new Date(last.at).getTime()) / 3_600_000 : null;
      return delay({
        lastAt: last?.at ?? null, ageHours, stale: ageHours === null || ageHours > 24, lastError: null,
        schedule: bundle.backup.schedule, time: bundle.backup.time, location: bundle.backup.location, keep: bundle.backup.keep,
      });
    },
    restoreBackup: (id) => {
      const e = bundle.backup.history.find((h) => h.id === id);
      if (!e || !e.ok) return delay({ ok: false, message: 'That backup file is damaged and cannot be restored.' });
      return delay({ ok: true, message: 'Backup checked. Restart Gokul Office to finish restoring.' });
    },
  };
}

