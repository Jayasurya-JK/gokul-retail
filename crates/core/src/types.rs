//! Wire types. Field names match packages/data/src/types.ts (camelCase in JSON) so screens never change.
//! Money is i64 paise; quantity is i64 milli-units.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub code: String,
    pub barcode: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name_ta: Option<String>,
    pub category_id: String,
    pub category: String,
    pub brand: String,
    pub unit: String,
    pub loose: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pack_size: Option<String>,
    /// How long the item keeps (number of `shelf_life_unit`); the default Exp date on its sticker. None = not set.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shelf_life: Option<i64>,
    /// "days" or "months"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shelf_life_unit: Option<String>,
    pub hsn: String,
    /// GST percent, e.g. 5 or 0.25. Whole rates travel as integers.
    #[serde(with = "rate_serde")]
    pub gst_rate: f64,
    /// Optional cess percent on top of GST (0 = none).
    #[serde(default, skip_serializing_if = "rate_is_zero", with = "rate_serde")]
    pub cess_rate: f64,
    pub mrp: i64,
    pub price: i64,
    pub cost: i64,
    pub stock: i64,
    pub reorder_level: i64,
    pub active: bool,
    /// Optional wholesale price per unit (GST inclusive), used when a bill is switched to wholesale mode.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wholesale_price: Option<i64>,
    /// Default supplier (id and name), when linked.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supplier_id: Option<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub supplier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Customer {
    pub id: String,
    pub name: String,
    pub phone: String,
    pub area: String,
    pub credit_limit: i64,
    pub outstanding: i64,
    /// Points with two decimals (the database holds hundredths).
    pub loyalty_points: f64,
    pub last_visit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Payment {
    pub mode: String, // cash | upi | card | credit | credit_note
    pub amount: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r#ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BillLine {
    pub item_id: String,
    pub code: String,
    pub name: String,
    pub unit: String,
    pub qty: i64,
    pub rate: i64,
    pub discount: i64,
    #[serde(with = "rate_serde")]
    pub gst_rate: f64,
    /// Cess percent on this line (0 = none). The price already includes it.
    #[serde(default, skip_serializing_if = "rate_is_zero", with = "rate_serde")]
    pub cess_rate: f64,
    pub amount: i64,
}

/// One GST rate on a bill: taxable value and the tax on it. Intra-state supply fills cgst and sgst (half each);
/// inter-state fills igst (the full rate). Cess is shown beside it and is not part of `gst`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GstSlab {
    #[serde(with = "rate_serde")]
    pub rate: f64,
    pub taxable: i64,
    pub cgst: i64,
    pub sgst: i64,
    #[serde(default)]
    pub igst: i64,
    #[serde(default)]
    pub cess: i64,
}

