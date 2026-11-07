/** Money is always integer paise. Quantity is always integer thousandths (milli-units). */
export type Paise = number;
export type Milli = number;

export type UnitCode = 'kg' | 'g' | 'l' | 'ml' | 'pc' | 'tin' | 'btl' | 'pkt';
export interface Unit { code: UnitCode; label: string; allowsDecimal: boolean }

export interface Category { id: string; name: string }
export interface Brand { id: string; name: string }

export interface Item {
  id: string;
  /** Short counter code typed by staff, e.g. 101 */
  code: string;
  barcode: string;
  name: string;
  nameTa?: string;
  categoryId: string;
  category: string;
  brand: string;
  unit: UnitCode;
  /** Sold by weight/volume at the counter (quantity is decimal). */
  loose: boolean;
  packSize?: string;
  /** How long it keeps: the default Exp date on its sticker (a number of shelfLifeUnit); unset = blank Exp */
  shelfLife?: number;
  shelfLifeUnit?: 'days' | 'months';
  hsn: string;
  gstRate: 0 | 5 | 12 | 18;
  /** MRP per unit, GST inclusive */
  mrp: Paise;
  /** Selling price per unit, GST inclusive */
  price: Paise;
  cost: Paise;
  /** Optional wholesale price per unit, GST inclusive: used when a bill is switched to wholesale mode */
  wholesalePrice?: Paise;
  stock: Milli;
  reorderLevel: Milli;
  active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  area: string;
  creditLimit: Paise;
  outstanding: Paise;
  loyaltyPoints: number;
  lastVisit: string;
}

/** credit_note = store credit (a credit note spent in parts); points = loyalty points redeemed */
export type PayMode = 'cash' | 'upi' | 'card' | 'credit' | 'credit_note' | 'points' | 'sodexo';
export interface Payment { mode: PayMode; amount: Paise; ref?: string }

export interface BillLine {
  itemId: string;
  code: string;
  name: string;
  unit: UnitCode;
  qty: Milli;
  rate: Paise;
  /** Line discount in paise */
  discount: Paise;
  gstRate: number;
  /** Final line amount incl. GST after discount */
  amount: Paise;
}

export interface GstSlab { rate: number; taxable: Paise; cgst: Paise; sgst: Paise }

export interface BillTotals {
  itemCount: number;
  qtyCount: number;
  gross: Paise;
  discount: Paise;
  taxable: Paise;
  gst: Paise;
  slabs: GstSlab[];
  beforeRound: Paise;
  roundOff: Paise;
  grand: Paise;
}

/** Round 4: per-bill extras shared by a draft, a held bill and a saved bill. All optional. */
export interface BillExtras {
  /** Salesman / staff attached to the bill */
  staff?: string;
  deliveryAddress?: string;
  deliveryLocality?: string;
  /** Home delivery charge, paise: billed as a "Delivery charge" line (GST rate from settings.deliveryGstRate) */
  deliveryCharge?: Paise;
  /** Bill uses wholesale prices */
  wholesale?: boolean;
  /** Cash discount on the whole bill, percent x 100 (250 = 2.5%). Separate from item discounts. */
  cashDiscBps?: number;
  /** Saved cash discount in paise (already inside the bill-level discount) */
  cashDisc?: Paise;
  remarks?: string;
}

export interface Bill extends BillExtras {
  id: string;
  number: string;
  at: string; // ISO
  cashier: string;
  counter: string;
  customerId?: string;
  customerName: string;
  lines: BillLine[];
  totals: BillTotals;
  payments: Payment[];
  status: 'paid' | 'credit' | 'cancelled' | 'returned';
}

export interface BillDraft extends BillExtras {
  customerId?: string;
  customerName?: string;
  lines: BillLine[];
  billDiscount: Paise;
  payments: Payment[];
  cashier?: string;
  /** Manager or owner PIN: needed for a discount above the role limit, a changed price or credit above the customer limit. */
  managerPin?: string;
}

export interface HeldBill extends BillExtras {
  id: string;
  at: string;
  customerName: string;
  lines: BillLine[];
  billDiscount: Paise;
  customerId?: string;
  total: Paise;
}

export type Role = 'owner' | 'manager' | 'cashier';
export interface User {
  id: string; name: string; role: Role; initials: string; pin: string; color: string; lastLogin: string;
  /** Seconds left on a PIN lockout (5 wrong PINs lock the user for 60 s); absent when not locked. */
  lockedForSecs?: number;
}

export interface Shift { id: string; userId: string; counter: string; openedAt: string; openingCash: Paise }

export interface Supplier { id: string; name: string; phone: string; city: string; gstin: string; outstanding: Paise }

export interface PurchaseLine { itemId: string; name: string; qty: Milli; cost: Paise }
export interface Purchase {
  id: string; number: string; date: string; supplierId: string; supplierName: string;
  lines: PurchaseLine[]; total: Paise; paid: Paise;
}

export interface StockMovement {
  id: string; at: string; itemId: string; itemName: string;
  kind: 'sale' | 'purchase' | 'adjustment' | 'production' | 'return';
  qty: Milli; note: string;
}

export interface ProductionBatch {
  id: string; date: string; seed: string; seedKg: number; oil: string; oilL: number; cakeKg: number; status: 'done' | 'running';
}

export interface Settings {
  shopName: string; address: string; gstin: string; phone: string;
  counter: string; billPrefix: string; receiptFooter: string;
  printer: string; roundToRupee: boolean;
  /** GST percent on a home-delivery charge (0 = delivery is not taxed) */
  deliveryGstRate?: number;
}

export interface DaySummary { date: string; sales: Paise; bills: number }
export interface DashboardStats {
  todaySales: Paise; yesterdaySales: Paise;
  todayBills: number; yesterdayBills: number;
  avgBill: Paise; yesterdayAvg: Paise;
  cash: Paise; upi: Paise; card: Paise; credit: Paise;
  last30: DaySummary[];
}
export interface TopItem { itemId: string; name: string; qty: Milli; unit: UnitCode; amount: Paise }

export interface BillFilter { from?: string; to?: string; query?: string; limit?: number }
