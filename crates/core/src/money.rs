//! Port of packages/data/src/money.ts. Same integer maths, same rounding as JavaScript's `Math.round`
//! (half toward +infinity). The shared fixtures in tests/fixtures/money_cases.json prove both agree.

use crate::types::{BillLine, BillTotals, GstSlab, ReturnPick};
use std::collections::BTreeMap;

/// `Math.round(n / d)` for d > 0, exactly, in integers.
pub fn round_div(n: i128, d: i128) -> i128 {
    (2 * n + d).div_euclid(2 * d)
}

/// `Math.floor(n / d)` for d > 0.
pub fn floor_div(n: i128, d: i128) -> i128 {
    n.div_euclid(d)
}

/// gross amount for rate (paise per unit) x qty (milli-units)
pub fn line_gross(rate: i64, qty: i64) -> i64 {
    round_div(rate as i128 * qty as i128, 1000) as i64
}

/// Re-derive a line's discount and amount from rate, qty and the requested discount.
pub fn recalc_line(l: &BillLine) -> BillLine {
    let gross = line_gross(l.rate, l.qty);
    let d = l.discount.min(gross);
    BillLine { discount: d, amount: gross - d, ..l.clone() }
}

/// Bill totals in integer paise. Bill-level discount is spread pro-rata over lines (remainder to the
/// last line) so GST slabs stay exact. Round-off to a whole rupee when `round_to_rupee`.
pub fn compute_totals(lines: &[BillLine], bill_discount: i64, round_to_rupee: bool) -> BillTotals {
    let gross_all: i64 = lines.iter().map(|l| line_gross(l.rate, l.qty)).sum();
    let line_net: Vec<i64> = lines.iter().map(|l| l.amount).collect();
    let net_sum: i64 = line_net.iter().sum();
    let bd = bill_discount.min(net_sum);
    let mut allocated: i64 = 0;
    let n = line_net.len();
    let finals: Vec<i64> = line_net
        .iter()
        .enumerate()
        .map(|(i, &net)| {
            let mut share = if net_sum == 0 { 0 } else { floor_div(bd as i128 * net as i128, net_sum as i128) as i64 };
            if i == n - 1 {
                share = bd - allocated;
            }
            allocated += share;
            net - share
        })
        .collect();

    let mut slab_map: BTreeMap<i64, (i64, i64)> = BTreeMap::new(); // rate -> (taxable, gst)
    for (l, &fin) in lines.iter().zip(finals.iter()) {
        let taxable = round_div(fin as i128 * 100, 100 + l.gst_rate as i128) as i64;
        let cur = slab_map.entry(l.gst_rate).or_insert((0, 0));
        cur.0 += taxable;
        cur.1 += fin - taxable;
    }
    let slabs: Vec<GstSlab> = slab_map
        .into_iter()
        .map(|(rate, (taxable, gst))| {
            let cgst = floor_div(gst as i128, 2) as i64;
            GstSlab { rate, taxable, cgst, sgst: gst - cgst }
        })
        .collect();

    let before_round: i64 = finals.iter().sum();
    let grand = if round_to_rupee { round_div(before_round as i128, 100) as i64 * 100 } else { before_round };
    let line_disc: i64 = lines.iter().map(|l| l.discount).sum();
    BillTotals {
        item_count: lines.len() as i64,
        qty_count: lines.iter().map(|l| l.qty).sum(),
        gross: gross_all,
        discount: line_disc + bd,
        taxable: slabs.iter().map(|s| s.taxable).sum(),
        gst: slabs.iter().map(|s| s.cgst + s.sgst).sum(),
        slabs,
        before_round,
        round_off: grand - before_round,
        grand,
    }
}

/// Cash discount in paise: `bps` (percent x 100) of the net of the item lines (after item discounts), rounded to the paisa.
pub fn cash_discount(lines: &[BillLine], bps: i64) -> i64 {
    if bps <= 0 {
        return 0;
    }
    let net: i64 = lines.iter().map(|l| l.amount).sum();
    round_div(net as i128 * bps as i128, 10000) as i64
}

/// Totals for item lines plus an optional home-delivery charge. The bill-level discount is spread over the item lines only;
/// the delivery charge is a separate taxable amount at `delivery_gst` percent (0 = no GST), merged into the GST slabs.
/// With no delivery charge this is exactly `compute_totals`.
pub fn compute_totals_with_delivery(lines: &[BillLine], bill_discount: i64, round_to_rupee: bool, delivery: i64, delivery_gst: i64) -> BillTotals {
    if delivery <= 0 {
        return compute_totals(lines, bill_discount, round_to_rupee);
    }
    let mut t = compute_totals(lines, bill_discount, false);
    let taxable = round_div(delivery as i128 * 100, 100 + delivery_gst as i128) as i64;
    let gst = delivery - taxable;
    let mut per: BTreeMap<i64, (i64, i64)> = t.slabs.iter().map(|s| (s.rate, (s.taxable, s.cgst + s.sgst))).collect();
    let e = per.entry(delivery_gst).or_insert((0, 0));
    e.0 += taxable;
    e.1 += gst;
    t.slabs = per
        .into_iter()
        .map(|(rate, (taxable, gst))| {
            let cgst = floor_div(gst as i128, 2) as i64;
            GstSlab { rate, taxable, cgst, sgst: gst - cgst }
        })
        .collect();
    t.gross += delivery;
    t.taxable = t.slabs.iter().map(|s| s.taxable).sum();
    t.gst = t.slabs.iter().map(|s| s.cgst + s.sgst).sum();
    t.before_round += delivery;
    t.grand = if round_to_rupee { round_div(t.before_round as i128, 100) as i64 * 100 } else { t.before_round };
    t.round_off = t.grand - t.before_round;
    t
}

/// Port of `quoteReturn` (billops.ts): each returned line refunds its own (discounted) amount pro-rata,
/// plus its share of any bill-level discount, then GST is reversed with the same slab rules as a bill.
pub fn quote_return(
    bill_lines: &[BillLine],
    bill_discount_total: i64,
    picks: &[ReturnPick],
    round_to_rupee: bool,
) -> (Vec<BillLine>, BillTotals) {
    let mut lines: Vec<BillLine> = Vec::new();
    for p in picks {
        let Some(l) = usize::try_from(p.line_index).ok().and_then(|i| bill_lines.get(i)) else { continue };
        if p.qty <= 0 || l.qty <= 0 {
            continue;
        }
        let qty = p.qty.min(l.qty);
        let amount = if qty == l.qty { l.amount } else { round_div(l.amount as i128 * qty as i128, l.qty as i128) as i64 };
        let mut nl = l.clone();
        nl.qty = qty;
        nl.amount = amount;
        nl.discount = (line_gross(l.rate, qty) - amount).max(0);
        lines.push(nl);
    }
    let line_disc: i64 = bill_lines.iter().map(|l| l.discount).sum();
    let bill_disc = (bill_discount_total - line_disc).max(0);
    let bill_net: i64 = bill_lines.iter().map(|l| l.amount).sum();
    let ret_net: i64 = lines.iter().map(|l| l.amount).sum();
    let share = if bill_net > 0 { round_div(bill_disc as i128 * ret_net as i128, bill_net as i128) as i64 } else { 0 };
    let totals = if lines.is_empty() {
        // The TS version would index an empty array; an empty quote is simply all zero.
        BillTotals::default()
    } else {
        compute_totals(&lines, share, round_to_rupee)
    };
    (lines, totals)
}