/// Percent rates on the wire: a whole rate is an integer (5), a fractional one a decimal (0.25).
pub mod rate_serde {
    use serde::{Deserialize, Deserializer, Serializer};
    pub fn serialize<S: Serializer>(v: &f64, s: S) -> Result<S::Ok, S::Error> {
        if v.fract() == 0.0 && v.abs() < 1e9 {
            s.serialize_i64(*v as i64)
        } else {
            s.serialize_f64(*v)
        }
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<f64, D::Error> {
        f64::deserialize(d)
    }
}

pub fn rate_is_zero(v: &f64) -> bool {
    *v == 0.0
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BillTotals {
    pub item_count: i64,
    pub qty_count: i64,
    pub gross: i64,
    pub discount: i64,
    pub taxable: i64,
    /// Total GST (CGST + SGST + IGST), cess not included.
    pub gst: i64,
    /// Total cess.
    #[serde(default)]
    pub cess: i64,
    pub slabs: Vec<GstSlab>,
    pub before_round: i64,
    pub round_off: i64,
    pub grand: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bill {
    pub id: String,
    pub number: String,
    pub at: String,
    pub cashier: String,
    pub counter: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
    pub customer_name: String,
    pub lines: Vec<BillLine>,
    pub totals: BillTotals,
    pub payments: Vec<Payment>,
    pub status: String, // paid | credit | cancelled | returned
    #[serde(flatten)]
    pub extras: BillExtras,
}

/// Round 4 per-bill extras, shared by a draft, a held bill and a saved bill.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BillExtras {
    /// Salesman / staff attached to the bill.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub staff: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub delivery_address: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub delivery_locality: String,
    /// Home-delivery charge in paise; becomes a "Delivery charge" line (GST rate from settings, 0 by default).
    #[serde(default, skip_serializing_if = "is_zero")]
    pub delivery_charge: i64,
    /// Bill uses wholesale prices.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub wholesale: bool,
    /// Paise of this bill paid with exchange credit (a returned bill's credit note). Part of the credit-note payments, not store credit.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub exchange_credit: i64,
    /// Cash discount on the whole bill, percent x 100 (250 = 2.5%). Separate from item discounts.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub cash_disc_bps: i64,
    /// Cash discount in paise as saved (already part of the bill-level discount).
    #[serde(default, skip_serializing_if = "is_zero")]
    pub cash_disc: i64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub remarks: String,
    /// Exchange credit was larger than this bill: the difference handed back to the customer (needs a manager PIN).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exchange_refund: Option<ExchangeRefund>,
}

/// The part of an exchange credit given back in cash or UPI because the new bill was smaller.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeRefund {
    /// "cash" or "upi"
    pub mode: String,
    pub amount: i64,
    /// Number of the exchange credit note this comes from
    pub credit_note: String,
}

fn is_zero(v: &i64) -> bool {
    *v == 0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillDraft {
    #[serde(default)]
    pub customer_id: Option<String>,
    #[serde(default)]
    pub customer_name: Option<String>,
    pub lines: Vec<BillLine>,
    #[serde(default)]
    pub bill_discount: i64,
    #[serde(default)]
    pub payments: Vec<Payment>,
    #[serde(default)]
    pub cashier: Option<String>,
    /// Manager or owner PIN for a discount above the role limit, a changed price or credit above the customer limit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manager_pin: Option<String>,
    #[serde(flatten)]
    pub extras: BillExtras,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeldBill {
    pub id: String,
    pub at: String,
    pub customer_name: String,
    pub lines: Vec<BillLine>,
    pub bill_discount: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
    pub total: i64,
    #[serde(flatten)]
    pub extras: BillExtras,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub name: String,
    pub role: String,
    pub initials: String,
    /// Always empty: PINs are stored hashed and never leave the database.
    pub pin: String,
    pub color: String,
    pub last_login: String,
    /// Seconds left on a PIN lockout (after too many wrong PINs); absent when the user is not locked.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locked_for_secs: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shift {
    pub id: String,
    pub user_id: String,
    pub counter: String,
    pub opened_at: String,
    pub opening_cash: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub shop_name: String,
    pub address: String,
    pub gstin: String,
    pub phone: String,
    pub counter: String,
    pub bill_prefix: String,
    pub receipt_footer: String,
    pub printer: String,
    pub round_to_rupee: bool,
    /// GST percent on a home-delivery charge (any allowed rate; 0 = delivery is not taxed).
    #[serde(default, with = "rate_serde")]
    pub delivery_gst_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockMovement {
    pub id: String,
    pub at: String,
    pub item_id: String,
    pub item_name: String,
    pub kind: String, // sale | purchase | adjustment | production | return
    pub qty: i64,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaySummary {
    pub date: String,
    pub sales: i64,
    pub bills: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub today_sales: i64,
    pub yesterday_sales: i64,
    pub today_bills: i64,
    pub yesterday_bills: i64,
    pub avg_bill: i64,
    pub yesterday_avg: i64,
    pub cash: i64,
    pub upi: i64,
    pub card: i64,
    pub credit: i64,
    pub last30: Vec<DaySummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopItem {
    pub item_id: String,
    pub name: String,
    pub qty: i64,
    pub unit: String,
    pub amount: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillFilter {
    pub from: Option<String>,
    pub to: Option<String>,
    pub query: Option<String>,
    pub limit: Option<i64>,
}

// ---------- Shift area ----------

pub type DenomCounts = BTreeMap<String, i64>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayStatus {
    pub open: bool,
    pub shift: Option<Shift>,
    pub suggested_float: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_closed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashEntry {
    pub id: String,
    pub at: String,
    pub kind: String, // in | out
    pub reason: String,
    pub amount: i64,
    pub note: String,
    pub by: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashEntryInput {
    pub kind: String,
    pub reason: String,
    pub amount: i64,
    #[serde(default)]
    pub note: String,
    pub by: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeTotals {
    pub cash: i64,
    pub upi: i64,
    pub card: i64,
    pub credit: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShiftSummary {
    pub at: String,
    pub counter: String,
    pub opened_at: String,
    pub opened_by: String,
    pub opening_cash: i64,
    pub bill_count: i64,
    pub item_count: i64,
    pub sales: i64,
    pub by_mode: ModeTotals,
    pub returns_count: i64,
    pub returns_amount: i64,
    pub cancel_count: i64,
    pub cancel_amount: i64,
    pub cash_in: i64,
    pub cash_out: i64,
    pub discounts: i64,
    pub taxable: i64,
    pub cgst: i64,
    pub sgst: i64,
    pub slabs: Vec<GstSlab>,
    /// Expenses paid from the drawer during the shift (voided ones excluded); already taken off `expected_cash`
    #[serde(default)]
    pub expenses_cash: i64,
    #[serde(default)]
    pub expenses_count: i64,
    /// Part of `cash_in`: customer credit collections taken in cash.
    #[serde(default)]
    pub collections_cash: i64,
    /// Part of `cash_out`: supplier payments paid from the drawer.
    #[serde(default)]
    pub supplier_cash: i64,
    /// Cash given back: cash refunds on returns plus cash paid back for bills cancelled from an earlier shift.
    #[serde(default)]
    pub cash_refunds: i64,
    /// Expenses paid by UPI or bank (they never touch the drawer) and how many.
    #[serde(default)]
    pub expenses_other: i64,
    #[serde(default)]
    pub expenses_other_count: i64,
    /// Expenses by category: how many, paid from the drawer, paid another way.
    #[serde(default)]
    pub expense_lines: Vec<ExpenseLine>,
    /// Opening + cash sales + cash in - cash out - cash refunds - cash expenses.
    pub expected_cash: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseLine {
    pub category: String,
    pub count: i64,
    pub cash: i64,
    pub other: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZReport {
    pub number: String,
    pub closed_at: String,
    pub closed_by: String,
    pub approved_by: String,
    pub counted: i64,
    pub expected: i64,
    pub difference: i64,
    pub counts: DenomCounts,
    pub summary: ShiftSummary,
}

// ---------- Bill operations ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditNote {
    pub id: String,
    pub number: String,
    pub at: String,
    pub bill_id: String,
    pub bill_number: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
    pub customer_name: String,
    pub lines: Vec<BillLine>,
    pub totals: BillTotals,
    pub reason: String,
    pub refund_mode: String, // cash | upi | credit_note | exchange
    pub by: String,
    /// What is still unused on this note (grand minus used); only an exchange or store-credit note has any left.
    #[serde(default)]
    pub balance: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelInfo {
    pub reason: String,
    pub by: String,
    pub approved_by: String,
    pub at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillDetail {
    pub bill: Bill,
    pub returned: Vec<i64>,
    pub credit_notes: Vec<CreditNote>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancel: Option<CancelInfo>,
    pub reprints: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillSearch {
    pub date: String,
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub all_days: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelRequest {
    pub bill_id: String,
    pub reason: String,
    pub manager_pin: String,
    pub by: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReturnPick {
    pub line_index: i64,
    pub qty: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReturnRequest {
    pub bill_id: String,
    pub picks: Vec<ReturnPick>,
    pub reason: String,
    pub refund_mode: String,
    pub by: String,
    /// Manager or owner PIN, needed when the signed-in role has to ask for approval to give a refund.
    #[serde(default)]
    pub manager_pin: String,
}
