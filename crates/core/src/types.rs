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
    pub hsn: String,
    pub gst_rate: i64,
    pub mrp: i64,
    pub price: i64,
    pub cost: i64,
    pub stock: i64,
    pub reorder_level: i64,
    pub active: bool,
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
    pub gst_rate: i64,
    pub amount: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GstSlab {
    pub rate: i64,
    pub taxable: i64,
    pub cgst: i64,
    pub sgst: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BillTotals {
    pub item_count: i64,
    pub qty_count: i64,
    pub gross: i64,
    pub discount: i64,
    pub taxable: i64,
    pub gst: i64,
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
