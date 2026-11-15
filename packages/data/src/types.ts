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
  /** GST percent, e.g. 5 or 0.25. Must be one of the owner's rates (Settings, Tax). */
  gstRate: number;
  /** Optional cess percent on top of GST (0 / absent = none) */
  cessRate?: number;
  /** MRP per unit, GST inclusive */
  mrp: Paise;
  /** Selling price per unit, GST inclusive */
  price: Paise;
  cost: Paise;
  /** Optional wholesale price per unit, GST inclusive: used when a bill is switched to wholesale mode */
  wholesalePrice?: Paise;
  /** Default supplier (from the POSBean link or the item editor) */
  supplierId?: string;
  supplier?: string;
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
  /** GSTIN of a registered (B2B) customer; absent for a consumer */
  gstin?: string;
  /** GST state code of the customer ("33"); absent = not recorded (billed as local) */
  stateCode?: string;
  /** False = switched off: not offered at the counter, cannot go on a new bill. Missing means active. */
  active?: boolean;
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
  /** Cess percent on this line (price already includes it); absent = none */
  cessRate?: number;
  /** Final line amount incl. GST after discount */
  amount: Paise;
  /** HSN code as it was when the bill was written (filled when the bill is saved) */
  hsn?: string;
  /** The line's tax split (saved bills and credit notes only) */
  tax?: LineTax;
}

/** The tax split of one line, in paise. taxable + cgst + sgst + igst + cess = the line's final amount. */
export interface LineTax { taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; cess: Paise }

/** One GST rate on a bill. Intra-state fills cgst + sgst (half each); inter-state fills igst (the full rate). Cess is shown beside it. */
export interface GstSlab { rate: number; taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; cess: Paise }

export interface BillTotals {
  itemCount: number;
  qtyCount: number;
  gross: Paise;
  discount: Paise;
  taxable: Paise;
  /** Total GST (CGST + SGST + IGST), cess not included */
  gst: Paise;
  /** Total cess */
  cess: Paise;
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
  /** Exchange credit was bigger than this bill: the rest goes back to the customer in cash or UPI (needs a manager PIN) */
  exchangeRefund?: ExchangeRefund;
  /** Paise of this bill paid with exchange credit. It is a credit-note payment too, but not store credit. */
  exchangeCredit?: Paise;
  /**
   * GST state code of the place of supply. On a draft: the state the cashier chose (absent = from the customer, else the shop's own
   * state). On a saved bill: where the supply was made.
   */
  placeOfSupply?: string;
  /** Saved bills: "intra" (CGST + SGST) or "inter" (IGST), worked out by the server. */
  supplyType?: 'intra' | 'inter';
  /** Saved bills: the recipient's GSTIN as it was when the bill was written (absent = consumer bill) */
  customerGstin?: string;
  /** Saved bills: the recipient's address as it was when the bill was written */
  customerAddress?: string;
}

/** The part of an exchange credit handed back because the new bill was smaller */
export interface ExchangeRefund { mode: 'cash' | 'upi'; amount: Paise; /** number of the exchange credit note */ creditNote: string }

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

export type Role = 'owner' | 'admin' | 'manager' | 'staff' | 'cashier';
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
  /** The shop's GST state code ("33" = Tamil Nadu), from Settings */
  stateCode?: string;
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
